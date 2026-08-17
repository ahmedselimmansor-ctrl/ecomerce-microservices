package com.topchoice.inventory.kafka;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.topchoice.inventory.events.EventEnvelope;
import com.topchoice.inventory.service.InventoryService;
import com.topchoice.inventory.service.InventoryService.RequestedLine;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.kafka.support.Acknowledgment;
import org.springframework.kafka.support.KafkaHeaders;
import org.springframework.messaging.handler.annotation.Header;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * مستهلك أحداث الطلبات.
 *
 * <p>نستقبل الرسالة كنص خام ونحلّلها يدويًا بدل الاعتماد على ترويسات نوع Java،
 * لأن نفس الـ topic يُنتَج ويُستهلك من خدمات بلغات مختلفة.
 */
@Component
public class OrderEventListener {

    private static final Logger log = LoggerFactory.getLogger(OrderEventListener.class);

    private final ObjectMapper mapper;
    private final InventoryService inventory;

    public OrderEventListener(ObjectMapper mapper, InventoryService inventory) {
        this.mapper = mapper;
        this.inventory = inventory;
    }

    @KafkaListener(topics = "${topchoice.topics.order-events}", groupId = "inventory-service")
    public void onOrderEvent(@Payload String raw,
                             @Header(name = KafkaHeaders.RECEIVED_KEY, required = false) String key,
                             Acknowledgment ack) {
        EventEnvelope event;
        try {
            event = mapper.readValue(raw, EventEnvelope.class);
        } catch (Exception e) {
            // رسالة تالفة: لا فائدة من إعادة المحاولة — نتخطاها ونسجّلها
            log.error("poison message on order topic key={} — skipping: {}", key, e.toString());
            ack.acknowledge();
            return;
        }

        try {
            if (!inventory.markProcessed(event.eventUuid())) {
                log.debug("duplicate event {} — skipping", event.eventId());
                ack.acknowledge();
                return;
            }

            switch (event.eventType()) {
                case "order.created"   -> handleCreated(event);
                case "order.cancelled" -> inventory.release(UUID.fromString(event.aggregateId()),
                                                            event.traceId());
                case "order.confirmed" -> inventory.commit(UUID.fromString(event.aggregateId()));
                default -> log.debug("ignoring event type {}", event.eventType());
            }
            ack.acknowledge();

        } catch (Exception e) {
            // لا نؤكّد الاستلام ⇒ Kafka تعيد التسليم؛ وبعد استنفاد المحاولات تذهب للـ DLQ
            log.error("failed processing event {} type={}", event.eventId(), event.eventType(), e);
            throw e;
        }
    }

    private void handleCreated(EventEnvelope event) {
        UUID orderId = UUID.fromString(event.aggregateId());
        JsonNode items = event.payload().path("items");

        List<RequestedLine> lines = new ArrayList<>();
        for (JsonNode item : items) {
            String sku = item.path("sku").asText(null);
            int qty = item.path("quantity").asInt(0);
            if (sku != null && qty > 0) {
                lines.add(new RequestedLine(sku, qty));
            }
        }

        log.info("reserving stock orderId={} lines={}", orderId, lines.size());
        inventory.reserve(orderId, lines, event.traceId());
    }
}
