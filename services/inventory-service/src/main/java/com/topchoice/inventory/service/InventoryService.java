package com.topchoice.inventory.service;

import com.topchoice.inventory.domain.ProcessedEvent;
import com.topchoice.inventory.domain.Reservation;
import com.topchoice.inventory.domain.StockItem;
import com.topchoice.inventory.error.ApiException;
import com.topchoice.inventory.events.InventoryEventPublisher;
import com.topchoice.inventory.events.InventoryEventPublisher.ReservedLine;
import com.topchoice.inventory.repository.ProcessedEventRepository;
import com.topchoice.inventory.repository.ReservationRepository;
import com.topchoice.inventory.repository.StockItemRepository;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.stream.Collectors;

@Service
public class InventoryService {

    private static final Logger log = LoggerFactory.getLogger(InventoryService.class);
    private static final String CONSUMER = "inventory-service";

    private final StockItemRepository stock;
    private final ReservationRepository reservations;
    private final ProcessedEventRepository processed;
    private final InventoryEventPublisher publisher;
    private final int ttlMinutes;

    private final Counter reservedCounter;
    private final Counter rejectedCounter;
    private final Counter releasedCounter;

    public InventoryService(StockItemRepository stock,
                            ReservationRepository reservations,
                            ProcessedEventRepository processed,
                            InventoryEventPublisher publisher,
                            MeterRegistry metrics,
                            @Value("${topchoice.reservation.ttl-minutes:15}") int ttlMinutes) {
        this.stock = stock;
        this.reservations = reservations;
        this.processed = processed;
        this.publisher = publisher;
        this.ttlMinutes = ttlMinutes;
        this.reservedCounter = Counter.builder("topchoice.inventory.reservations")
                .tag("result", "reserved").register(metrics);
        this.rejectedCounter = Counter.builder("topchoice.inventory.reservations")
                .tag("result", "rejected").register(metrics);
        this.releasedCounter = Counter.builder("topchoice.inventory.reservations")
                .tag("result", "released").register(metrics);
    }

    public record RequestedLine(String sku, int quantity) {
    }

    public record ReservationOutcome(boolean success, String reason, List<String> unavailableSkus) {
        static ReservationOutcome ok() {
            return new ReservationOutcome(true, null, List.of());
        }

        static ReservationOutcome fail(String reason, List<String> skus) {
            return new ReservationOutcome(false, reason, skus);
        }
    }

    /**
     * حجز المخزون لطلب — الخطوة الأولى في الـ Saga.
     *
     * <p>كل شيء داخل معاملة واحدة: نقفل صفوف المخزون بترتيب ثابت، نتحقق من
     * التوفّر لكل الأسطر أولًا (all-or-nothing)، ثم نكتب الحجوزات. القيد الفريد
     * {@code (order_id, sku)} يجعل إعادة تسليم نفس الحدث بلا أثر مضاعف.
     */
    @Transactional
    public ReservationOutcome reserve(UUID orderId, List<RequestedLine> lines, String traceId) {
        if (lines == null || lines.isEmpty()) {
            return ReservationOutcome.fail("EMPTY_ORDER", List.of());
        }

        // حجز سابق لنفس الطلب؟ إذن هذه إعادة تسليم — نعيد نفس النتيجة دون تكرار
        if (reservations.existsByOrderId(orderId)) {
            log.info("reservation already exists for orderId={} — treating as replay", orderId);
            List<ReservedLine> existing = reservations.findByOrderId(orderId).stream()
                    .map(r -> new ReservedLine(r.getSku(), r.getQuantity())).toList();
            publisher.publishReserved(orderId, existing, traceId);
            return ReservationOutcome.ok();
        }

        // دمج الأسطر المكررة لنفس الـ sku قبل الفحص
        Map<String, Integer> requested = new LinkedHashMap<>();
        for (RequestedLine line : lines) {
            if (line.quantity() <= 0) {
                return ReservationOutcome.fail("INVALID_QUANTITY", List.of(line.sku()));
            }
            requested.merge(line.sku(), line.quantity(), Integer::sum);
        }

        List<StockItem> locked = stock.lockAllBySku(requested.keySet());
        Map<String, StockItem> bySku = locked.stream()
                .collect(Collectors.toMap(StockItem::getSku, s -> s));

        List<String> unknown = requested.keySet().stream()
                .filter(sku -> !bySku.containsKey(sku)).toList();
        if (!unknown.isEmpty()) {
            rejectedCounter.increment();
            publisher.publishRejected(orderId, "SKU_NOT_FOUND", unknown, traceId);
            return ReservationOutcome.fail("SKU_NOT_FOUND", unknown);
        }

        // فحص شامل قبل أي تعديل — لا نحجز جزءًا من الطلب
        List<String> insufficient = requested.entrySet().stream()
                .filter(e -> !bySku.get(e.getKey()).canReserve(e.getValue()))
                .map(Map.Entry::getKey)
                .toList();
        if (!insufficient.isEmpty()) {
            rejectedCounter.increment();
            log.info("rejecting orderId={} — out of stock: {}", orderId, insufficient);
            publisher.publishRejected(orderId, "OUT_OF_STOCK", insufficient, traceId);
            return ReservationOutcome.fail("OUT_OF_STOCK", insufficient);
        }

        Instant expiresAt = Instant.now().plus(ttlMinutes, ChronoUnit.MINUTES);
        List<ReservedLine> reservedLines = new ArrayList<>(requested.size());

        try {
            for (var entry : requested.entrySet()) {
                StockItem item = bySku.get(entry.getKey());
                item.reserve(entry.getValue());
                reservations.save(new Reservation(orderId, entry.getKey(), entry.getValue(), expiresAt));
                reservedLines.add(new ReservedLine(entry.getKey(), entry.getValue()));
            }
            stock.saveAll(bySku.values());
        } catch (DataIntegrityViolationException e) {
            // سباق: نسخة أخرى من الخدمة عالجت نفس الحدث في نفس اللحظة
            log.warn("concurrent reservation for orderId={} — rolling back", orderId, e);
            throw e;
        }

        reservedCounter.increment();
        log.info("reserved orderId={} lines={}", orderId, reservedLines.size());
        publisher.publishReserved(orderId, reservedLines, traceId);
        return ReservationOutcome.ok();
    }

