package com.noon.order.service;

import com.noon.order.api.dto.OrderDtos.*;
import com.noon.order.client.CatalogClient;
import com.noon.order.client.CatalogClient.CatalogProduct;
import com.noon.order.domain.*;
import com.noon.order.error.ApiException;
import com.noon.order.repository.IdempotencyKeyRepository;
import com.noon.order.repository.OrderRepository;
import com.noon.order.repository.OutboxRepository;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.stream.Collectors;

@Service
public class OrderService {

    private static final Logger log = LoggerFactory.getLogger(OrderService.class);
    private static final String AGGREGATE = "order";

    private final OrderRepository orders;
    private final OutboxRepository outbox;
    private final IdempotencyKeyRepository idempotency;
    private final CatalogClient catalog;

    private final String orderTopic;
    private final String notificationTopic;
    private final long freeShippingThreshold;
    private final long shippingFee;
    private final int vatPercent;

    private final Counter createdCounter;
    private final Counter rejectedCounter;

    public OrderService(OrderRepository orders,
                        OutboxRepository outbox,
                        IdempotencyKeyRepository idempotency,
                        CatalogClient catalog,
                        MeterRegistry metrics,
                        @Value("${noon.topics.order-events}") String orderTopic,
                        @Value("${noon.topics.notifications}") String notificationTopic,
                        @Value("${noon.order.free-shipping-threshold-minor:10000}") long freeShippingThreshold,
                        @Value("${noon.order.shipping-fee-minor:1500}") long shippingFee,
                        @Value("${noon.order.vat-percent:5}") int vatPercent) {
        this.orders = orders;
        this.outbox = outbox;
        this.idempotency = idempotency;
        this.catalog = catalog;
        this.orderTopic = orderTopic;
        this.notificationTopic = notificationTopic;
        this.freeShippingThreshold = freeShippingThreshold;
        this.shippingFee = shippingFee;
        this.vatPercent = vatPercent;
        this.createdCounter = Counter.builder("noon.orders").tag("result", "created").register(metrics);
        this.rejectedCounter = Counter.builder("noon.orders").tag("result", "rejected").register(metrics);
    }

    // ---------------------------------------------------------------- create

