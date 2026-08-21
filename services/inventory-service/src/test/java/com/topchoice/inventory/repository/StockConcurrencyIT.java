package com.topchoice.inventory.repository;

import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import com.topchoice.inventory.domain.StockItem;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.TestPropertySource;
import org.springframework.transaction.support.TransactionTemplate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowable;

/**
 * البيع الزائد تحت التزاحم — على PostgreSQL حقيقي.
 *
 * <p>هذا هو العطل الذي لا تمسكه اختبارات الوحدة إطلاقًا: منطق
 * {@code StockItem.reserve} صحيح تمامًا في الذاكرة، لكن طلبين متزامنين
 * يقرآن الصف نفسه قبل أن يكتب أحدهما فيرى كلاهما «متاح 1» ويحجزان معًا.
 * النتيجة قطعتان مبيعتان من واحدة، ويُكتشف العجز عند التجهيز — بعد أن دفع
 * العميلان.
 *
 * <h2>لماذا PostgreSQL حقيقي لا قاعدة في الذاكرة</h2>
 * <p>ما يمنع البيع الزائد هو {@code PESSIMISTIC_WRITE} أي {@code SELECT …
 * FOR UPDATE} على مستوى المحرّك، ومعه قيود {@code CHECK} في المخطّط. لا
 * وجود لأيٍّ منهما في H2 بسلوك مطابق، فاختبار هذا عليها يعطي ثقة كاذبة في
 * أخطر منطق لدينا.
 *
 * <h2>لماذا ليس Testcontainers</h2>
 * <p>محرّك Docker 25+ أسقط دعم API أقل من 1.40، وعميل docker-java المرفق مع
 * Testcontainers (حتى 1.21) ما زال يتفاوض بـ 1.32 — فيفشل بـ «Could not find
 * a valid Docker environment» التي تبدو كغياب Docker لا كعدم توافق. نعتمد
 * بدلًا منه على PostgreSQL الذي يشغّله docker-compose أصلًا.
 *
 * <h2>التشغيل</h2>
 * <pre>
 *   make up            # PostgreSQL يعمل
 *   make integration   # أو: mvn verify -Pintegration
 * </pre>
 *
 * <p>الاسم ينتهي بـ {@code IT} فلا يلتقطه surefire في {@code mvn test}؛
 * يشغّله failsafe في {@code mvn verify} وحده. هذا مقصود: اختبار وحدة يجب
 * أن يعمل على أي جهاز بلا بنية تحتية.
 */
@SpringBootTest
@TestPropertySource(properties = {
        "spring.datasource.url=jdbc:postgresql://${IT_POSTGRES_HOST:localhost}:"
                + "${IT_POSTGRES_PORT:5432}/topchoice_inventory",
        "spring.datasource.username=${POSTGRES_USER:topchoice}",
        "spring.datasource.password=${POSTGRES_PASSWORD:topchoice_local_pw}",
        "spring.flyway.placeholders.seedDemoData=false",
        // لا نستهلك Kafka في اختبار قاعدة بيانات
        "spring.kafka.listener.auto-startup=false",
})
@DisplayName("تزاحم المخزون على PostgreSQL حقيقي")
class StockConcurrencyIT {

    private static final String SKU = "TC-CONCURRENCY-IT";

    @Autowired
    private StockItemRepository stock;

    @Autowired
    private TransactionTemplate tx;

    @Autowired
    private EntityManager entityManager;

    @BeforeEach
    void seed() {
        tx.executeWithoutResult(status -> {
            stock.findBySku(SKU).ifPresent(stock::delete);
            stock.flush();
            stock.saveAndFlush(new StockItem(SKU, "CAI-1", 1));
        });
    }

