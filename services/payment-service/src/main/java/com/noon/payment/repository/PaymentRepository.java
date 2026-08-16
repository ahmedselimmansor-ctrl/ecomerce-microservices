package com.noon.payment.repository;

import com.noon.payment.domain.Payment;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface PaymentRepository extends JpaRepository<Payment, UUID> {

    Optional<Payment> findByOrderId(UUID orderId);

    List<Payment> findByUserIdOrderByCreatedAtDesc(UUID userId, Pageable pageable);

    /** تفويضات لم تُخصم ولم تُلغَ — تنتهي صلاحيتها لدى المزوّد بعد ~7 أيام. */
    @Query("select p from Payment p where p.status = 'AUTHORIZED' and p.createdAt < :cutoff")
    List<Payment> findStaleAuthorizations(@Param("cutoff") Instant cutoff, Pageable pageable);
}
