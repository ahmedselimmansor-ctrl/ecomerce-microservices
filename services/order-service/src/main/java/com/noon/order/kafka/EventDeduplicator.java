package com.noon.order.kafka;

import com.noon.order.domain.ProcessedEvent;
import com.noon.order.repository.ProcessedEventRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;

/**
 * إزالة تكرار الأحداث.
 *
 * <p>مكوّن مستقل عمدًا: {@code @Transactional} لا يعمل عند استدعاء الدالة من
 * داخل نفس الـ bean (self-invocation لا يمر عبر الـ proxy)، فلا بد أن يكون
 * المستدعي كائنًا آخر.
 */
@Component
public class EventDeduplicator {

    private static final Logger log = LoggerFactory.getLogger(EventDeduplicator.class);

    private final ProcessedEventRepository processed;

    public EventDeduplicator(ProcessedEventRepository processed) {
        this.processed = processed;
    }

    /**
     * يحجز الحدث لمستهلك معيّن.
     *
     * <p>{@code REQUIRES_NEW} مقصود: السجل يجب أن يُثبَّت في معاملته الخاصة
     * حتى لا يُفقد إن فشلت معاملة معالجة الحدث لاحقًا لسبب آخر.
     *
     * @return {@code true} إن كان هذا أول ظهور للحدث
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public boolean claim(UUID eventId, String consumer) {
        if (processed.existsById(new ProcessedEvent.Key(eventId, consumer))) {
            return false;
        }
        try {
            processed.saveAndFlush(new ProcessedEvent(eventId, consumer));
            return true;
        } catch (DataIntegrityViolationException e) {
            // نسخة أخرى من الخدمة حجزت الحدث في نفس اللحظة
            return false;
        }
    }

    @Scheduled(cron = "0 45 3 * * *")
    @Transactional
    public void purgeOld() {
        int deleted = processed.purgeOlderThan(Instant.now().minus(14, ChronoUnit.DAYS));
        if (deleted > 0) {
            log.info("purged {} processed-event records", deleted);
        }
    }
}
