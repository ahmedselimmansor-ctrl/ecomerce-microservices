package com.topchoice.catalog.api.dto;

import com.topchoice.catalog.domain.Category;
import com.topchoice.catalog.domain.Product;
import jakarta.validation.constraints.*;
import org.springframework.data.domain.Page;

import java.util.List;
import java.util.Map;

public final class CatalogDtos {

    private CatalogDtos() {
    }

    // ------------------------------------------------------------------ views

    /** استجابة مسطّحة ومترجمة — الواجهة لا يجب أن تتعامل مع خرائط اللغات. */
    public record ProductView(
            String id,
            String sku,
            String slug,
            String title,
            String description,
            String brandId,
            String brandName,
            List<String> categoryPath,
            String currency,
            long priceMinor,
            Long wasMinor,
            Integer discountPercent,
            List<String> images,
            Map<String, Object> attributes,
            List<VariantView> variants,
            Double rating,
            Integer ratingCount,
            List<String> tags,
            String sellerId) {

        public static ProductView of(Product p, String locale) {
            var price = p.getPrice();
            return new ProductView(
                    p.getId(), p.getSku(), p.getSlug(),
                    p.titleFor(locale),
                    p.getDescription().getOrDefault(locale, p.getDescription().get("en")),
                    p.getBrand() == null ? null : p.getBrand().id(),
                    p.getBrand() == null ? null : p.getBrand().name(),
                    p.getCategoryPath(),
                    price == null ? "EGP" : price.currency(),
                    price == null ? 0 : price.amountMinor(),
                    price == null ? null : price.wasMinor(),
                    price == null ? null : price.discountPercent(),
                    p.getImages(),
                    p.getAttributes(),
                    p.getVariants().stream()
                            .map(v -> new VariantView(v.sku(), v.attributes(), v.priceMinor(), v.images()))
                            .toList(),
                    p.getRating() == null ? null : p.getRating().average(),
                    p.getRating() == null ? null : p.getRating().count(),
                    p.getTags(), p.getSellerId());
        }
    }

    public record VariantView(String sku, Map<String, Object> attributes,
                              long priceMinor, List<String> images) {
    }

    /** نسخة خفيفة لقوائم المنتجات — تقليل حجم الاستجابة على الشبكة. */
    public record ProductSummary(
            String sku, String slug, String title, String brandName,
            String currency, long priceMinor, Long wasMinor, Integer discountPercent,
            String image, Double rating, Integer ratingCount, List<String> tags) {

        public static ProductSummary of(Product p, String locale) {
            var price = p.getPrice();
            return new ProductSummary(
                    p.getSku(), p.getSlug(), p.titleFor(locale),
                    p.getBrand() == null ? null : p.getBrand().name(),
                    price == null ? "EGP" : price.currency(),
                    price == null ? 0 : price.amountMinor(),
                    price == null ? null : price.wasMinor(),
                    price == null ? null : price.discountPercent(),
                    p.getImages().isEmpty() ? null : p.getImages().get(0),
                    p.getRating() == null ? null : p.getRating().average(),
                    p.getRating() == null ? null : p.getRating().count(),
                    p.getTags());
        }
    }

    public record PageResponse<T>(List<T> items, int page, int size,
                                  long totalItems, int totalPages, boolean hasNext) {

        public static <E, T> PageResponse<T> of(Page<E> page, List<T> mapped) {
            return new PageResponse<>(mapped, page.getNumber(), page.getSize(),
                    page.getTotalElements(), page.getTotalPages(), page.hasNext());
        }
    }

    public record CategoryView(String slug, String name, String parentSlug,
                               String imageUrl, long productCount, List<CategoryView> children) {

        public static CategoryView of(Category c, String locale, List<CategoryView> children) {
            String name = c.getName().getOrDefault(locale,
                    c.getName().getOrDefault("en", c.getSlug()));
            return new CategoryView(c.getSlug(), name, c.getParentSlug(),
                    c.getImageUrl(), c.getProductCount(), children);
        }
    }

    // --------------------------------------------------------------- commands

    public record UpsertProductRequest(
            @NotBlank @Pattern(regexp = "^[A-Za-z0-9._-]{3,64}$") String sku,
            @NotBlank @Pattern(regexp = "^[a-z0-9-]{3,160}$") String slug,
            @NotNull Map<String, String> title,
            Map<String, String> description,
            String brandId,
            String brandName,
            @NotEmpty List<String> categoryPath,
            @NotBlank @Pattern(regexp = "^[A-Z]{3}$") String currency,
            @Positive long priceMinor,
            @Positive Long wasMinor,
            List<String> images,
            Map<String, Object> attributes,
            List<VariantView> variants,
            List<String> tags,
            String sellerId,
            @Pattern(regexp = "^(ACTIVE|INACTIVE|ARCHIVED)$") String status) {
    }

    public record BulkSkuRequest(@NotEmpty @Size(max = 100) List<String> skus) {
    }

    public record PriceUpdateRequest(@Positive long priceMinor, Long wasMinor) {
    }

    public record StatusUpdateRequest(
            @NotBlank @Pattern(regexp = "^(ACTIVE|INACTIVE|ARCHIVED)$") String status) {
    }

    // ------------------------------------------------------------------ admin

    /**
     * نسخة لوحة التحكم: تحمل الحقول الخام (لا المترجمة) والحالة،
     * لأن شاشة التحرير تحتاج تعديل النصين العربي والإنجليزي معًا.
     */
    public record AdminProductView(
            String id,
            String sku,
            String slug,
            Map<String, String> title,
            Map<String, String> description,
            String brandId,
            String brandName,
            List<String> categoryPath,
            String currency,
            long priceMinor,
            Long wasMinor,
            Integer discountPercent,
            List<String> images,
            Map<String, Object> attributes,
            List<String> tags,
            Double rating,
            Integer ratingCount,
            String sellerId,
            String status,
            String createdAt,
            String updatedAt) {

        public static AdminProductView of(Product p) {
            var price = p.getPrice();
            return new AdminProductView(
                    p.getId(), p.getSku(), p.getSlug(), p.getTitle(), p.getDescription(),
                    p.getBrand() == null ? null : p.getBrand().id(),
                    p.getBrand() == null ? null : p.getBrand().name(),
                    p.getCategoryPath(),
                    price == null ? "EGP" : price.currency(),
                    price == null ? 0 : price.amountMinor(),
                    price == null ? null : price.wasMinor(),
                    price == null ? null : price.discountPercent(),
                    p.getImages(), p.getAttributes(), p.getTags(),
                    p.getRating() == null ? null : p.getRating().average(),
                    p.getRating() == null ? null : p.getRating().count(),
                    p.getSellerId(), p.getStatus(),
                    p.getCreatedAt() == null ? null : p.getCreatedAt().toString(),
                    p.getUpdatedAt() == null ? null : p.getUpdatedAt().toString());
        }
    }

    public record CatalogStats(long total, long active, long inactive, long archived,
                               long categories, long brands) {
    }
}
