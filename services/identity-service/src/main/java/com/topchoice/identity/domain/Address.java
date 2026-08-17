package com.topchoice.identity.domain;

import jakarta.persistence.*;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "addresses")
public class Address {

    @Id
    @GeneratedValue
    @Column(columnDefinition = "uuid")
    private UUID id;

    @Column(name = "user_id", nullable = false, columnDefinition = "uuid")
    private UUID userId;

    @Column(nullable = false)
    private String label = "home";

    @Column(name = "full_name", nullable = false)
    private String fullName;

    @Column(nullable = false)
    private String phone;

    @Column(nullable = false)
    private String line1;

    private String line2;
    private String area;

    @Column(nullable = false)
    private String city;

    @Column(nullable = false, columnDefinition = "bpchar(2)")
    private String country = "AE";

    private BigDecimal lat;
    private BigDecimal lng;

    @Column(name = "is_default", nullable = false)
    private boolean isDefault = false;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt = Instant.now();

    protected Address() {
    }

    public Address(UUID userId, String label, String fullName, String phone, String line1,
                   String line2, String area, String city, String country,
                   BigDecimal lat, BigDecimal lng, boolean isDefault) {
        this.userId = userId;
        this.label = label == null ? "home" : label;
        this.fullName = fullName;
        this.phone = phone;
        this.line1 = line1;
        this.line2 = line2;
        this.area = area;
        this.city = city;
        this.country = country == null ? "AE" : country;
        this.lat = lat;
        this.lng = lng;
        this.isDefault = isDefault;
    }

    public UUID getId() { return id; }
    public UUID getUserId() { return userId; }
    public String getLabel() { return label; }
    public String getFullName() { return fullName; }
    public String getPhone() { return phone; }
    public String getLine1() { return line1; }
    public String getLine2() { return line2; }
    public String getArea() { return area; }
    public String getCity() { return city; }
    public String getCountry() { return country; }
    public BigDecimal getLat() { return lat; }
    public BigDecimal getLng() { return lng; }
    public boolean isDefault() { return isDefault; }
    public Instant getCreatedAt() { return createdAt; }

    public void setDefault(boolean value) { this.isDefault = value; }
}
