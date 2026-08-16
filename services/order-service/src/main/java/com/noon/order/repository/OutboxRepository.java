package com.noon.order.repository;

import com.noon.order.domain.OutboxEvent;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public interface OutboxRepository extends JpaRepository<OutboxEvent, UUID> {

    /**
     * {@code FOR UPDATE SKIP LOCKED} هو ما يجعل تشغيل عدة نسخ من الخدمة آمنًا:
     * كل نسخة تلتقط دفعة مختلفة بدل أن تتزاحم على نفس الصفوف.
     */
    @Query(value = """
            SELECT * FROM outbox
            WHERE published_at IS NULL AND attempts < :maxAttempts
            ORDER BY created_at
            LIMIT :batchSize
            FOR UPDATE SKIP LOCKED
            """, nativeQuery = true)
    List<OutboxEvent> pollUnpublished(@Param("batchSize") int batchSize,
                                      @Param("maxAttempts") int maxAttempts);

    @Query("select count(o) from OutboxEvent o where o.publishedAt is null")
    long countPending();

    /** أحداث علقت رغم استنفاد المحاولات — تحتاج تدخلًا بشريًا. */
    @Query("select count(o) from OutboxEvent o " +
           "where o.publishedAt is null and o.attempts >= :maxAttempts")
    long countPoisoned(@Param("maxAttempts") int maxAttempts);

    @Modifying
    @Query("delete from OutboxEvent o where o.publishedAt is not null and o.publishedAt < :cutoff")
    int purgePublishedBefore(@Param("cutoff") Instant cutoff);
}
