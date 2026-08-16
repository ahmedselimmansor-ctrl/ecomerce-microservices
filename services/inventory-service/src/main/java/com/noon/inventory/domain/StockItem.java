package com.noon.inventory.domain;

import jakarta.persistence.*;

import java.time.Instant;

@Entity
@Table(name = "stock_items")
public class StockItem {

    @Id
    @Column(length = 64)
    private String sku;

    @Column(name = "warehouse_id", nullable = false)
    private String warehouseId = "DXB-1";

    @Column(name = "on_hand", nullable = false)
    private int onHand;

    @Column(nullable = false)
    private int reserved;

    /**
     * قفل تفاؤلي: عند تعديلين متزامنين على نفس الـ sku يفشل الأبطأ بـ
     * {@link jakarta.persistence.OptimisticLockException} بدل أن يدهس الآخر.
     */
    @Version
    @Column(nullable = false)
    private long version;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    protected StockItem() {
    }

    public StockItem(String sku, String warehouseId, int onHand) {
        this.sku = sku;
        this.warehouseId = warehouseId;
        this.onHand = onHand;
        this.reserved = 0;
    }

    public int available() {
        return onHand - reserved;
    }

    public boolean canReserve(int quantity) {
        return quantity > 0 && available() >= quantity;
    }

    public void reserve(int quantity) {
        if (!canReserve(quantity)) {
            throw new IllegalStateException(
                    "insufficient stock for " + sku + ": available=" + available()
                            + " requested=" + quantity);
        }
        this.reserved += quantity;
        this.updatedAt = Instant.now();
    }

    /** إلغاء الحجز وإعادة الكمية للمتاح (تعويض Saga). */
    public void release(int quantity) {
        this.reserved = Math.max(0, this.reserved - quantity);
        this.updatedAt = Instant.now();
    }

    /** تأكيد البيع: تخرج الكمية من المحجوز ومن الموجود معًا. */
    public void commit(int quantity) {
        int q = Math.min(quantity, this.reserved);
        this.reserved -= q;
        this.onHand -= q;
        this.updatedAt = Instant.now();
    }

    public void restock(int quantity) {
        this.onHand += quantity;
        this.updatedAt = Instant.now();
    }

    /** تخفيض الكمية الموجودة (جرد/تلف). لا ينزل تحت المحجوز أبدًا. */
    public void reduceOnHand(int quantity) {
        this.onHand = Math.max(this.reserved, this.onHand - quantity);
        this.updatedAt = Instant.now();
    }

    public String getSku() { return sku; }
    public String getWarehouseId() { return warehouseId; }
    public int getOnHand() { return onHand; }
    public int getReserved() { return reserved; }
    public long getVersion() { return version; }
    public Instant getUpdatedAt() { return updatedAt; }
}
