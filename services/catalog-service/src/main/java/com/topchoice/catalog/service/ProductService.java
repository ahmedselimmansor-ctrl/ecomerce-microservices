package com.topchoice.catalog.service;

import com.topchoice.catalog.api.dto.CatalogDtos.*;
import com.topchoice.catalog.domain.Product;
import com.topchoice.catalog.error.ApiException;
import com.topchoice.catalog.events.ProductEvent;
import com.topchoice.catalog.events.ProductEventPublisher;
import com.topchoice.catalog.repository.ProductRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class ProductService {

    private static final Logger log = LoggerFactory.getLogger(ProductService.class);
    private static final String ACTIVE = "ACTIVE";

    private final ProductRepository repo;
    private final ProductEventPublisher events;
    private final int defaultPageSize;
    private final int maxPageSize;

    public ProductService(ProductRepository repo,
                          ProductEventPublisher events,
                          @Value("${topchoice.catalog.default-page-size:24}") int defaultPageSize,
                          @Value("${topchoice.catalog.max-page-size:100}") int maxPageSize) {
        this.repo = repo;
        this.events = events;
        this.defaultPageSize = defaultPageSize;
        this.maxPageSize = maxPageSize;
    }

    // ------------------------------------------------------------------ reads

    @Cacheable(value = "product", key = "#sku + ':' + #locale", unless = "#result == null")
    public ProductView getBySku(String sku, String locale) {
        return repo.findBySkuAndStatus(sku, ACTIVE)
                .map(p -> ProductView.of(p, locale))
                .orElseThrow(() -> ApiException.notFound("PRODUCT_NOT_FOUND",
                        "No active product with sku " + sku));
    }

    @Cacheable(value = "productBySlug", key = "#slug + ':' + #locale", unless = "#result == null")
    public ProductView getBySlug(String slug, String locale) {
        return repo.findBySlugAndStatus(slug, ACTIVE)
                .map(p -> ProductView.of(p, locale))
                .orElseThrow(() -> ApiException.notFound("PRODUCT_NOT_FOUND",
                        "No active product with slug " + slug));
    }

    /**
     * جلب دفعة واحدة — يمنع مشكلة N+1 عند عرض السلة أو تفاصيل الطلب.
     * النتيجة مرتّبة حسب ترتيب الطلب لا حسب ترتيب قاعدة البيانات.
     */
    public List<ProductSummary> getManyBySku(List<String> skus, String locale) {
        if (skus.isEmpty()) {
            return List.of();
        }
        Map<String, Product> bySku = new LinkedHashMap<>();
        repo.findBySkuInAndStatus(skus, ACTIVE).forEach(p -> bySku.put(p.getSku(), p));

        List<ProductSummary> ordered = new ArrayList<>(skus.size());
        for (String sku : skus) {
            Product p = bySku.get(sku);
            if (p != null) {
                ordered.add(ProductSummary.of(p, locale));
            }
        }
        return ordered;
    }

    /**
     * سرد المنتجات. {@code categorySlug} فارغ يعني «كل المنتجات» —
     * وهو ما تحتاجه الصفحة الرئيسية لعرض العروض والأكثر مبيعًا.
     */
    public PageResponse<ProductSummary> listByCategory(String categorySlug, int page, int size,
                                                       String sort, String locale) {
        Pageable pageable = PageRequest.of(Math.max(page, 0), clampSize(size), sortOf(sort));
        Page<Product> result = (categorySlug == null || categorySlug.isBlank())
                ? repo.findByStatus(ACTIVE, pageable)
                : repo.findByCategoryPathContainingAndStatus(categorySlug, ACTIVE, pageable);
        return PageResponse.of(result,
                result.getContent().stream().map(p -> ProductSummary.of(p, locale)).toList());
    }

    public PageResponse<ProductSummary> listByBrand(String brandId, int page, int size,
                                                    String sort, String locale) {
        Pageable pageable = PageRequest.of(Math.max(page, 0), clampSize(size), sortOf(sort));
        Page<Product> result = repo.findByBrandIdAndStatus(brandId, ACTIVE, pageable);
        return PageResponse.of(result,
                result.getContent().stream().map(p -> ProductSummary.of(p, locale)).toList());
    }

    /**
     * منتجات مشابهة — احتياطي محلي فقط.
     * التوصيات الحقيقية تأتي من recommendation-service عبر Vertex AI Search.
     */
    public List<ProductSummary> similar(String sku, int limit, String locale) {
        Product product = repo.findBySkuAndStatus(sku, ACTIVE)
                .orElseThrow(() -> ApiException.notFound("PRODUCT_NOT_FOUND", "Product not found"));
        List<String> path = product.getCategoryPath();
        if (path.isEmpty()) {
            return List.of();
        }
        String deepest = path.get(path.size() - 1);
        return repo.findSimilar(deepest, sku, PageRequest.of(0, clampSize(limit)))
                .stream().map(p -> ProductSummary.of(p, locale)).toList();
    }

    // ----------------------------------------------------------------- writes

    @CacheEvict(value = {"product", "productBySlug"}, allEntries = true)
    public ProductView upsert(UpsertProductRequest req, String traceId) {
        // البحث بالـ sku بغض النظر عن الحالة — حتى نعيد تفعيل منتج مؤرشف بدل تكرار المفتاح
        Product p = repo.findBySku(req.sku()).orElseGet(Product::new);

        p.setSku(req.sku());
        p.setSlug(req.slug());
        p.setTitle(req.title());
        p.setDescription(req.description() == null ? Map.of() : req.description());
        if (req.brandId() != null) {
            p.setBrand(new Product.Brand(req.brandId(), req.brandName()));
        }
        p.setCategoryPath(req.categoryPath());
        p.setPrice(new Product.Price(req.currency(), req.priceMinor(), req.wasMinor()));
        p.setImages(req.images() == null ? List.of() : req.images());
        p.setAttributes(req.attributes() == null ? Map.of() : req.attributes());
        p.setVariants(req.variants() == null ? List.of()
                : req.variants().stream()
                .map(v -> new Product.Variant(v.sku(), v.attributes(), v.priceMinor(), v.images()))
                .toList());
        p.setTags(req.tags() == null ? List.of() : req.tags());
        p.setSellerId(req.sellerId());
        p.setStatus(req.status() == null ? ACTIVE : req.status());
        p.setUpdatedAt(Instant.now());

        Product saved;
        try {
            saved = repo.save(p);
        } catch (DuplicateKeyException e) {
            throw ApiException.conflict("SKU_OR_SLUG_TAKEN",
                    "Another product already uses this sku or slug");
        } catch (OptimisticLockingFailureException e) {
            throw ApiException.conflict("CONCURRENT_UPDATE",
                    "Product was modified concurrently — retry");
        }

        events.publish(ProductEvent.upserted(saved, traceId));
        log.info("product upserted sku={} status={}", saved.getSku(), saved.getStatus());
        return ProductView.of(saved, "ar");
    }

    @CacheEvict(value = {"product", "productBySlug"}, allEntries = true)
    public ProductView updatePrice(String sku, PriceUpdateRequest req, String traceId) {
        Product p = repo.findBySku(sku)
                .orElseThrow(() -> ApiException.notFound("PRODUCT_NOT_FOUND", "Product not found"));
        String currency = p.getPrice() == null ? "AED" : p.getPrice().currency();
        p.setPrice(new Product.Price(currency, req.priceMinor(), req.wasMinor()));
        p.setUpdatedAt(Instant.now());
        Product saved = repo.save(p);
        events.publish(ProductEvent.upserted(saved, traceId));
        return ProductView.of(saved, "ar");
    }

    /** أرشفة منطقية — لا نحذف فعليًا حفاظًا على سلامة الطلبات التاريخية. */
    @CacheEvict(value = {"product", "productBySlug"}, allEntries = true)
    public void archive(String sku, String traceId) {
        // بأي حالة لا ACTIVE فقط: أرشفة منتج مُخفى يجب أن تنجح أيضًا
        Product p = repo.findBySku(sku)
                .orElseThrow(() -> ApiException.notFound("PRODUCT_NOT_FOUND", "Product not found"));
        p.setStatus("ARCHIVED");
        p.setUpdatedAt(Instant.now());
        Product saved = repo.save(p);
        events.publish(ProductEvent.deleted(saved, traceId));
        log.info("product archived sku={}", sku);
    }

    // ------------------------------------------------------------------ admin

    /**
     * سرد لوحة التحكم — يشمل كل الحالات لا ACTIVE فقط.
     *
     * <p>{@code statusRegex} حيلة عملية: قيمة فارغة تعني "أي حالة"، وقيمة محددة
     * تطابق حالة واحدة. هذا يوفّر كتابة أربع دوال استعلام متشابهة.
     */
    public PageResponse<AdminProductView> adminList(String search, String status, String category,
                                                    int page, int size, String sort) {
        Pageable pageable = PageRequest.of(Math.max(page, 0), clampSize(size), sortOf(sort));
        String statusRegex = (status == null || status.isBlank()) ? ".*" : "^" + status + "$";

        Page<Product> result;
        if (search != null && !search.isBlank()) {
            result = repo.adminSearch(java.util.regex.Pattern.quote(search.trim()),
                    statusRegex, pageable);
        } else if (category != null && !category.isBlank()) {
            result = repo.findByStatusAndCategoryPathContaining(
                    status == null || status.isBlank() ? ACTIVE : status, category, pageable);
        } else {
            result = repo.findByStatusRegex(statusRegex, pageable);
        }

        return PageResponse.of(result,
                result.getContent().stream().map(AdminProductView::of).toList());
    }

    public AdminProductView adminGet(String sku) {
        return repo.findBySku(sku)
                .map(AdminProductView::of)
                .orElseThrow(() -> ApiException.notFound("PRODUCT_NOT_FOUND",
                        "No product with sku " + sku));
    }

    @CacheEvict(value = {"product", "productBySlug"}, allEntries = true)
    public AdminProductView setStatus(String sku, String status, String traceId) {
        Product p = repo.findBySku(sku)
                .orElseThrow(() -> ApiException.notFound("PRODUCT_NOT_FOUND", "Product not found"));
        p.setStatus(status);
        p.setUpdatedAt(Instant.now());
        Product saved = repo.save(p);

        // الفهرس يتبع الحالة: منتج غير نشط يجب أن يختفي من البحث فورًا
        events.publish(ACTIVE.equals(status)
                ? ProductEvent.upserted(saved, traceId)
                : ProductEvent.deleted(saved, traceId));

        log.info("product {} status -> {}", sku, status);
        return AdminProductView.of(saved);
    }

    public CatalogStats stats() {
        long active = repo.countByStatus(ACTIVE);
        long inactive = repo.countByStatus("INACTIVE");
        long archived = repo.countByStatus("ARCHIVED");
        long brands = repo.findAll().stream()
                .map(p -> p.getBrand() == null ? null : p.getBrand().id())
                .filter(java.util.Objects::nonNull)
                .distinct().count();
        return new CatalogStats(active + inactive + archived, active, inactive, archived,
                0, brands);
    }

    // ---------------------------------------------------------------- helpers

    private int clampSize(int size) {
        if (size <= 0) return defaultPageSize;
        return Math.min(size, maxPageSize);
    }

    private static Sort sortOf(String sort) {
        if (sort == null) {
            return Sort.by(Sort.Direction.DESC, "updatedAt");
        }
        return switch (sort) {
            case "price_asc"  -> Sort.by(Sort.Direction.ASC, "price.amountMinor");
            case "price_desc" -> Sort.by(Sort.Direction.DESC, "price.amountMinor");
            case "rating"     -> Sort.by(Sort.Direction.DESC, "rating.average");
            case "newest"     -> Sort.by(Sort.Direction.DESC, "createdAt");
            default           -> Sort.by(Sort.Direction.DESC, "updatedAt");
        };
    }
}
