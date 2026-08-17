package com.topchoice.inventory.repository;

import com.topchoice.inventory.domain.ProcessedEvent;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;

public interface ProcessedEventRepository
        extends JpaRepository<ProcessedEvent, ProcessedEvent.Key> {

    @Modifying
    @Query(value = """
            DELETE FROM processed_events WHERE processed_at < :cutoff
            """, nativeQuery = true)
    int purgeOlderThan(@Param("cutoff") Instant cutoff);
}
