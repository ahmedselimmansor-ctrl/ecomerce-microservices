package com.noon.inventory.events;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.databind.JsonNode;

import java.time.Instant;
import java.util.UUID;

/**
 * المغلّف الموحّد لكل أحداث النظام.
 *
 * <p>الحمولة تُترك كـ {@link JsonNode} حتى لا يفشل الاستهلاك عند إضافة حقول
 * جديدة من منتِج بإصدار أحدث — وهو شرط التوافق الخلفي بين الخدمات المكتوبة
 * بلغات مختلفة (Java / Node / Python).
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public record EventEnvelope(
        String eventId,
        String eventType,
        Integer version,
        String occurredAt,
        String traceId,
        String aggregateId,
        JsonNode payload) {

    public UUID eventUuid() {
        try {
            return UUID.fromString(eventId);
        } catch (IllegalArgumentException | NullPointerException e) {
            // منتِج لم يستخدم UUID — نشتق معرّفًا ثابتًا حتى تبقى الـ idempotency صالحة
            return UUID.nameUUIDFromBytes(String.valueOf(eventId).getBytes());
        }
    }

    public static EventEnvelope of(String eventType, String aggregateId,
                                   String traceId, JsonNode payload) {
        return new EventEnvelope(UUID.randomUUID().toString(), eventType, 1,
                Instant.now().toString(), traceId, aggregateId, payload);
    }
}
