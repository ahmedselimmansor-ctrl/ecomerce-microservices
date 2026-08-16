package com.noon.inventory.events;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@Component
public class InventoryEventPublisher {

    private static final Logger log = LoggerFactory.getLogger(InventoryEventPublisher.class);

    private final KafkaTemplate<String, Object> kafka;
    private final ObjectMapper mapper;
    private final String topic;

    public InventoryEventPublisher(KafkaTemplate<String, Object> kafka,
                                   ObjectMapper mapper,
                                   @Value("${noon.topics.inventory-events}") String topic) {
        this.kafka = kafka;
        this.mapper = mapper;
        this.topic = topic;
    }

    public record ReservedLine(String sku, int quantity) {
    }

    public void publishReserved(UUID orderId, List<ReservedLine> lines, String traceId) {
        send("inventory.reserved", orderId, Map.of(
                "orderId", orderId.toString(),
                "reservations", lines,
                "reason", ""), traceId);
    }

    public void publishRejected(UUID orderId, String reason,
                                List<String> unavailableSkus, String traceId) {
        send("inventory.rejected", orderId, Map.of(
                "orderId", orderId.toString(),
                "reason", reason,
                "unavailableSkus", unavailableSkus), traceId);
    }

    public void publishReleased(UUID orderId, List<ReservedLine> lines, String traceId) {
        send("inventory.released", orderId, Map.of(
                "orderId", orderId.toString(),
                "reservations", lines), traceId);
    }

    private void send(String eventType, UUID orderId, Map<String, Object> payload, String traceId) {
        EventEnvelope envelope = EventEnvelope.of(
                eventType, orderId.toString(), traceId, mapper.valueToTree(payload));

        // المفتاح = orderId ⇒ كل أحداث نفس الطلب في نفس الـ partition ⇒ ترتيب مضمون
        kafka.send(topic, orderId.toString(), envelope)
                .whenComplete((res, ex) -> {
                    if (ex != null) {
                        log.error("failed publishing {} orderId={}", eventType, orderId, ex);
                    } else {
                        log.info("published {} orderId={} offset={}", eventType, orderId,
                                res.getRecordMetadata().offset());
                    }
                });
    }
}