    /**
     * إنشاء طلب.
     *
     * <p>كل شيء في معاملة واحدة: الطلب + الأسطر + مفتاح الـ idempotency +
     * صف الـ outbox. إما أن ينجح الكل أو لا شيء — لا يوجد طلب بلا حدث،
     * ولا حدث بلا طلب.
     *
     * <p>نرد بـ {@code 202 Accepted} وحالة {@code PENDING}: باقي الـ Saga
     * (المخزون ثم الدفع) يجري غير متزامن، وهو ما يجعل المسار يتحمّل ذروة
     * White Friday — الحِمل يستوعبه Kafka لا قاعدة البيانات.
     */
    @Transactional
    public OrderView create(UUID userId, CreateOrderRequest req,
                            String idempotencyKey, String traceId, String locale) {

        // 1) طلب مكرر؟ نعيد نفس النتيجة بدل إنشاء طلب ثانٍ
        if (idempotencyKey != null && !idempotencyKey.isBlank()) {
            Optional<IdempotencyKey> existing = idempotency.findById(idempotencyKey);
            if (existing.isPresent()) {
                IdempotencyKey k = existing.get();
                if (!k.getUserId().equals(userId)) {
                    throw ApiException.forbidden("IDEMPOTENCY_KEY_CONFLICT",
                            "This idempotency key belongs to another user");
                }
                log.info("idempotent replay key={} orderId={}", idempotencyKey, k.getOrderId());
                return orders.findWithItemsById(k.getOrderId())
                        .map(OrderView::of)
                        .orElseThrow(() -> ApiException.notFound("ORDER_NOT_FOUND",
                                "Order referenced by idempotency key no longer exists"));
            }
        }

        // 2) دمج الأسطر المكررة لنفس الـ sku
        Map<String, Integer> quantities = new LinkedHashMap<>();
        for (var line : req.items()) {
            quantities.merge(line.sku(), line.quantity(), Integer::sum);
        }

        // 3) الأسعار من الكتالوج — لا من العميل
        List<CatalogProduct> products;
        try {
            products = catalog.fetchBySkus(new ArrayList<>(quantities.keySet()), locale);
        } catch (Exception e) {
            log.error("catalog lookup failed — refusing to create order", e);
            throw new ApiException(org.springframework.http.HttpStatus.SERVICE_UNAVAILABLE,
                    "CATALOG_UNAVAILABLE",
                    "Cannot verify prices right now — please try again shortly");
        }

        Map<String, CatalogProduct> bySku = products.stream()
                .collect(Collectors.toMap(CatalogProduct::sku, p -> p, (a, b) -> a));

        List<String> missing = quantities.keySet().stream()
                .filter(sku -> !bySku.containsKey(sku)).toList();
        if (!missing.isEmpty()) {
            rejectedCounter.increment();
            throw ApiException.badRequest("PRODUCT_UNAVAILABLE",
                    "These products are no longer available: " + String.join(", ", missing));
        }

        // 4) بناء الطلب
        String currency = products.get(0).currency();
        boolean mixedCurrency = products.stream().anyMatch(p -> !currency.equals(p.currency()));
        if (mixedCurrency) {
            throw ApiException.badRequest("MIXED_CURRENCY",
                    "All items in an order must share the same currency");
        }

        Order order = new Order(nextOrderNumber(), userId, currency,
                req.shippingAddress(), req.paymentMethod());

        for (var entry : quantities.entrySet()) {
            CatalogProduct p = bySku.get(entry.getKey());
            order.addItem(new OrderItem(p.sku(), p.title(), p.image(),
                    p.priceMinor(), entry.getValue(), null));
        }

        long subtotal = order.getItems().stream()
                .mapToLong(OrderItem::lineTotalMinor).sum();
        long shipping = subtotal >= freeShippingThreshold ? 0 : shippingFee;
        long discount = resolveDiscount(req.couponCode(), subtotal);
        order.recalculateTotals(shipping, vatPercent, discount);

        Order saved;
        try {
            saved = orders.saveAndFlush(order);
        } catch (DataIntegrityViolationException e) {
            throw ApiException.conflict("ORDER_NUMBER_CONFLICT", "Please retry the request");
        }

        // 5) مفتاح الـ idempotency — نفس المعاملة
        if (idempotencyKey != null && !idempotencyKey.isBlank()) {
            idempotency.save(new IdempotencyKey(idempotencyKey, userId, saved.getId()));
        }

        // 6) صف الـ outbox — نفس المعاملة أيضًا
        outbox.save(new OutboxEvent(AGGREGATE, saved.getId().toString(), "order.created",
                orderTopic, orderCreatedPayload(saved), traceId));

        createdCounter.increment();
        log.info("order created id={} number={} userId={} total={} {}",
                saved.getId(), saved.getOrderNumber(), userId,
                saved.getTotalMinor(), saved.getCurrency());

        return OrderView.of(saved);
    }

    // ------------------------------------------------------- saga transitions

    /** المخزون حُجز بنجاح ⇒ اطلب الدفع. */
    @Transactional
    public void onInventoryReserved(UUID orderId, String traceId) {
        Order order = load(orderId);
        if (!order.transitionTo(OrderStatus.AWAITING_PAYMENT, null)) {
            log.warn("ignoring inventory.reserved for order={} in status={}",
                    orderId, order.getStatus());
            return;
        }
        outbox.save(new OutboxEvent(AGGREGATE, orderId.toString(), "payment.requested",
                orderTopic, Map.of(
                "orderId", orderId.toString(),
                "userId", order.getUserId().toString(),
                "amountMinor", order.getTotalMinor(),
                "currency", order.getCurrency(),
                "method", order.getPaymentMethod()), traceId));
        log.info("order {} awaiting payment", orderId);
    }

    /** المخزون غير كافٍ ⇒ إلغاء الطلب. */
    @Transactional
    public void onInventoryRejected(UUID orderId, String reason, String traceId) {
        cancelInternal(orderId, reason == null ? "OUT_OF_STOCK" : reason, traceId, false);
    }

