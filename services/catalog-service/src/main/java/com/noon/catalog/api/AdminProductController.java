package com.noon.catalog.api;

import com.noon.catalog.api.dto.CatalogDtos.*;
import com.noon.catalog.service.ProductService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

/**
 * واجهة لوحة التحكم.
 *
 * <p>معزولة عن {@link ProductController} عمدًا: مسارات {@code /admin} محجوبة
 * عند الـ api-gateway ولا تُعرض للإنترنت إلا عبر {@code /api/v1/admin/*}
 * الذي يفرض دور ADMIN. الحاجز الحقيقي هو NetworkPolicy في العنقود.
 */
@RestController
@RequestMapping("/api/v1/products/admin")
public class AdminProductController {

    private final ProductService products;

    public AdminProductController(ProductService products) {
        this.products = products;
    }

    /** قائمة كل المنتجات بأي حالة، مع بحث وترقيم. */
    @GetMapping
    public PageResponse<AdminProductView> list(
            @RequestParam(required = false) String search,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String category,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String sort) {
        return products.adminList(search, status, category, page, size, sort);
    }

    /** منتج واحد بأي حالة — لشاشة التحرير. */
    @GetMapping("/{sku}")
    public AdminProductView get(@PathVariable String sku) {
        return products.adminGet(sku);
    }

    /** إنشاء أو تحديث. الـ sku هو المفتاح، فالعملية idempotent. */
    @PutMapping
    public ProductView upsert(@Valid @RequestBody UpsertProductRequest req,
                              @RequestHeader(value = "x-request-id", required = false) String traceId) {
        return products.upsert(req, traceId);
    }

    @PatchMapping("/{sku}/price")
    public ProductView updatePrice(@PathVariable String sku,
                                   @Valid @RequestBody PriceUpdateRequest req,
                                   @RequestHeader(value = "x-request-id", required = false) String traceId) {
        return products.updatePrice(sku, req, traceId);
    }

    @PatchMapping("/{sku}/status")
    public AdminProductView updateStatus(@PathVariable String sku,
                                         @Valid @RequestBody StatusUpdateRequest req,
                                         @RequestHeader(value = "x-request-id", required = false) String traceId) {
        return products.setStatus(sku, req.status(), traceId);
    }

    /**
     * أرشفة لا حذف فعلي: الطلبات التاريخية تشير إلى الـ sku،
     * وحذف المستند يكسر صفحات الطلبات القديمة.
     */
    @DeleteMapping("/{sku}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void archive(@PathVariable String sku,
                        @RequestHeader(value = "x-request-id", required = false) String traceId) {
        products.archive(sku, traceId);
    }

    @GetMapping("/stats")
    public CatalogStats stats() {
        return products.stats();
    }
}
