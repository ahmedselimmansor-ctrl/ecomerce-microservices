package com.noon.inventory.domain;

import jakarta.persistence.*;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "reservations",
        uniqueConstraints = @UniqueConstraint(name = "uq_reservation_order_sku",
                columnNames = {"order_id", "sku"}))
public class Reservation {

    public static final String HELD = "HELD";
    public static final String COMMITTED = "COMMITTED";
    public static final String RELEASED = "RELEASED";

    @Id
    @GeneratedValue
    @Column(columnDefinition = "uuid")
    private UUID id;

    @Column(name = "order_id", nullable = false, columnDefinition = "uuid")
    private UUID orderId;

    @Column(nullable = false, length = 64)
    private String sku;

    @Column(nullable = false)
    private int quantity;

    @Column(nullable = false, length = 16)
    private String status = HELD;

    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    protected Reservation() {
    }

    public Reservation(UUID orderId, String sku, int quantity, Instant expiresAt) {
        this.orderId = orderId;
        this.sku = sku;
        this.quantity = quantity;
        this.expiresAt = expiresAt;
    }

    public boolean isHeld() {
        return HELD.equals(status);
    }

    public void markCommitted() {
        this.status = COMMITTED;
        this.updatedAt = Instant.now();
    }

    public void markReleased() {
        this.status = RELEASED;
        this.updatedAt = Instant.now();
    }

    public UUID getId() { return id; }
    public UUID getOrderId() { return orderId; }
    public String getSku() { return sku; }
    public int getQuantity() { return quantity; }
    public String getStatus() { return status; }
    public Instant getExpiresAt() { return expiresAt; }
}
