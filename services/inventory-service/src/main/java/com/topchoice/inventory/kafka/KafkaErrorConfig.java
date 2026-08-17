package com.topchoice.inventory.kafka;

import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.listener.DeadLetterPublishingRecoverer;
import org.springframework.kafka.listener.DefaultErrorHandler;
import org.apache.kafka.common.TopicPartition;
import org.springframework.util.backoff.ExponentialBackOff;

@Configuration
public class KafkaErrorConfig {

    private static final Logger log = LoggerFactory.getLogger(KafkaErrorConfig.class);

    /**
     * إعادة محاولة بتراجع أسّي، ثم تحويل الرسالة إلى
     * {@code <topic>.dlq} بدل حجب الـ partition إلى الأبد.
     */
    @Bean
    public DefaultErrorHandler kafkaErrorHandler(KafkaTemplate<String, Object> template) {
        DeadLetterPublishingRecoverer recoverer = new DeadLetterPublishingRecoverer(
                template,
                (ConsumerRecord<?, ?> record, Exception ex) -> {
                    // نسجّل الاستثناء كاملًا: بدون سلسلة الأسباب يستحيل تشخيص
                    // سبب وصول الرسالة إلى الـ DLQ
                    log.error("sending to DLQ topic={} partition={} offset={}",
                            record.topic(), record.partition(), record.offset(), ex);
                    // -1 يترك اختيار الـ partition لـ Kafka: قد يكون عدد أقسام
                    // الـ DLQ أقل من الـ topic الأصلي
                    return new TopicPartition(record.topic() + ".dlq", -1);
                });

        ExponentialBackOff backOff = new ExponentialBackOff(1_000L, 2.0);
        backOff.setMaxElapsedTime(30_000L);

        DefaultErrorHandler handler = new DefaultErrorHandler(recoverer, backOff);
        // أخطاء غير قابلة للإصلاح بالإعادة — إلى الـ DLQ مباشرة
        handler.addNotRetryableExceptions(IllegalArgumentException.class);
        return handler;
    }
}
