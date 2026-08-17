package com.topchoice.payment.domain;

import jakarta.persistence.*;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "payments")
public class Payment {

    public static final String REQUIRES_AUTH = "REQUIRES_AUTH";
    public static final String AUTHORIZED = "AUTHORIZED";
    public static final String CAPTURED = "CAPTURED";
    public static final String FAILED = "FAILED";
    public static final String VOIDED = "VOIDED";
    public static final String REFUNDED = "REFUNDED";

    @Id
    @GeneratedValue
    @Column(columnDefinition = "uuid")
    private UUID id;

    /** فريد: دفعة واحدة لكل طلب مهما تكرّر الحدث. */
    @Column(name = "order_id", nullable = false, unique = true, columnDefinition = "uuid")
    private UUID orderId;

    @Column(name = "user_id", nullable = false, columnDefinition = "uuid")
    private UUID userId;

    @Column(name = "amount_minor", nullable = false)
    private long amountMinor;

    @Column(nullable = false, columnDefinition = "bpchar(3)")
    private String currency = "AED";

    @Column(nullable = false, length = 24)
    private String method;

    @Column(nullable = false, length = 24)
    private String status = REQUIRES_AUTH;

    @Column(nullable = false, length = 24)
    private String provider = "mock";

    @Column(name = "provider_ref", length = 128)
    private String providerRef;

    @Column(name = "failure_code", length = 64)
    private String failureCode;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    protected Payment() {
    }

    public Payment(UUID orderId, UUID userId, long amountMinor,
                   String currency, String method, String provider) {
        this.orderId = orderId;
        this.userId = userId;
        this.amountMinor = amountMinor;
        this.currency = currency;
        this.method = method;
        this.provider = provider;
    }

    public void markAuthorized(String providerRef) {
        this.status = AUTHORIZED;
        this.providerRef = providerRef;
        this.failureCode = null;
        this.updatedAt = Instant.now();
    }

    public void markCaptured(String providerRef) {
        this.status = CAPTURED;
        if (providerRef != null) {
            this.providerRef = providerRef;
        }
        this.updatedAt = Instant.now();
    }

    public void markFailed(String failureCode) {
        this.status = FAILED;
        this.failureCode = failureCode;
        this.updatedAt = Instant.now();
    }

    public void markVoided() {
        this.status = VOIDED;
        this.updatedAt = Instant.now();
    }

    public void markRefunded() {
        this.status = REFUNDED;
        this.updatedAt = Instant.now();
    }

    public boolean isSettled() {
        return AUTHORIZED.equals(status) || CAPTURED.equals(status);
    }

    public boolean isRefundable() {
        return CAPTURED.equals(status) || AUTHORIZED.equals(status);
    }

    public UUID getId() { return id; }
    public UUID getOrderId() { return orderId; }
    public UUID getUserId() { return userId; }
    public long getAmountMinor() { return amountMinor; }
    public String getCurrency() { return currency; }
    public String getMethod() { return method; }
    public String getStatus() { return status; }
    public String getProvider() { return provider; }
    public String getProviderRef() { return providerRef; }
    public String getFailureCode() { return failureCode; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
}
