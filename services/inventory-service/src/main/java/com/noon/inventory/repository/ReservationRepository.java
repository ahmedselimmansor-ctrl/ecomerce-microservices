package com.noon.inventory.repository;

import com.noon.inventory.domain.Reservation;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public interface ReservationRepository extends JpaRepository<Reservation, UUID> {

    List<Reservation> findByOrderId(UUID orderId);

    boolean existsByOrderId(UUID orderId);

    List<Reservation> findByOrderIdAndStatus(UUID orderId, String status);

    /**
     * الحجوزات المنتهية صلاحيتها. {@code SKIP LOCKED} يسمح لعدة نسخ من الخدمة
     * بتنفيذ عملية التنظيف بالتوازي دون تعارض.
     */
    @Query(value = """
            SELECT * FROM reservations
            WHERE status = 'HELD' AND expires_at < :now
            ORDER BY expires_at
            LIMIT :limit
            FOR UPDATE SKIP LOCKED
            """, nativeQuery = true)
    List<Reservation> findExpired(@Param("now") Instant now, @Param("limit") int limit);

    @Query("select r from Reservation r where r.status = 'HELD' order by r.createdAt")
    List<Reservation> findAllHeld(Pageable pageable);
}
