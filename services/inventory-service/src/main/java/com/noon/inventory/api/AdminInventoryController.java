package com.noon.inventory.api;

import com.noon.inventory.service.InventoryService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Positive;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/inventory/admin")
public class AdminInventoryController {

    private final InventoryService inventory;

    public AdminInventoryController(InventoryService inventory) {
        this.inventory = inventory;
    }

    public record StockRow(String sku, String warehouseId, int onHand, int reserved,
                           int available, long version, String updatedAt) {
    }

    public record PageResponse<T>(java.util.List<T> items, int page, int size,
                                  long totalItems, int totalPages, boolean hasNext) {
    }

    public record RestockRequest(@Positive int quantity) {
    }

    public record UpsertStockRequest(
            @NotBlank String sku,
            String warehouseId,
            @Min(0) int onHand) {
    }

    @GetMapping("/stock")
    public PageResponse<StockRow> list(
            @RequestParam(required = false) String search,
            @RequestParam(defaultValue = "false") boolean lowStockOnly,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        var result = inventory.adminList(search, lowStockOnly, page, size);
        return new PageResponse<>(
                result.getContent().stream()
                        .map(s -> new StockRow(s.getSku(), s.getWarehouseId(), s.getOnHand(),
                                s.getReserved(), s.available(), s.getVersion(),
                                s.getUpdatedAt().toString()))
                        .toList(),
                result.getNumber(), result.getSize(), result.getTotalElements(),
                result.getTotalPages(), result.hasNext());
    }

    /**
     * إنشاء أو ضبط المخزون.
     *
     * <p>تستدعيها لوحة التحكم بعد إنشاء منتج جديد: منتج بلا صف مخزون
     * سيُرفض عند أول طلب بـ {@code SKU_NOT_FOUND}.
     */
    @PutMapping("/stock")
    public StockRow upsert(@Valid @RequestBody UpsertStockRequest req) {
        var item = inventory.upsertStock(req.sku(), req.warehouseId(), req.onHand());
        return new StockRow(item.getSku(), item.getWarehouseId(), item.getOnHand(),
                item.getReserved(), item.available(), item.getVersion(),
                item.getUpdatedAt().toString());
    }

    @PostMapping("/{sku}/restock")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void restock(@PathVariable String sku, @Valid @RequestBody RestockRequest req) {
        inventory.restock(sku, req.quantity());
    }

    @GetMapping("/stats")
    public InventoryService.InventoryStats stats() {
        return inventory.stats();
    }
}
