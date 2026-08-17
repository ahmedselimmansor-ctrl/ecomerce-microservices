package com.topchoice.order.service;

import com.topchoice.order.api.dto.OrderDtos.*;
import com.topchoice.order.domain.Order;
import com.topchoice.order.domain.OrderStatus;
import com.topchoice.order.domain.OutboxEvent;
import com.topchoice.order.error.ApiException;
import com.topchoice.order.repository.OrderRepository;
import com.topchoice.order.repository.OutboxRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Map;
import java.util.UUID;

@Service
public class AdminOrderService {

    private static final Logger log = LoggerFactory.getLogger(AdminOrderService.class);
    private static final String AGGREGATE = "order";

    private final OrderRepository orders;
    private final OutboxRepository outbox;
    private final OrderService orderService;
    private final String orderTopic;
    private final String notificationTopic;

    public AdminOrderService(OrderRepository orders, OutboxRepository outbox,
                             OrderService orderService,
                             @Value("${topchoice.topics.order-events}") String orderTopic,
                             @Value("${topchoice.topics.notifications}") String notificationTopic) {
        this.orders = orders;
        this.outbox = outbox;
        this.orderService = orderService;
        this.orderTopic = orderTopic;
        this.notificationTopic = notificationTopic;
    }

    @Transactional(readOnly = true)
    public PageResponse<AdminOrderSummary> list(String status, String search, int page, int size) {
        var pageable = PageRequest.of(Math.max(page, 0), Math.min(Math.max(size, 1), 100));

        Page<Order> result;
        if (search != null && !search.isBlank()) {
            result = orders.findByOrderNumberContainingIgnoreCaseOrderByCreatedAtDesc(
                    search.trim(), pageable);
        } else if (status != null && !status.isBlank()) {
            result = orders.findByStatusOrderByCreatedAtDesc(
                    parseStatus(status), pageable);
        } else {
            result = orders.findAllByOrderByCreatedAtDesc(pageable);
        }

        return new PageResponse<>(
                result.getContent().stream().map(AdminOrderSummary::of).toList(),
                result.getNumber(), result.getSize(), result.getTotalElements(),
                result.getTotalPages(), result.hasNext());
    }

    @Transactional(readOnly = true)
    public OrderView get(UUID orderId) {
        return orders.findWithItemsById(orderId)
                .map(OrderView::of)
                .orElseThrow(() -> ApiException.notFound("ORDER_NOT_FOUND", "Order not found"));
    }

    /**
     * تغيير الحالة يدويًا من لوحة التحكم.
     *
     * <p>يمر بنفس آلة الحالة التي يستخدمها الـ Saga: لا يستطيع مشرف إرجاع
     * طلب مُسلَّم إلى "قيد التجهيز" لمجرد أنه يملك الصلاحية.
     */
    @Transactional
    public OrderView updateStatus(UUID orderId, String newStatus, String traceId) {
        Order order = load(orderId);
        OrderStatus target = parseStatus(newStatus);

        if (!order.transitionTo(target, null)) {
            throw ApiException.conflict("INVALID_TRANSITION",
                    "Cannot move order from " + order.getStatus() + " to " + target);
        }

        outbox.save(new OutboxEvent(AGGREGATE, orderId.toString(),
                "order." + target.name().toLowerCase(), orderTopic, Map.of(
                "orderId", orderId.toString(),
                "userId", order.getUserId().toString(),
                "orderNumber", order.getOrderNumber(),
                "status", target.name()), traceId));

        // العميل يُخطَر بالشحن والتسليم فقط — لا بكل انتقال داخلي
        if (target == OrderStatus.SHIPPED) {
            outbox.save(new OutboxEvent(AGGREGATE, orderId.toString(),
                    "notification.order_shipped", notificationTopic, Map.of(
                    "userId", order.getUserId().toString(),
                    "channel", "EMAIL",
                    "template", "order_shipped",
                    "data", Map.of(
                            "orderNumber", order.getOrderNumber(),
                            "trackingNumber", "TOPCHOICE-" + order.getOrderNumber())), traceId));
        }

        log.info("admin moved order {} to {}", orderId, target);
        return OrderView.of(order);
    }

    /** الإلغاء الإداري يمر بنفس مسار التعويض — يحرّر المخزون ويُبطل الدفع. */
    @Transactional
    public OrderView cancel(UUID orderId, String reason, String traceId) {
        Order order = load(orderId);
        if (order.getStatus().isTerminal()) {
            throw ApiException.conflict("ORDER_NOT_CANCELLABLE",
                    "Order is already " + order.getStatus());
        }
        orderService.onPaymentFailed(orderId,
                reason == null || reason.isBlank() ? "CANCELLED_BY_ADMIN" : reason, traceId);
        return OrderView.of(load(orderId));
    }

    @Transactional(readOnly = true)
    public OrderStats stats() {
        Instant startOfDay = Instant.now().truncatedTo(ChronoUnit.DAYS);

        long total = orders.count();
        long revenue = orders.sumRevenueMinor();
        long confirmed = orders.countByStatus(OrderStatus.CONFIRMED);
        long delivered = orders.countByStatus(OrderStatus.DELIVERED);
        long shipped = orders.countByStatus(OrderStatus.SHIPPED);
        long processing = orders.countByStatus(OrderStatus.PROCESSING);

        long paidOrders = confirmed + delivered + shipped + processing;

        return new OrderStats(
                total,
                orders.countByStatus(OrderStatus.PENDING)
                        + orders.countByStatus(OrderStatus.AWAITING_PAYMENT),
                confirmed,
                processing,
                shipped,
                delivered,
                orders.countByStatus(OrderStatus.CANCELLED),
                revenue,
                orders.countByCreatedAtGreaterThanEqual(startOfDay),
                orders.sumRevenueMinorSince(startOfDay),
                paidOrders == 0 ? 0 : (double) revenue / paidOrders);
    }

    private Order load(UUID orderId) {
        return orders.findWithItemsById(orderId)
                .orElseThrow(() -> ApiException.notFound("ORDER_NOT_FOUND", "Order not found"));
    }

    private static OrderStatus parseStatus(String value) {
        try {
            return OrderStatus.valueOf(value.toUpperCase());
        } catch (IllegalArgumentException e) {
            throw ApiException.badRequest("INVALID_STATUS", "Unknown order status: " + value);
        }
    }
}
