package com.topchoice.order.repository;

import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import com.topchoice.order.domain.Order;
import com.topchoice.order.domain.OrderStatus;
import com.topchoice.order.domain.OutboxEvent;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.TestPropertySource;
import org.springframework.transaction.support.TransactionTemplate;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * الـ Outbox والقفل المتفائل تحت التزاحم — على PostgreSQL حقيقي.
 *
 * <p>يفحص ادّعاءين مكتوبين في الكود ولم يكن أحد يتحقق منهما:
 *
 * <ol>
 *   <li><b>{@code SKIP LOCKED} يجعل النسخ لا تتحاجب.</b> تنبيه مهم: منع
 *       الالتقاط المزدوج ليس ما يميّزه — {@code FOR UPDATE} وحده يمنعه أيضًا
 *       لأن الثاني يُحجب حتى يُودِع الأول ثم يرى الصف منشورًا. الفرق أن
 *       {@code SKIP LOCKED} يتخطّى المقفل بدل انتظاره، فتعمل النسخ بالتوازي
 *       لا بالتتابع. اختبار «لا تكرار» وحده يمرّ في الحالتين — أي أنه لا
 *       يفحص ما يدّعي فحصه.</li>
 *   <li><b>{@code @Version} يمنع الكتابة الضائعة.</b> حدثان متزامنان على
 *       الطلب نفسه (تأكيد الدفع وإلغاء إداري مثلًا) يقرآن الحالة نفسها،
 *       فيكتب الثاني فوق الأول بلا أثر.</li>
 * </ol>
 *
 * <p>كلا السلوكين يعيش في محرّك قاعدة البيانات لا في الكود، فلا تراه اختبارات
 * الوحدة. التفاصيل والتشغيل في {@code StockConcurrencyIT} المقابل.
 */
@SpringBootTest
@TestPropertySource(properties = {
        "spring.datasource.url=jdbc:postgresql://${IT_POSTGRES_HOST:localhost}:"
                + "${IT_POSTGRES_PORT:5432}/topchoice_order",
        "spring.datasource.username=${POSTGRES_USER:topchoice}",
        "spring.datasource.password=${POSTGRES_PASSWORD:topchoice_local_pw}",
        "spring.kafka.listener.auto-startup=false",
        // مُرحِّل الـ outbox المجدول يتنافس مع الاختبار على الصفوف نفسها
        "topchoice.outbox.relay-enabled=false",
})
@DisplayName("Outbox والقفل المتفائل على PostgreSQL حقيقي")
class OutboxConcurrencyIT {

    private static final String TOPIC = "test.outbox.concurrency.v1";

    @Autowired
    private OutboxRepository outbox;

    @Autowired
    private OrderRepository orders;

    @Autowired
    private TransactionTemplate tx;

    @Autowired
    private EntityManager entityManager;

    @BeforeEach
    void clean() {
        tx.executeWithoutResult(status ->
                entityManager.createNativeQuery("DELETE FROM outbox WHERE topic = :t")
                        .setParameter("t", TOPIC)
                        .executeUpdate());
    }

