package com.topchoice.payment.repository;

import com.topchoice.payment.domain.PaymentAudit;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface PaymentAuditRepository extends JpaRepository<PaymentAudit, Long> {

    List<PaymentAudit> findByPaymentIdOrderByCreatedAtAsc(UUID paymentId);
}
