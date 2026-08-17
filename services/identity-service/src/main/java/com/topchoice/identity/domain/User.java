package com.topchoice.identity.domain;

import jakarta.persistence.*;

import java.time.Instant;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;

@Entity
@Table(name = "users")
public class User {

    @Id
    @GeneratedValue
    @Column(columnDefinition = "uuid")
    private UUID id;

    /**
     * {@code citext} في PostgreSQL يجعل المقارنة غير حساسة لحالة الأحرف على
     * مستوى قاعدة البيانات، فلا يمكن تسجيل {@code Ali@x.com} و{@code ali@x.com}
     * كحسابين. نصرّح بالنوع هنا حتى يقبله فحص المخطط في Hibernate.
     */
    @Column(nullable = false, unique = true, columnDefinition = "citext")
    private String email;

    @Column(unique = true)
    private String phone;

    @Column(name = "password_hash", nullable = false)
    private String passwordHash;

    @Column(name = "full_name", nullable = false)
    private String fullName;

    @Column(nullable = false)
    private String locale = "ar";

    @Column(name = "email_verified", nullable = false)
    private boolean emailVerified = false;

    @Column(nullable = false)
    private String status = "ACTIVE";

    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(name = "user_roles", joinColumns = @JoinColumn(name = "user_id"))
    @Column(name = "role")
    private Set<String> roles = new HashSet<>();

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    @PreUpdate
    void onUpdate() {
        this.updatedAt = Instant.now();
    }

    protected User() {
    }

    public User(String email, String phone, String passwordHash, String fullName, String locale) {
        this.email = email;
        this.phone = phone;
        this.passwordHash = passwordHash;
        this.fullName = fullName;
        this.locale = locale == null ? "ar" : locale;
        this.roles.add("CUSTOMER");
    }

    public boolean isActive() {
        return "ACTIVE".equals(status);
    }

    public UUID getId() { return id; }
    public String getEmail() { return email; }
    public String getPhone() { return phone; }
    public String getPasswordHash() { return passwordHash; }
    public String getFullName() { return fullName; }
    public String getLocale() { return locale; }
    public boolean isEmailVerified() { return emailVerified; }
    public String getStatus() { return status; }
    public Set<String> getRoles() { return roles; }
    public Instant getCreatedAt() { return createdAt; }

    public void setPasswordHash(String passwordHash) { this.passwordHash = passwordHash; }
    public void setFullName(String fullName) { this.fullName = fullName; }
    public void setPhone(String phone) { this.phone = phone; }
    public void setLocale(String locale) { this.locale = locale; }
    public void setEmailVerified(boolean emailVerified) { this.emailVerified = emailVerified; }
}