    /** تعويض Saga: إعادة الكميات للمتاح عند إلغاء الطلب أو فشل الدفع. */
    @Transactional
    public void release(UUID orderId, String traceId) {
        List<Reservation> held = reservations.findByOrderIdAndStatus(orderId, Reservation.HELD);
        if (held.isEmpty()) {
            log.debug("no held reservations to release for orderId={}", orderId);
            return;
        }
        applyRelease(held);
        releasedCounter.increment();
        log.info("released {} reservations for orderId={}", held.size(), orderId);
        publisher.publishReleased(orderId,
                held.stream().map(r -> new ReservedLine(r.getSku(), r.getQuantity())).toList(),
                traceId);
    }

    /** تأكيد نهائي بعد نجاح الدفع: الكمية تخرج فعليًا من المخزون. */
    @Transactional
    public void commit(UUID orderId) {
        List<Reservation> held = reservations.findByOrderIdAndStatus(orderId, Reservation.HELD);
        if (held.isEmpty()) {
            return;
        }
        Map<String, StockItem> bySku = stock.lockAllBySku(
                        held.stream().map(Reservation::getSku).collect(Collectors.toSet()))
                .stream().collect(Collectors.toMap(StockItem::getSku, s -> s));

        for (Reservation r : held) {
            StockItem item = bySku.get(r.getSku());
            if (item != null) {
                item.commit(r.getQuantity());
            }
            r.markCommitted();
        }
        stock.saveAll(bySku.values());
        reservations.saveAll(held);
        log.info("committed {} reservations for orderId={}", held.size(), orderId);
    }

    // ------------------------------------------------------------------ reads

    @Transactional(readOnly = true)
    public Map<String, Integer> availability(Collection<String> skus) {
        return stock.findBySkuIn(skus).stream()
                .collect(Collectors.toMap(StockItem::getSku, StockItem::available));
    }

    @Transactional(readOnly = true)
    public int availabilityOf(String sku) {
        return stock.findBySku(sku).map(StockItem::available)
                .orElseThrow(() -> ApiException.notFound("SKU_NOT_FOUND", "Unknown sku " + sku));
    }

    @Transactional
    public void restock(String sku, int quantity) {
        StockItem item = stock.findBySku(sku)
                .orElseThrow(() -> ApiException.notFound("SKU_NOT_FOUND", "Unknown sku " + sku));
        if (quantity <= 0) {
            throw ApiException.badRequest("INVALID_QUANTITY", "Quantity must be positive");
        }
        item.restock(quantity);
        stock.save(item);
        log.info("restocked sku={} by {} — onHand={}", sku, quantity, item.getOnHand());
    }

    // ------------------------------------------------------------------ admin

    public record InventoryStats(long skus, long totalOnHand, long totalReserved,
                                 long lowStock, long outOfStock) {
    }

