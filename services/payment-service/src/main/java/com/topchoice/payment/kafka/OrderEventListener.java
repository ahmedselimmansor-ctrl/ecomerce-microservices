package com.topchoice.payment.kafka;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.topchoice.payment.events.EventEnvelope;
import com.topchoice.payment.service.PaymentService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.kafka.support.Acknowledgment;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.stereotype.Component;

import java.util.UUID;

@Component
public class OrderEventListener {

    private static final Logger log = LoggerFactory.getLogger(OrderEventListener.class);

    private final ObjectMapper mapper;
    private final PaymentService payments;

    public OrderEventListener(ObjectMapper mapper, PaymentService payments) {
        this.mapper = mapper;
        this.payments = payments;
    }

    @KafkaListener(topics = "${topchoice.topics.order-events}", groupId = "payment-service")
    public void onOrderEvent(@Payload String raw, Acknowledgment ack) {
        EventEnvelope event;
        try {
            event = mapper.readValue(raw, EventEnvelope.class);
        } catch (Exception e) {
            log.error("poison message on order topic — skipping: {}", e.toString());
            ack.acknowledge();
            return;
        }

        if (!payments.claimEvent(event.eventUuid())) {
            ack.acknowledge();
            return;
        }

        try {
            switch (event.eventType()) {
                case "payment.requested" -> handleRequest(event);
                case "order.cancelled" -> payments.voidPayment(
                        UUID.fromString(event.aggregateId()), event.traceId());
                case "order.shipped" -> payments.capture(
                        UUID.fromString(event.aggregateId()), event.traceId());
                default -> log.debug("ignoring event {}", event.eventType());
            }
            ack.acknowledge();
        } catch (Exception e) {
            log.error("failed handling {} for {}", event.eventType(), event.aggregateId(), e);
            throw e;
        }
    }

    private void handleRequest(EventEnvelope event) {
        var p = event.payload();
        UUID orderId = UUID.fromString(p.path("orderId").asText(event.aggregateId()));
        UUID userId = UUID.fromString(p.path("userId").asText());
        long amount = p.path("amountMinor").asLong();
        String currency = p.path("currency").asText("EGP");
        String method = p.path("method").asText("CARD");

        if (amount <= 0) {
            log.error("refusing payment for order={} with non-positive amount {}", orderId, amount);
            return;
        }
        payments.handlePaymentRequest(orderId, userId, amount, currency, method, event.traceId());
    }
}
