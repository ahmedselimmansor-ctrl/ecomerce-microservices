package com.noon.catalog.events;

import com.noon.catalog.domain.Product;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * مغلّف الحدث المشترك عبر كل الخدمات (مستوحى من CloudEvents).
 * أي حقل جديد يجب أن يكون اختياريًا للحفاظ على التوافق الخلفي.
 */
public record ProductEvent(
        String eventId,
        String eventType,
        int version,
        String occurredAt,
        String traceId,
        String aggregateId,
        Payload payload) {

    public record Payload(
            String sku,
            String slug,
            String titleAr,
            String titleEn,
            String brandId,
            String brandName,
            List<String> categoryPath,
            String currency,
            Long priceMinor,
            Long wasMinor,
            List<String> images,
            Map<String, Object> attributes,
            List<String> tags,
            Double rating,
            Integer ratingCount,
            String status) {
    }

    public static ProductEvent upserted(Product p, String traceId) {
        return build("catalog.product.upserted", p, traceId);
    }

    public static ProductEvent deleted(Product p, String traceId) {
        return build("catalog.product.deleted", p, traceId);
    }

    private static ProductEvent build(String type, Product p, String traceId) {
        var price = p.getPrice();
        return new ProductEvent(
                UUID.randomUUID().toString(),
                type,
                1,
                Instant.now().toString(),
                traceId,
                p.getSku(),
                new Payload(
                        p.getSku(), p.getSlug(),
                        p.getTitle().get("ar"), p.getTitle().get("en"),
                        p.getBrand() == null ? null : p.getBrand().id(),
                        p.getBrand() == null ? null : p.getBrand().name(),
                        p.getCategoryPath(),
                        price == null ? null : price.currency(),
                        price == null ? null : price.amountMinor(),
                        price == null ? null : price.wasMinor(),
                        p.getImages(), p.getAttributes(), p.getTags(),
                        p.getRating() == null ? null : p.getRating().average(),
                        p.getRating() == null ? null : p.getRating().count(),
                        p.getStatus()));
    }
}
