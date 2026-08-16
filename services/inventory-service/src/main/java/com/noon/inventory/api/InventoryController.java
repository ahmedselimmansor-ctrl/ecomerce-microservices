package com.noon.inventory.api;

import com.noon.inventory.service.InventoryService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/inventory")
public class InventoryController {

    private final InventoryService inventory;

    public InventoryController(InventoryService inventory) {
        this.inventory = inventory;
    }

    public record AvailabilityRequest(@NotEmpty @Size(max = 200) List<String> skus) {
    }

    public record ReserveRequest(
            @NotEmpty List<LineItem> items) {
        public record LineItem(String sku, @Positive int quantity) {
        }
    }

    /**
     * توفّر منتج واحد. الـ TTL قصير (15 ثانية) لأن الرقم يتغيّر بسرعة —
     * نُظهر «متوفر/غير متوفر» لا العدد الدقيق للمستخدم النهائي.
     */
    @GetMapping("/{sku}")
    public ResponseEntity<Map<String, Object>> availability(@PathVariable String sku) {
        int available = inventory.availabilityOf(sku);
        return ResponseEntity.ok()
                .cacheControl(CacheControl.maxAge(Duration.ofSeconds(15)).cachePublic())
                .body(Map.of(
                        "sku", sku,
                        "available", available,
                        "inStock", available > 0,
                        // لا نكشف العدد الحقيقي — معلومة تنافسية + تحفيز شراء
                        "lowStock", available > 0 && available <= 5));
    }

    /** فحص دفعي — تستدعيه صفحة السلة لكل الأصناف في نداء واحد. */
    @PostMapping("/availability")
    public Map<String, Integer> bulkAvailability(@Valid @RequestBody AvailabilityRequest req) {
        return inventory.availability(req.skus());
    }

    /**
     * حجز متزامن — مسار اختياري يستخدمه order-service عندما يريد ردًا فوريًا
     * للمستخدم بدل انتظار دورة Kafka كاملة.
     */
    @PostMapping("/reservations/{orderId}")
    public ResponseEntity<InventoryService.ReservationOutcome> reserve(
            @PathVariable UUID orderId,
            @Valid @RequestBody ReserveRequest req,
            @RequestHeader(value = "x-request-id", required = false) String traceId) {

        var lines = req.items().stream()
                .map(i -> new InventoryService.RequestedLine(i.sku(), i.quantity()))
                .toList();
        var outcome = inventory.reserve(orderId, lines, traceId);
        return outcome.success()
                ? ResponseEntity.ok(outcome)
                : ResponseEntity.status(HttpStatus.CONFLICT).body(outcome);
    }

    @DeleteMapping("/reservations/{orderId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void release(@PathVariable UUID orderId,
                        @RequestHeader(value = "x-request-id", required = false) String traceId) {
        inventory.release(orderId, traceId);
    }

}
