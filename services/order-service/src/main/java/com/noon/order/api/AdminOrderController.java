package com.noon.order.api;

import com.noon.order.api.dto.OrderDtos.*;
import com.noon.order.service.AdminOrderService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

/**
 * واجهة لوحة التحكم للطلبات.
 *
 * <p>خلافًا لـ {@link OrderController} لا تُقيَّد النتائج بمستخدم واحد،
 * لذلك المسار محجوب عند الحافة ولا يُفتح إلا عبر {@code /api/v1/admin/orders}
 * بعد التحقق من دور ADMIN.
 */
@RestController
@RequestMapping("/api/v1/orders/admin")
public class AdminOrderController {

    private final AdminOrderService admin;

    public AdminOrderController(AdminOrderService admin) {
        this.admin = admin;
    }

    @GetMapping
    public PageResponse<AdminOrderSummary> list(
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String search,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return admin.list(status, search, page, size);
    }

    @GetMapping("/{orderId}")
    public OrderView get(@PathVariable UUID orderId) {
        return admin.get(orderId);
    }

    @PutMapping("/{orderId}/status")
    public OrderView updateStatus(@PathVariable UUID orderId,
                                  @Valid @RequestBody AdminStatusRequest body,
                                  @RequestHeader(value = "x-request-id", required = false) String traceId) {
        return admin.updateStatus(orderId, body.status(), traceId);
    }

    @PostMapping("/{orderId}/cancel")
    public OrderView cancel(@PathVariable UUID orderId,
                            @RequestBody(required = false) CancelOrderRequest body,
                            @RequestHeader(value = "x-request-id", required = false) String traceId) {
        return admin.cancel(orderId, body == null ? null : body.reason(), traceId);
    }

    @GetMapping("/stats")
    public OrderStats stats() {
        return admin.stats();
    }
}
