package com.topchoice.order.api;

import com.topchoice.order.api.dto.OrderDtos.*;
import com.topchoice.order.error.ApiException;
import com.topchoice.order.service.OrderService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/orders")
public class OrderController {

    private final OrderService orders;

    public OrderController(OrderService orders) {
        this.orders = orders;
    }

    /**
     * إنشاء طلب.
     *
     * <p>الرد {@code 202 Accepted} لا {@code 201}: الطلب سُجّل لكن لم يُؤكَّد بعد —
     * حجز المخزون والدفع يجريان غير متزامنين. الواجهة تستطلع
     * {@code GET /orders/{id}} أو تنتظر إشعارًا.
     */
    @PostMapping
    @ResponseStatus(HttpStatus.ACCEPTED)
    public OrderView create(
            @RequestHeader("X-User-Id") UUID userId,
            @RequestHeader(value = "Idempotency-Key", required = false) String idempotencyKey,
            @RequestHeader(value = "x-request-id", required = false) String traceId,
            @RequestHeader(value = "Accept-Language", defaultValue = "ar") String locale,
            @Valid @RequestBody CreateOrderRequest req) {
        return orders.create(userId, req, idempotencyKey, traceId, locale);
    }

    @GetMapping("/{orderId}")
    public OrderView get(@RequestHeader("X-User-Id") UUID userId,
                         @PathVariable UUID orderId) {
        return orders.get(userId, orderId);
    }

    @GetMapping
    public PageResponse<OrderSummary> list(@RequestHeader("X-User-Id") UUID userId,
                                           @RequestParam(defaultValue = "0") int page,
                                           @RequestParam(defaultValue = "20") int size) {
        return orders.list(userId, page, size);
    }

    @PostMapping("/{orderId}/cancel")
    public OrderView cancel(@RequestHeader("X-User-Id") UUID userId,
                            @RequestHeader(value = "x-request-id", required = false) String traceId,
                            @PathVariable UUID orderId,
                            @RequestBody(required = false) CancelOrderRequest body) {
        return orders.cancelByUser(userId, orderId,
                body == null ? null : body.reason(), traceId);
    }

    // -------------------------------------------------- internal / operations

    /**
     * تحديث الحالة من نظام المستودع/الشحن.
     * محمي على مستوى الشبكة (NetworkPolicy) — لا يُعرَض عبر الـ gateway العام.
     */
    @PutMapping("/internal/{orderId}/status")
    public OrderView updateStatus(@PathVariable UUID orderId,
                                  @RequestHeader(value = "x-internal-caller", required = false) String caller,
                                  @RequestHeader(value = "x-request-id", required = false) String traceId,
                                  @Valid @RequestBody UpdateStatusRequest body) {
        if (caller == null || caller.isBlank()) {
            throw ApiException.forbidden("INTERNAL_ONLY",
                    "This endpoint is reachable from internal services only");
        }
        return orders.updateStatus(orderId, body.status(), traceId);
    }

    @GetMapping("/health/saga")
    public ResponseEntity<String> sagaHealth() {
        return ResponseEntity.ok("ok");
    }
}
