package com.topchoice.order.repository;

import com.topchoice.order.domain.IdempotencyKey;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;

public interface IdempotencyKeyRepository extends JpaRepository<IdempotencyKey, String> {

    @Modifying
    @Query("delete from IdempotencyKey k where k.createdAt < :cutoff")
    int purgeOlderThan(@Param("cutoff") Instant cutoff);
}