    @Transactional(readOnly = true)
    public org.springframework.data.domain.Page<StockItem> adminList(
            String search, boolean lowStockOnly, int page, int size) {
        var pageable = org.springframework.data.domain.PageRequest.of(
                Math.max(page, 0), Math.min(Math.max(size, 1), 100));

        if (search != null && !search.isBlank()) {
            return stock.findBySkuContainingIgnoreCaseOrderBySku(search.trim(), pageable);
        }
        if (lowStockOnly) {
            return stock.findLowStock(5, pageable);
        }
        return stock.findAllByOrderBySku(pageable);
    }

    /**
     * إنشاء صف مخزون أو ضبط كميته.
     *
     * <p>لا نلمس {@code reserved}: ضبط الكمية من لوحة التحكم يجب ألا يلغي
     * حجوزات طلبات جارية. لو كانت الكمية الجديدة أقل من المحجوز نرفض العملية
     * بدل كسر قيد قاعدة البيانات.
     */
    @Transactional
    public StockItem upsertStock(String sku, String warehouseId, int onHand) {
        StockItem item = stock.findBySku(sku)
                .orElseGet(() -> new StockItem(sku,
                        warehouseId == null || warehouseId.isBlank() ? "DXB-1" : warehouseId, 0));

        if (onHand < item.getReserved()) {
            throw ApiException.conflict("BELOW_RESERVED",
                    "Cannot set stock to " + onHand + " — " + item.getReserved()
                            + " units are reserved by active orders");
        }

        int delta = onHand - item.getOnHand();
        if (delta > 0) {
            item.restock(delta);
        } else if (delta < 0) {
            item.reduceOnHand(-delta);
        }

        StockItem saved = stock.save(item);
        log.info("admin set stock sku={} onHand={} reserved={}", sku, saved.getOnHand(),
                saved.getReserved());
        return saved;
    }

    @Transactional(readOnly = true)
    public InventoryStats stats() {
        return new InventoryStats(
                stock.count(),
                stock.sumOnHand(),
                stock.sumReserved(),
                stock.countLowStock(),
                stock.countOutOfStock());
    }

    // ----------------------------------------------------------- idempotency

    /**
     * يسجّل الحدث كمُعالَج في معاملة مستقلة.
     * إن كان مسجّلًا مسبقًا يعيد {@code false} فيتخطّى المستهلك المعالجة.
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public boolean markProcessed(UUID eventId) {
        if (processed.existsById(new ProcessedEvent.Key(eventId, CONSUMER))) {
            return false;
        }
        try {
            processed.saveAndFlush(new ProcessedEvent(eventId, CONSUMER));
            return true;
        } catch (DataIntegrityViolationException e) {
            return false;   // نسخة أخرى سبقتنا
        }
    }

    // ------------------------------------------------------- scheduled sweeps

    /**
     * تحرير الحجوزات المنتهية — يحمي من ضياع المخزون إن تعطّل الـ Saga
     * بعد الحجز وقبل الدفع.
     */
    @Scheduled(cron = "${topchoice.reservation.sweep-cron:0 */2 * * * *}")
    @Transactional
    public void sweepExpiredReservations() {
        List<Reservation> expired = reservations.findExpired(Instant.now(), 500);
        if (expired.isEmpty()) {
            return;
        }
        applyRelease(expired);
        releasedCounter.increment(expired.size());
        log.info("swept {} expired reservations", expired.size());

        expired.stream()
                .collect(Collectors.groupingBy(Reservation::getOrderId))
                .forEach((orderId, list) -> publisher.publishReleased(orderId,
                        list.stream().map(r -> new ReservedLine(r.getSku(), r.getQuantity())).toList(),
                        null));
    }

    @Scheduled(cron = "0 30 3 * * *")
    @Transactional
    public void purgeOldProcessedEvents() {
        int deleted = processed.purgeOlderThan(Instant.now().minus(14, ChronoUnit.DAYS));
        if (deleted > 0) {
            log.info("purged {} processed-event records", deleted);
        }
    }

    private void applyRelease(List<Reservation> toRelease) {
        Map<String, StockItem> bySku = stock.lockAllBySku(
                        toRelease.stream().map(Reservation::getSku).collect(Collectors.toSet()))
                .stream().collect(Collectors.toMap(StockItem::getSku, s -> s));

        for (Reservation r : toRelease) {
            StockItem item = bySku.get(r.getSku());
            if (item != null) {
                item.release(r.getQuantity());
            }
            r.markReleased();
        }
        stock.saveAll(bySku.values());
        reservations.saveAll(toRelease);
    }
}