    /** الدفع نجح ⇒ تأكيد الطلب وإخطار العميل. */
    @Transactional
    public void onPaymentAuthorized(UUID orderId, UUID paymentId, String traceId) {
        Order order = load(orderId);
        if (!order.transitionTo(OrderStatus.CONFIRMED, null)) {
            log.warn("ignoring payment.authorized for order={} in status={}",
                    orderId, order.getStatus());
            return;
        }
        order.setPaymentId(paymentId);

        outbox.save(new OutboxEvent(AGGREGATE, orderId.toString(), "order.confirmed",
                orderTopic, Map.of(
                "orderId", orderId.toString(),
                "userId", order.getUserId().toString(),
                "orderNumber", order.getOrderNumber(),
                "totalMinor", order.getTotalMinor(),
                "currency", order.getCurrency()), traceId));

        outbox.save(new OutboxEvent(AGGREGATE, orderId.toString(), "notification.order_confirmed",
                notificationTopic, Map.of(
                "userId", order.getUserId().toString(),
                "channel", "EMAIL",
                "template", "order_confirmed",
                "data", Map.of(
                        "orderNumber", order.getOrderNumber(),
                        "totalMinor", order.getTotalMinor(),
                        "currency", order.getCurrency())), traceId));

        log.info("order {} confirmed payment={}", orderId, paymentId);
    }

    /** الدفع فشل ⇒ إلغاء + تعويض (تحرير المخزون عبر order.cancelled). */
    @Transactional
    public void onPaymentFailed(UUID orderId, String failureCode, String traceId) {
        cancelInternal(orderId, failureCode == null ? "PAYMENT_FAILED" : failureCode, traceId, true);
    }

    // ------------------------------------------------------------- user ops

    @Transactional
    public OrderView cancelByUser(UUID userId, UUID orderId, String reason, String traceId) {
        Order order = orders.findWithItemsByIdAndUserId(orderId, userId)
                .orElseThrow(() -> ApiException.notFound("ORDER_NOT_FOUND", "Order not found"));

        if (order.getStatus().isTerminal()) {
            throw ApiException.conflict("ORDER_NOT_CANCELLABLE",
                    "Order is already " + order.getStatus());
        }
        if (order.getStatus() == OrderStatus.SHIPPED) {
            throw ApiException.conflict("ORDER_ALREADY_SHIPPED",
                    "Shipped orders must be returned, not cancelled");
        }
        cancelInternal(orderId, reason == null ? "CANCELLED_BY_USER" : reason, traceId, true);
        return OrderView.of(load(orderId));
    }

    @Transactional(readOnly = true)
    public OrderView get(UUID userId, UUID orderId) {
        return orders.findWithItemsByIdAndUserId(orderId, userId)
                .map(OrderView::of)
                .orElseThrow(() -> ApiException.notFound("ORDER_NOT_FOUND", "Order not found"));
    }

    @Transactional(readOnly = true)
    public PageResponse<OrderSummary> list(UUID userId, int page, int size) {
        Page<Order> result = orders.findByUserIdOrderByCreatedAtDesc(
                userId, PageRequest.of(Math.max(page, 0), Math.min(Math.max(size, 1), 50)));
        return new PageResponse<>(
                result.getContent().stream().map(OrderView::summaryOf).toList(),
                result.getNumber(), result.getSize(), result.getTotalElements(),
                result.getTotalPages(), result.hasNext());
    }

    @Transactional
    public OrderView updateStatus(UUID orderId, String newStatus, String traceId) {
        Order order = load(orderId);
        OrderStatus target = OrderStatus.valueOf(newStatus);
        if (!order.transitionTo(target, null)) {
            throw ApiException.conflict("INVALID_TRANSITION",
                    "Cannot move order from " + order.getStatus() + " to " + target);
        }
        outbox.save(new OutboxEvent(AGGREGATE, orderId.toString(),
                "order." + target.name().toLowerCase(), orderTopic, Map.of(
                "orderId", orderId.toString(),
                "userId", order.getUserId().toString(),
                "status", target.name()), traceId));
        return OrderView.of(order);
    }

    // ---------------------------------------------------------------- helpers

