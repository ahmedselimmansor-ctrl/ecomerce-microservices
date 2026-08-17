package com.topchoice.order.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

/**
 * ضغط زر «إتمام الشراء» مرتين، أو إعادة محاولة الشبكة، يجب ألا ينتج طلبين.
 * العميل يرسل {@code Idempotency-Key} ونحن نربطه بالطلب الناتج.
 */
@Entity
@Table(name = "idempotency_keys")
public class IdempotencyKey {

    @Id
    @Column(name = "key", length = 128)
    private String key;

    @Column(name = "user_id", nullable = false, columnDefinition = "uuid")
    private UUID userId;

    @Column(name = "order_id", columnDefinition = "uuid")
    private UUID orderId;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt = Instant.now();

    protected IdempotencyKey() {
    }

    public IdempotencyKey(String key, UUID userId, UUID orderId) {
        this.key = key;
        this.userId = userId;
        this.orderId = orderId;
    }

    public String getKey() { return key; }
    public UUID getUserId() { return userId; }
    public UUID getOrderId() { return orderId; }
}
