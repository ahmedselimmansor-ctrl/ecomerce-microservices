package com.topchoice.order.outbox;

import com.topchoice.order.domain.OutboxEvent;
import com.topchoice.order.repository.OutboxRepository;
import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;

/**
 * ناقل الـ Outbox: يقرأ الأحداث غير المنشورة وينشرها على Kafka.
 *
 * <p>هذا يمنح ضمان <b>at-least-once</b>: قد يُنشر الحدث مرتين إن سقطت الخدمة
 * بعد الإرسال وقبل تحديث {@code published_at}، ولهذا كل مستهلك في النظام
 * لديه جدول {@code processed_events}.
 *
 * <p><b>بديل الإنتاج:</b> Debezium على MSK Connect يقرأ WAL مباشرة، فيلغي
 * الاستطلاع الدوري ويقلّل زمن النشر إلى أجزاء من الثانية.
 */
@Component
public class OutboxRelay {

    private static final Logger log = LoggerFactory.getLogger(OutboxRelay.class);

    private final OutboxRepository outbox;
    private final KafkaTemplate<String, Object> kafka;
    private final int batchSize;
    private final int maxAttempts;
    private final AtomicLong pendingGauge = new AtomicLong(0);

    public OutboxRelay(OutboxRepository outbox,
                       KafkaTemplate<String, Object> kafka,
                       MeterRegistry metrics,
                       @Value("${topchoice.outbox.batch-size:100}") int batchSize,
                       @Value("${topchoice.outbox.max-attempts:10}") int maxAttempts) {
        this.outbox = outbox;
        this.kafka = kafka;
        this.batchSize = batchSize;
        this.maxAttempts = maxAttempts;

        Gauge.builder("topchoice.outbox.pending", pendingGauge, AtomicLong::get)
                .description("Outbox rows awaiting publication")
                .register(metrics);
    }

    @Scheduled(fixedDelayString = "${topchoice.outbox.poll-delay-ms:500}")
    @Transactional
    public void relay() {
        List<OutboxEvent> batch = outbox.pollUnpublished(batchSize, maxAttempts);
        if (batch.isEmpty()) {
            return;
        }

        for (OutboxEvent event : batch) {
            try {
                Map<String, Object> envelope = Map.of(
                        "eventId", event.getId().toString(),
                        "eventType", event.getEventType(),
                        "version", 1,
                        "occurredAt", event.getCreatedAt().toString(),
                        "traceId", event.getTraceId() == null ? "" : event.getTraceId(),
                        "aggregateId", event.getAggregateId(),
                        "payload", event.getPayload());

                // إرسال متزامن داخل المعاملة: الفشل يعني عدم تعليم الصف كمنشور
                kafka.send(event.getTopic(), event.getAggregateId(), envelope)
                        .get(5, TimeUnit.SECONDS);

                event.markPublished();

            } catch (Exception e) {
                event.markFailed(e.getMessage());
                if (event.getAttempts() >= maxAttempts) {
                    log.error("outbox event {} type={} exhausted {} attempts — manual intervention "
                                    + "required", event.getId(), event.getEventType(), maxAttempts, e);
                } else {
                    log.warn("outbox publish failed id={} attempt={} : {}",
                            event.getId(), event.getAttempts(), e.toString());
                }
            }
        }
        outbox.saveAll(batch);
    }

    /** مقياس يُنبَّه عليه: تراكم الـ outbox يعني توقف الـ Saga. */
    @Scheduled(fixedDelay = 15_000)
    @Transactional(readOnly = true)
    public void reportPending() {
        long pending = outbox.countPending();
        pendingGauge.set(pending);

        long poisoned = outbox.countPoisoned(maxAttempts);
        if (poisoned > 0) {
            log.error("{} outbox events are stuck after {} attempts", poisoned, maxAttempts);
        } else if (pending > 1000) {
            log.warn("outbox backlog is {} events — check Kafka connectivity", pending);
        }
    }

    /** الأحداث المنشورة تبقى 7 أيام للتدقيق ثم تُحذف حتى لا ينتفخ الجدول. */
    @Scheduled(cron = "0 15 3 * * *")
    @Transactional
    public void purgePublished() {
        int deleted = outbox.purgePublishedBefore(Instant.now().minus(7, ChronoUnit.DAYS));
        if (deleted > 0) {
            log.info("purged {} published outbox rows", deleted);
        }
    }
}
