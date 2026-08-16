package com.noon.inventory.repository;

import com.noon.inventory.domain.StockItem;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface StockItemRepository extends JpaRepository<StockItem, String> {

    /**
     * قفل تشاؤمي مرتّب أبجديًا حسب الـ sku.
     * الترتيب الثابت هو ما يمنع الـ deadlock عندما يحجز طلبان نفس المنتجات
     * بترتيب مختلف داخل سلتيهما.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select s from StockItem s where s.sku in :skus order by s.sku")
    List<StockItem> lockAllBySku(@Param("skus") Collection<String> skus);

    Optional<StockItem> findBySku(String sku);

    List<StockItem> findBySkuIn(Collection<String> skus);

    // ------------------------------------------------------------------ admin

    org.springframework.data.domain.Page<StockItem> findBySkuContainingIgnoreCaseOrderBySku(
            String term, org.springframework.data.domain.Pageable pageable);

    org.springframework.data.domain.Page<StockItem> findAllByOrderBySku(
            org.springframework.data.domain.Pageable pageable);

    /** المخزون المنخفض: ما تبقّى منه 5 قطع أو أقل. */
    @Query("select s from StockItem s where (s.onHand - s.reserved) <= :threshold order by (s.onHand - s.reserved)")
    org.springframework.data.domain.Page<StockItem> findLowStock(
            @Param("threshold") int threshold, org.springframework.data.domain.Pageable pageable);

    @Query("select count(s) from StockItem s where (s.onHand - s.reserved) <= 5")
    long countLowStock();

    @Query("select count(s) from StockItem s where (s.onHand - s.reserved) <= 0")
    long countOutOfStock();

    @Query("select coalesce(sum(s.onHand), 0) from StockItem s")
    long sumOnHand();

    @Query("select coalesce(sum(s.reserved), 0) from StockItem s")
    long sumReserved();
}
