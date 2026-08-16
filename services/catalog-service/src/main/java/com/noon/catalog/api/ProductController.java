package com.noon.catalog.api;

import com.noon.catalog.api.dto.CatalogDtos.*;
import com.noon.catalog.service.ProductService;
import jakarta.validation.Valid;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.Duration;
import java.util.List;

@RestController
@RequestMapping("/api/v1/products")
public class ProductController {

    private final ProductService products;

    public ProductController(ProductService products) {
        this.products = products;
    }

    /**
     * ترويسة {@code Cache-Control} هنا هي ما يجعل CloudFront يخزّن الاستجابة
     * على الحافة، فيصل جزء كبير من حركة القراءة إلى المستخدم دون لمس الـ pods.
     */
    @GetMapping("/{sku}")
    public ResponseEntity<ProductView> bySku(
            @PathVariable String sku,
            @RequestHeader(value = "Accept-Language", defaultValue = "ar") String locale) {
        ProductView view = products.getBySku(sku, normalize(locale));
        return ResponseEntity.ok()
                .cacheControl(CacheControl.maxAge(Duration.ofMinutes(5)).cachePublic()
                        .staleWhileRevalidate(Duration.ofMinutes(30)))
                .body(view);
    }

    @GetMapping("/slug/{slug}")
    public ResponseEntity<ProductView> bySlug(
            @PathVariable String slug,
            @RequestHeader(value = "Accept-Language", defaultValue = "ar") String locale) {
        return ResponseEntity.ok()
                .cacheControl(CacheControl.maxAge(Duration.ofMinutes(5)).cachePublic()
                        .staleWhileRevalidate(Duration.ofMinutes(30)))
                .body(products.getBySlug(slug, normalize(locale)));
    }

    /** جلب دفعي — تستدعيه cart-service و order-service بدل نداء لكل sku. */
    @PostMapping("/bulk")
    public List<ProductSummary> bulk(
            @Valid @RequestBody BulkSkuRequest req,
            @RequestHeader(value = "Accept-Language", defaultValue = "ar") String locale) {
        return products.getManyBySku(req.skus(), normalize(locale));
    }

    @GetMapping("/{sku}/similar")
    public List<ProductSummary> similar(
            @PathVariable String sku,
            @RequestParam(defaultValue = "12") int limit,
            @RequestHeader(value = "Accept-Language", defaultValue = "ar") String locale) {
        return products.similar(sku, limit, normalize(locale));
    }

    @GetMapping
    public ResponseEntity<PageResponse<ProductSummary>> list(
            @RequestParam(required = false) String category,
            @RequestParam(required = false) String brand,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "24") int size,
            @RequestParam(required = false) String sort,
            @RequestHeader(value = "Accept-Language", defaultValue = "ar") String locale) {

        String loc = normalize(locale);
        PageResponse<ProductSummary> body = (brand != null)
                ? products.listByBrand(brand, page, size, sort, loc)
                : products.listByCategory(category, page, size, sort, loc);

        return ResponseEntity.ok()
                .cacheControl(CacheControl.maxAge(Duration.ofMinutes(2)).cachePublic())
                .body(body);
    }

    /** "ar-AE,ar;q=0.9" -> "ar" */
    private static String normalize(String acceptLanguage) {
        if (acceptLanguage == null || acceptLanguage.isBlank()) return "ar";
        String first = acceptLanguage.split(",")[0].trim().split("-")[0].toLowerCase();
        return ("en".equals(first)) ? "en" : "ar";
    }
}
