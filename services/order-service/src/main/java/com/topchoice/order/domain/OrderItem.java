package com.topchoice.order.domain;

import jakarta.persistence.*;

import java.util.UUID;

@Entity
@Table(name = "order_items")
public class OrderItem {

    @Id
    @GeneratedValue
    @Column(columnDefinition = "uuid")
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "order_id", nullable = false)
    private Order order;

    @Column(nullable = false, length = 64)
    private String sku;

    /** لقطة العنوان وقت الشراء — تغيير اسم المنتج لاحقًا لا يغيّر الفاتورة. */
    @Column(nullable = false)
    private String title;

    @Column(name = "image_url")
    private String imageUrl;

    @Column(name = "unit_price_minor", nullable = false)
    private long unitPriceMinor;

    @Column(nullable = false)
    private int quantity;

    @Column(name = "seller_id", length = 64)
    private String sellerId;

    protected OrderItem() {
    }

    public OrderItem(String sku, String title, String imageUrl,
                     long unitPriceMinor, int quantity, String sellerId) {
        this.sku = sku;
        this.title = title;
        this.imageUrl = imageUrl;
        this.unitPriceMinor = unitPriceMinor;
        this.quantity = quantity;
        this.sellerId = sellerId;
    }

    public long lineTotalMinor() {
        return unitPriceMinor * quantity;
    }

    void setOrder(Order order) { this.order = order; }

    public UUID getId() { return id; }
    public String getSku() { return sku; }
    public String getTitle() { return title; }
    public String getImageUrl() { return imageUrl; }
    public long getUnitPriceMinor() { return unitPriceMinor; }
    public int getQuantity() { return quantity; }
    public String getSellerId() { return sellerId; }
}
