package com.topchoice.order.kafka;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.topchoice.order.events.EventEnvelope;
import com.topchoice.order.service.OrderService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.kafka.support.Acknowledgment;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.stereotype.Component;

import java.util.UUID;

/**
 * منسّق الـ Saga: يستمع لردود inventory و payment ويحرّك حالة الطلب.
 *
 * <p>وضع المنطق في خدمة واحدة (orchestration) بدل توزيعه على الخدمات
 * (choreography) يجعل الإجابة على سؤال «لماذا عَلِق هذا الطلب؟» ممكنة
 * بقراءة كود واحد بدل تتبّع سلسلة أحداث عبر خمس خدمات.
 */
@Component
public class SagaEventListener {

    private static final Logger log = LoggerFactory.getLogger(SagaEventListener.class);
    private static final String CONSUMER = "order-service";

    private final ObjectMapper mapper;
    private final OrderService orders;
    private final EventDeduplicator dedup;

    public SagaEventListener(ObjectMapper mapper, OrderService orders, EventDeduplicator dedup) {
        this.mapper = mapper;
        this.orders = orders;
        this.dedup = dedup;
    }

    @KafkaListener(topics = "${topchoice.topics.inventory-events}", groupId = "order-service")
    public void onInventoryEvent(@Payload String raw, Acknowledgment ack) {
        EventEnvelope event = parse(raw);
        if (event == null || !dedup.claim(event.eventUuid(), CONSUMER)) {
            ack.acknowledge();
            return;
        }

        try {
            UUID orderId = UUID.fromString(event.aggregateId());
            switch (event.eventType()) {
                case "inventory.reserved" -> orders.onInventoryReserved(orderId, event.traceId());
                case "inventory.rejected" -> orders.onInventoryRejected(orderId,
                        event.payload().path("reason").asText("OUT_OF_STOCK"), event.traceId());
                case "inventory.released" -> log.debug("stock released for order {}", orderId);
                default -> log.debug("ignoring inventory event {}", event.eventType());
            }
            ack.acknowledge();
        } catch (Exception e) {
            // بلا acknowledge ⇒ Kafka تعيد التسليم، ثم DLQ بعد استنفاد المحاولات
            log.error("failed handling inventory event {} : {}", event.eventId(), e.toString(), e);
            throw e;
        }
    }

    @KafkaListener(topics = "${topchoice.topics.payment-events}", groupId = "order-service")
    public void onPaymentEvent(@Payload String raw, Acknowledgment ack) {
        EventEnvelope event = parse(raw);
        if (event == null || !dedup.claim(event.eventUuid(), CONSUMER)) {
            ack.acknowledge();
            return;
        }

        try {
            UUID orderId = UUID.fromString(event.aggregateId());
            switch (event.eventType()) {
                case "payment.authorized", "payment.captured" -> {
                    String pid = event.payload().path("paymentId").asText(null);
                    orders.onPaymentAuthorized(orderId,
                            pid == null || pid.isBlank() ? null : UUID.fromString(pid),
                            event.traceId());
                }
                case "payment.failed" -> orders.onPaymentFailed(orderId,
                        event.payload().path("failureCode").asText("PAYMENT_FAILED"),
                        event.traceId());
                case "payment.refunded" -> log.info("payment refunded for order {}", orderId);
                default -> log.debug("ignoring payment event {}", event.eventType());
            }
            ack.acknowledge();
        } catch (Exception e) {
            log.error("failed handling payment event {} : {}", event.eventId(), e.toString(), e);
            throw e;
        }
    }

    private EventEnvelope parse(String raw) {
        try {
            return mapper.readValue(raw, EventEnvelope.class);
        } catch (Exception e) {
            // رسالة تالفة: إعادة المحاولة لن تصلحها — نتخطاها بعد التسجيل
            log.error("poison message — skipping: {}", e.toString());
            return null;
        }
    }
}