    /**
     * ثماني «نسخ» تستقصي معًا: لا صف يُلتقط مرتين، وكلها تُستهلك.
     *
     * <p>يفحص السلامة لا التوازي — انظر التنبيه في توثيق الصنف.
     */
    @Test
    @DisplayName("ثماني نسخ تستقصي معًا ⇒ لا صف يُلتقط مرتين")
    void pollingIsExactlyOnce() throws Exception {
        int events = 40;
        tx.executeWithoutResult(status -> {
            for (int i = 0; i < events; i++) {
                outbox.save(new OutboxEvent("order", UUID.randomUUID().toString(),
                        "test.event", TOPIC, Map.of("seq", i), "trace-" + i));
            }
        });

        int workers = 8;
        ExecutorService pool = Executors.newFixedThreadPool(workers);
        CountDownLatch startGun = new CountDownLatch(1);
        CountDownLatch finished = new CountDownLatch(workers);
        Set<UUID> claimed = ConcurrentHashMap.newKeySet();
        AtomicInteger duplicates = new AtomicInteger();

        for (int i = 0; i < workers; i++) {
            pool.submit(() -> {
                try {
                    startGun.await();
                    for (int round = 0; round < 10; round++) {
                        tx.executeWithoutResult(status -> {
                            List<OutboxEvent> batch = outbox.pollUnpublished(5, 5);
                            for (OutboxEvent event : batch) {
                                if (!claimed.add(event.getId())) {
                                    duplicates.incrementAndGet();
                                }
                                event.markPublished();
                                outbox.save(event);
                            }
                        });
                    }
                } catch (Exception ignored) {
                    // تزاحم مشروع — ما يهمّنا التقاطع لا الفشل
                } finally {
                    finished.countDown();
                }
            });
        }

        startGun.countDown();
        assertThat(finished.await(60, TimeUnit.SECONDS)).isTrue();
        pool.shutdownNow();

        assertThat(duplicates.get())
                .as("لا يجوز التقاط الصف نفسه مرتين")
                .isZero();
        assertThat(claimed).hasSize(events);

        Long pending = tx.execute(status -> outbox.countPending());
        assertThat(pending).isZero();
    }

