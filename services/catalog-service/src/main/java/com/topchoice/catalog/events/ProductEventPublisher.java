package com.topchoice.catalog.events;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Component;

@Component
public class ProductEventPublisher {

    private static final Logger log = LoggerFactory.getLogger(ProductEventPublisher.class);

    private final KafkaTemplate<String, Object> kafka;
    private final String topic;

    public ProductEventPublisher(KafkaTemplate<String, Object> kafka,
                                 @Value("${topchoice.catalog.topic}") String topic) {
        this.kafka = kafka;
        this.topic = topic;
    }

    /**
     * التقسيم بـ {@code sku} يضمن ترتيب الأحداث لنفس المنتج داخل نفس الـ partition،
     * فلا يسبق تحديث قديم تحديثًا أحدث في فهرس البحث.
     */
    public void publish(ProductEvent event) {
        kafka.send(topic, event.aggregateId(), event)
                .whenComplete((result, ex) -> {
                    if (ex != null) {
                        // الفهرس يمكن إعادة بنائه من MongoDB، فلا نُفشل طلب المستخدم
                        log.error("failed to publish {} for sku={}",
                                event.eventType(), event.aggregateId(), ex);
                    } else if (log.isDebugEnabled()) {
                        log.debug("published {} sku={} offset={}", event.eventType(),
                                event.aggregateId(), result.getRecordMetadata().offset());
                    }
                });
    }
}
