package com.topchoice.payment.domain;

import jakarta.persistence.*;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "refunds")
public class Refund {

    @Id
    @GeneratedValue
    @Column(columnDefinition = "uuid")
    private UUID id;

    @Column(name = "payment_id", nullable = false, columnDefinition = "uuid")
    private UUID paymentId;

    @Column(name = "amount_minor", nullable = false)
    private long amountMinor;

    @Column(length = 255)
    private String reason;

    @Column(nullable = false, length = 24)
    private String status = "PENDING";

    @Column(name = "provider_ref", length = 128)
    private String providerRef;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt = Instant.now();

    protected Refund() {
    }

    public Refund(UUID paymentId, long amountMinor, String reason) {
        this.paymentId = paymentId;
        this.amountMinor = amountMinor;
        this.reason = reason;
    }

    public void complete(String providerRef) {
        this.status = "COMPLETED";
        this.providerRef = providerRef;
    }

    public void fail() {
        this.status = "FAILED";
    }

    public UUID getId() { return id; }
    public UUID getPaymentId() { return paymentId; }
    public long getAmountMinor() { return amountMinor; }
    public String getReason() { return reason; }
    public String getStatus() { return status; }
    public String getProviderRef() { return providerRef; }
    public Instant getCreatedAt() { return createdAt; }
}
