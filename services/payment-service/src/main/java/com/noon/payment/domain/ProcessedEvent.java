package com.noon.payment.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

import java.io.Serializable;
import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

@Entity
@Table(name = "processed_events")
public class ProcessedEvent {

    @Embeddable
    public static class Key implements Serializable {

        @Column(name = "event_id", nullable = false, columnDefinition = "uuid")
        private UUID eventId;

        @Column(nullable = false, length = 64)
        private String consumer;

        protected Key() {
        }

        public Key(UUID eventId, String consumer) {
            this.eventId = eventId;
            this.consumer = consumer;
        }

        @Override
        public boolean equals(Object o) {
            if (this == o) return true;
            if (!(o instanceof Key key)) return false;
            return Objects.equals(eventId, key.eventId) && Objects.equals(consumer, key.consumer);
        }

        @Override
        public int hashCode() {
            return Objects.hash(eventId, consumer);
        }
    }

    @EmbeddedId
    private Key id;

    @Column(name = "processed_at", nullable = false)
    private Instant processedAt = Instant.now();

    protected ProcessedEvent() {
    }

    public ProcessedEvent(UUID eventId, String consumer) {
        this.id = new Key(eventId, consumer);
    }
}