    /**
     * عشرة خيوط تتسابق على قطعة واحدة. يجب أن ينجح واحد بالضبط.
     *
     * <p>البدء المتزامن عبر {@link CountDownLatch} مقصود: بدونه تنتهي معظم
     * الخيوط قبل أن تبدأ البقية، فيمرّ الاختبار دون أن يختبر تزاحمًا أصلًا —
     * وهو أسوأ أنواع الاختبارات: أخضر ولا يفحص شيئًا.
     */
    @Test
    @DisplayName("عشرة طلبات على قطعة واحدة ⇒ ينجح واحد فقط")
    void concurrentReservationsDoNotOversell() throws Exception {
        int successes = race(10, 1);

        assertThat(successes)
                .as("قطعة واحدة متاحة، فيجب أن ينجح حجز واحد لا أكثر")
                .isEqualTo(1);

        StockItem after = stock.findBySku(SKU).orElseThrow();
        assertThat(after.getReserved()).isEqualTo(1);
        assertThat(after.available()).isZero();
    }

    @Test
    @DisplayName("الثابت يصمد بعد تزاحم كامل")
    void invariantHoldsAfterContention() throws Exception {
        tx.executeWithoutResult(status -> {
            StockItem item = stock.findBySku(SKU).orElseThrow();
            item.restock(19);          // إجمالي 20
            stock.saveAndFlush(item);
        });

        int successes = race(30, 1);   // طلبات أكثر من المخزون

        StockItem after = stock.findBySku(SKU).orElseThrow();
        assertThat(successes).isEqualTo(20);
        assertThat(after.getReserved()).isEqualTo(successes);
        assertThat(after.available()).isZero();
        assertThat(after.available()).isEqualTo(after.getOnHand() - after.getReserved());
    }

    /**
     * قيد {@code CHECK (on_hand >= 0)} يعيش في قاعدة البيانات لا في الكود.
     * هذه هي الشبكة الأخيرة لو تسرّب يومًا مسار كتابة يلتفّ على منطق المجال.
     */
    @Test
    @DisplayName("قاعدة البيانات ترفض مخزونًا سالبًا")
    void databaseRejectsNegativeStock() {
        assertThat(catchThrowable(() -> forceUpdate("on_hand = -1")))
                .as("قيد CHECK يجب أن يمنع القيمة السالبة")
                .isNotNull();
    }

    @Test
    @DisplayName("قاعدة البيانات ترفض محجوزًا سالبًا")
    void databaseRejectsNegativeReserved() {
        assertThat(catchThrowable(() -> forceUpdate("reserved = -1"))).isNotNull();
    }

    // ------------------------------------------------------------------ أدوات

    /** يُطلق {@code threads} خيطًا تحجز {@code qty} معًا، ويعيد عدد الناجحة. */
    private int race(int threads, int qty) throws InterruptedException {
        ExecutorService pool = Executors.newFixedThreadPool(threads);
        CountDownLatch startGun = new CountDownLatch(1);
        CountDownLatch finished = new CountDownLatch(threads);
        AtomicInteger succeeded = new AtomicInteger();

        for (int i = 0; i < threads; i++) {
            pool.submit(() -> {
                try {
                    startGun.await();
                    tx.executeWithoutResult(status -> {
                        // نفس المسار الذي تسلكه الخدمة: قفل ثم فحص ثم كتابة
                        StockItem item = stock.lockAllBySku(List.of(SKU)).get(0);
                        if (item.canReserve(qty)) {
                            item.reserve(qty);
                            stock.saveAndFlush(item);
                            succeeded.incrementAndGet();
                        }
                    });
                } catch (Exception ignored) {
                    // رفض الحجز نتيجة مشروعة — ما يهمّنا العدد النهائي والثابت
                } finally {
                    finished.countDown();
                }
            });
        }

        startGun.countDown();
        assertThat(finished.await(60, TimeUnit.SECONDS))
                .as("انتهت كل الخيوط في المهلة")
                .isTrue();
        pool.shutdownNow();
        return succeeded.get();
    }

    private void forceUpdate(String assignment) {
        tx.executeWithoutResult(status ->
                entityManager
                        .createNativeQuery("UPDATE stock_items SET " + assignment
                                + " WHERE sku = :sku")
                        .setParameter("sku", SKU)
                        .executeUpdate());
    }
}