    private void cancelInternal(UUID orderId, String reason, String traceId, boolean releaseStock) {
        Order order = load(orderId);
        if (!order.transitionTo(OrderStatus.CANCELLED, reason)) {
            log.warn("ignoring cancellation for order={} in status={}", orderId, order.getStatus());
            return;
        }

        // order.cancelled هو حدث التعويض: inventory-service يُحرّر الحجز عند استلامه
        outbox.save(new OutboxEvent(AGGREGATE, orderId.toString(), "order.cancelled",
                orderTopic, Map.of(
                "orderId", orderId.toString(),
                "userId", order.getUserId().toString(),
                "reason", reason,
                "releaseStock", releaseStock), traceId));

        outbox.save(new OutboxEvent(AGGREGATE, orderId.toString(), "notification.order_cancelled",
                notificationTopic, Map.of(
                "userId", order.getUserId().toString(),
                "channel", "EMAIL",
                "template", "order_cancelled",
                "data", Map.of(
                        "orderNumber", order.getOrderNumber(),
                        "reason", reason)), traceId));

        rejectedCounter.increment();
        log.info("order {} cancelled reason={}", orderId, reason);
    }

    private Order load(UUID orderId) {
        return orders.findWithItemsById(orderId)
                .orElseThrow(() -> ApiException.notFound("ORDER_NOT_FOUND",
                        "No order with id " + orderId));
    }

    private Map<String, Object> orderCreatedPayload(Order order) {
        List<Map<String, Object>> items = order.getItems().stream()
                .map(i -> Map.<String, Object>of(
                        "sku", i.getSku(),
                        "title", i.getTitle(),
                        "quantity", i.getQuantity(),
                        "unitPriceMinor", i.getUnitPriceMinor()))
                .toList();
        return Map.of(
                "orderId", order.getId().toString(),
                "orderNumber", order.getOrderNumber(),
                "userId", order.getUserId().toString(),
                "currency", order.getCurrency(),
                "totalMinor", order.getTotalMinor(),
                "paymentMethod", order.getPaymentMethod(),
                "items", items);
    }

    private String nextOrderNumber() {
        return "N-" + LocalDate.now().getYear() + "-" + orders.nextOrderNumber();
    }

    /**
     * كوبونات تجريبية. في الإنتاج تخرج إلى promotion-service مستقلة
     * (قواعد الأهلية، حدود الاستخدام، التتبّع التسويقي).
     */
    private long resolveDiscount(String couponCode, long subtotalMinor) {
        if (couponCode == null || couponCode.isBlank()) {
            return 0;
        }
        return switch (couponCode.toUpperCase()) {
            case "NOON10"  -> Math.round(subtotalMinor * 0.10);
            case "NOON25"  -> Math.round(subtotalMinor * 0.25);
            case "FLAT50"  -> Math.min(5000, subtotalMinor);
            default -> throw ApiException.badRequest("INVALID_COUPON",
                    "Coupon code is not valid or has expired");
        };
    }

    // ------------------------------------------------------ scheduled cleanup

    /**
     * طلبات علقت في {@code PENDING} — يعني أن حدثها لم يُعالج.
     * ننبّه فقط؛ الإلغاء التلقائي يتم عبر انتهاء صلاحية الحجز في inventory-service.
     */
    @Scheduled(cron = "0 */5 * * * *")
    @Transactional(readOnly = true)
    public void detectStuckOrders() {
        List<Order> stuck = orders.findStuckInStatus(OrderStatus.PENDING,
                Instant.now().minus(20, ChronoUnit.MINUTES), PageRequest.of(0, 100));
        if (!stuck.isEmpty()) {
            log.warn("{} orders stuck in PENDING for over 20 minutes — investigate the saga",
                    stuck.size());
        }
    }

    @Scheduled(cron = "0 0 4 * * *")
    @Transactional
    public void purgeOldIdempotencyKeys() {
        int deleted = idempotency.purgeOlderThan(Instant.now().minus(7, ChronoUnit.DAYS));
        if (deleted > 0) {
            log.info("purged {} idempotency keys", deleted);
        }
    }
}
