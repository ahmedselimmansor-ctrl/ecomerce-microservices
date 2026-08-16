package com.noon.catalog.domain;

import org.springframework.data.annotation.Id;
import org.springframework.data.annotation.Version;
import org.springframework.data.mongodb.core.mapping.Document;
import org.springframework.data.mongodb.core.mapping.Field;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * مستند المنتج.
 *
 * <p>سبب اختيار MongoDB هنا: {@code attributes} تختلف جذريًا بين الأقسام
 * (موبايل: storage/ram — ملابس: size/material)، وقراءات صفحة المنتج مستندية
 * بطبيعتها فلا نحتاج JOINs.
 */
@Document(collection = "products")
public class Product {

    @Id
    private String id;

    private String sku;
    private String slug;

    /** نصوص متعددة اللغات: {@code {"ar": "...", "en": "..."}} */
    private Map<String, String> title = new LinkedHashMap<>();
    private Map<String, String> description = new LinkedHashMap<>();

    private Brand brand;

    /** مسار القسم من الجذر: {@code ["electronics","mobiles","smartphones"]} */
    @Field("categoryPath")
    private List<String> categoryPath = new ArrayList<>();

    private Price price;
    private List<String> images = new ArrayList<>();
    private Map<String, Object> attributes = new LinkedHashMap<>();
    private List<Variant> variants = new ArrayList<>();
    private Rating rating = new Rating(0.0, 0);

    private String sellerId;
    private List<String> tags = new ArrayList<>();

    /** ACTIVE | INACTIVE | ARCHIVED */
    private String status = "ACTIVE";

    private Instant createdAt = Instant.now();
    private Instant updatedAt = Instant.now();

    @Version
    private Long version;

    // ------------------------------------------------------------ value types

    public record Brand(String id, String name) {
    }

    /** المبالغ بالوحدة الصغرى (فلس/سنت) كأعداد صحيحة — لا floating point في المال. */
    public record Price(String currency, long amountMinor, Long wasMinor) {
        public Integer discountPercent() {
            if (wasMinor == null || wasMinor <= amountMinor || wasMinor == 0) {
                return null;
            }
            return (int) Math.round((wasMinor - amountMinor) * 100.0 / wasMinor);
        }
    }

    public record Variant(String sku, Map<String, Object> attributes,
                          long priceMinor, List<String> images) {
    }

    public record Rating(Double average, Integer count) {
    }

    // --------------------------------------------------------------- accessors

    public String getId() { return id; }
    public String getSku() { return sku; }
    public String getSlug() { return slug; }
    public Map<String, String> getTitle() { return title; }
    public Map<String, String> getDescription() { return description; }
    public Brand getBrand() { return brand; }
    public List<String> getCategoryPath() { return categoryPath; }
    public Price getPrice() { return price; }
    public List<String> getImages() { return images; }
    public Map<String, Object> getAttributes() { return attributes; }
    public List<Variant> getVariants() { return variants; }
    public Rating getRating() { return rating; }
    public String getSellerId() { return sellerId; }
    public List<String> getTags() { return tags; }
    public String getStatus() { return status; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
    public Long getVersion() { return version; }

    public void setId(String id) { this.id = id; }
    public void setSku(String sku) { this.sku = sku; }
    public void setSlug(String slug) { this.slug = slug; }
    public void setTitle(Map<String, String> title) { this.title = title; }
    public void setDescription(Map<String, String> description) { this.description = description; }
    public void setBrand(Brand brand) { this.brand = brand; }
    public void setCategoryPath(List<String> categoryPath) { this.categoryPath = categoryPath; }
    public void setPrice(Price price) { this.price = price; }
    public void setImages(List<String> images) { this.images = images; }
    public void setAttributes(Map<String, Object> attributes) { this.attributes = attributes; }
    public void setVariants(List<Variant> variants) { this.variants = variants; }
    public void setRating(Rating rating) { this.rating = rating; }
    public void setSellerId(String sellerId) { this.sellerId = sellerId; }
    public void setTags(List<String> tags) { this.tags = tags; }
    public void setStatus(String status) { this.status = status; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }

    public String titleFor(String locale) {
        String t = title.get(locale);
        if (t != null) return t;
        String en = title.get("en");
        return en != null ? en : title.values().stream().findFirst().orElse(sku);
    }
}
