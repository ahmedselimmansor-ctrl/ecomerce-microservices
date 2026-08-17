package com.topchoice.order.client;

import io.github.resilience4j.circuitbreaker.annotation.CircuitBreaker;
import io.github.resilience4j.retry.annotation.Retry;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.web.client.RestClientCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.time.Duration;
import java.util.List;
import java.util.Map;

/**
 * عميل الكتالوج.
 *
 * <p>هذا واحد من الاستدعاءات المتزامنة القليلة المسموحة بين الخدمات، وله سبب
 * أمني: <b>السعر يجب أن يُقرأ من مصدره لا من العميل</b>. لو وثقنا في السعر
 * القادم من المتصفح لأمكن شراء أي منتج بدرهم واحد.
 */
@Component
public class CatalogClient {

    private static final Logger log = LoggerFactory.getLogger(CatalogClient.class);

    private final RestClient client;

    public CatalogClient(RestClient.Builder builder,
                         @Value("${topchoice.services.catalog-url}") String baseUrl) {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(Duration.ofMillis(800));
        factory.setReadTimeout(Duration.ofSeconds(2));
        this.client = builder.baseUrl(baseUrl).requestFactory(factory).build();
    }

    public record CatalogProduct(String sku, String slug, String title, String brandName,
                                 String currency, long priceMinor, Long wasMinor,
                                 Integer discountPercent, String image,
                                 Double rating, Integer ratingCount, List<String> tags) {
    }

    /**
     * جلب دفعي للأسعار. الفشل هنا <b>يُفشل</b> إنشاء الطلب عمدًا:
     * السماح بطلب بأسعار غير مؤكدة أسوأ بكثير من رفضه.
     */
    @CircuitBreaker(name = "catalog")
    @Retry(name = "catalog")
    public List<CatalogProduct> fetchBySkus(List<String> skus, String locale) {
        return client.post()
                .uri("/api/v1/products/bulk")
                .header("Accept-Language", locale == null ? "ar" : locale)
                .body(Map.of("skus", skus))
                .retrieve()
                .body(new org.springframework.core.ParameterizedTypeReference<List<CatalogProduct>>() {
                });
    }

    @Configuration
    static class RestClientConfig {
        @Bean
        RestClientCustomizer restClientCustomizer() {
            return builder -> builder.requestInterceptor((request, body, execution) -> {
                request.getHeaders().add("x-internal-caller", "order-service");
                long start = System.nanoTime();
                try {
                    return execution.execute(request, body);
                } finally {
                    long ms = (System.nanoTime() - start) / 1_000_000;
                    if (ms > 500) {
                        log.warn("slow downstream call {} {} took {}ms",
                                request.getMethod(), request.getURI().getPath(), ms);
                    }
                }
            });
        }
    }
}
