package com.noon.payment.events;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.MissingNode;

import java.util.UUID;

/**
 * المغلّف الموحّد لأحداث النظام.
 *
 * <p>الحمولة {@link JsonNode} لا نوع محدد: إضافة حقل جديد من منتِج أحدث
 * لا تُفشل الاستهلاك، وهو شرط بقاء خدمات Java وNode وPython متوافقة
 * أثناء النشر التدريجي.
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

    public EventEnvelope {
        if (payload == null) {
            payload = MissingNode.getInstance();
        }
    }

    public UUID eventUuid() {
        try {
            return UUID.fromString(eventId);
        } catch (IllegalArgumentException | NullPointerException e) {
            return UUID.nameUUIDFromBytes(String.valueOf(eventId).getBytes());
        }
    }
}