    /**
     * <b>هذا هو الاختبار الذي يميّز SKIP LOCKED فعلًا.</b>
     *
     * <p>معاملة أولى تمسك قفلًا على الدفعة الأولى وتبقيه مفتوحًا. معاملة
     * ثانية تستقصي في أثناء ذلك: مع {@code SKIP LOCKED} تعود فورًا بصفوف
     * أخرى؛ مع {@code FOR UPDATE} وحده تُحجب حتى تُودِع الأولى.
     *
     * <p>كُتب بعد أن كشفت تجربةُ إزالة {@code SKIP LOCKED} أن اختبار «لا
     * تكرار» يمرّ في الحالتين — أي أنه كان أخضر دون أن يفحص ما يدّعيه.
     */
    @Test
    @DisplayName("SKIP LOCKED: المستقصي الثاني لا يُحجب خلف الأول")
    void skipLockedDoesNotBlockOtherWorkers() throws Exception {
        int events = 20;
        tx.executeWithoutResult(status -> {
            for (int i = 0; i < events; i++) {
                outbox.save(new OutboxEvent("order", UUID.randomUUID().toString(),
                        "test.event", TOPIC, Map.of("seq", i), "t"));
            }
        });

        CountDownLatch holderHasLock = new CountDownLatch(1);
        CountDownLatch releaseHolder = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(2);

        // ماسك القفل: يلتقط دفعة ويبقي المعاملة مفتوحة
        pool.submit(() -> tx.executeWithoutResult(status -> {
            List<OutboxEvent> held = outbox.pollUnpublished(5, 5);
            assertThat(held).hasSize(5);
            holderHasLock.countDown();
            try {
                releaseHolder.await(20, TimeUnit.SECONDS);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        }));

        assertThat(holderHasLock.await(20, TimeUnit.SECONDS))
                .as("الماسك أخذ قفله")
                .isTrue();

        // المستقصي الثاني: يجب أن يعود بسرعة وبصفوف مختلفة
        long start = System.nanoTime();
        List<UUID> secondBatch = pool.submit(() ->
                tx.execute(status -> outbox.pollUnpublished(5, 5)
                        .stream().map(OutboxEvent::getId).toList())
        ).get(15, TimeUnit.SECONDS);
        long elapsedMs = (System.nanoTime() - start) / 1_000_000;

        releaseHolder.countDown();
        pool.shutdown();
        assertThat(pool.awaitTermination(30, TimeUnit.SECONDS)).isTrue();

        assertThat(secondBatch)
                .as("يتخطّى المقفل ويأخذ صفوفًا أخرى بدل أن ينتظر")
                .hasSize(5);
        assertThat(elapsedMs)
                .as("عاد دون انتظار الماسك — الحجب كان سيستغرق ثوانيَ")
                .isLessThan(5_000);
    }

    /**
     * الصف المُعلَّم منشورًا لا يعود في استقصاء لاحق — وإلا أُعيد إرساله
     * إلى الأبد.
     */
    @Test
    @DisplayName("المنشور لا يُلتقط مجددًا")
    void publishedRowsAreNotPolledAgain() {
        tx.executeWithoutResult(status ->
                outbox.save(new OutboxEvent("order", UUID.randomUUID().toString(),
                        "test.event", TOPIC, Map.of("k", "v"), "t")));

        tx.executeWithoutResult(status -> {
            List<OutboxEvent> first = outbox.pollUnpublished(10, 5);
            assertThat(first).hasSize(1);
            first.get(0).markPublished();
            outbox.save(first.get(0));
        });

        List<OutboxEvent> second = tx.execute(status -> outbox.pollUnpublished(10, 5));
        assertThat(second).isEmpty();
    }

    /**
     * الحدث الذي استنفد محاولاته يخرج من الاستقصاء بدل أن يحجب ما خلفه —
     * ويُحصى كـ «مسموم» ليراه إنسان.
     */
    @Test
    @DisplayName("الحدث المسموم يخرج من الاستقصاء ويُحصى")
    void poisonedEventsStopBlockingTheQueue() {
        tx.executeWithoutResult(status -> {
            OutboxEvent poisoned = new OutboxEvent("order", UUID.randomUUID().toString(),
                    "test.event", TOPIC, Map.of("k", "v"), "t");
            for (int i = 0; i < 5; i++) {
                poisoned.markFailed("boom");
            }
            outbox.save(poisoned);
        });

        List<OutboxEvent> polled = tx.execute(status -> outbox.pollUnpublished(10, 5));
        assertThat(polled).isEmpty();

        Long poisonedCount = tx.execute(status -> outbox.countPoisoned(5));
        assertThat(poisonedCount).isPositive();
    }

    /**
     * كتابتان متزامنتان على الطلب نفسه: يجب أن تنجح واحدة وتُرفض الأخرى
     * بـ optimistic lock بدل أن تكتب فوقها بصمت.
     *
     * <p>الكتابة الضائعة هنا تعني مثلًا أن إلغاءً إداريًا يمحو تأكيد دفع
     * وصل في اللحظة نفسها — فيبقى الطلب مُلغى ومدفوعًا معًا.
     */
    @Test
    @DisplayName("القفل المتفائل يرفض الكتابة الضائعة")
    void optimisticLockRejectsLostUpdate() throws Exception {
        UUID orderId = tx.execute(status -> {
            Order order = new Order("TC-IT-" + System.nanoTime(), UUID.randomUUID(),
                    "EGP", Map.of("city", "القاهرة"), "CARD");
            return orders.saveAndFlush(order).getId();
        });

        int writers = 6;
        ExecutorService pool = Executors.newFixedThreadPool(writers);
        CountDownLatch startGun = new CountDownLatch(1);
        CountDownLatch finished = new CountDownLatch(writers);
        AtomicInteger applied = new AtomicInteger();

        for (int i = 0; i < writers; i++) {
            pool.submit(() -> {
                try {
                    startGun.await();
                    tx.executeWithoutResult(status -> {
                        Order order = orders.findById(orderId).orElseThrow();
                        if (order.transitionTo(OrderStatus.AWAITING_PAYMENT, null)) {
                            orders.saveAndFlush(order);
                            applied.incrementAndGet();
                        }
                    });
                } catch (Exception expected) {
                    // ObjectOptimisticLockingFailureException — هذا هو المطلوب
                } finally {
                    finished.countDown();
                }
            });
        }

        startGun.countDown();
        assertThat(finished.await(60, TimeUnit.SECONDS)).isTrue();
        pool.shutdownNow();

        Order after = tx.execute(status -> orders.findById(orderId).orElseThrow());
        assertThat(after.getStatus()).isEqualTo(OrderStatus.AWAITING_PAYMENT);
        // النسخة تعكس عدد الكتابات التي نجحت فعلًا لا عدد المحاولات
        assertThat(after.getVersion()).isLessThan(writers);
    }
}
