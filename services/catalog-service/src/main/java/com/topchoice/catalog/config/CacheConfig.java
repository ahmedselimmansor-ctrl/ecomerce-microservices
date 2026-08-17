package com.topchoice.catalog.config;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.JavaType;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.topchoice.catalog.api.dto.CatalogDtos.CategoryView;
import com.topchoice.catalog.api.dto.CatalogDtos.ProductView;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.cache.Cache;
import org.springframework.cache.annotation.CachingConfigurer;
import org.springframework.cache.interceptor.CacheErrorHandler;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.cache.RedisCacheConfiguration;
import org.springframework.data.redis.cache.RedisCacheManager;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.serializer.Jackson2JsonRedisSerializer;
import org.springframework.data.redis.serializer.RedisSerializationContext;
import org.springframework.data.redis.serializer.RedisSerializer;
import org.springframework.data.redis.serializer.StringRedisSerializer;

import java.time.Duration;
import java.util.List;
import java.util.Map;

@Configuration
public class CacheConfig implements CachingConfigurer {

    private static final Logger log = LoggerFactory.getLogger(CacheConfig.class);

    /**
     * كل كاش له serializer مرتبط بنوعه الفعلي.
     *
     * <p>لماذا لا {@code GenericJackson2JsonRedisSerializer}؟ لأنه يعتمد على
     * كتابة {@code @class} داخل الـ JSON، وTyping الافتراضي في Jackson
     * ({@code NON_FINAL}) لا يكتبها للـ records لأنها أنواع نهائية — فتعود
     * القيمة من Redis كـ {@code LinkedHashMap} ويفشل التحويل.
     *
     * <p>الربط بالنوع هنا يحل ذلك، وله ميزتان إضافيتان: حجم أصغر على الشبكة،
     * وإغلاق باب هجمات إلغاء التسلسل (deserialization gadgets) لأننا لا نثق
     * في اسم صنف قادم من قيمة مخزّنة.
     */
    @Bean
    public RedisCacheManager cacheManager(RedisConnectionFactory factory) {
        ObjectMapper mapper = new ObjectMapper()
                .registerModule(new JavaTimeModule())
                .setSerializationInclusion(JsonInclude.Include.NON_NULL)
                .configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);

        RedisCacheConfiguration base = RedisCacheConfiguration.defaultCacheConfig()
                .disableCachingNullValues()
                .prefixCacheNameWith("catalog::")
                .serializeKeysWith(RedisSerializationContext.SerializationPair
                        .fromSerializer(new StringRedisSerializer()));

        JavaType productType = mapper.getTypeFactory().constructType(ProductView.class);
        JavaType categoryType = mapper.getTypeFactory().constructType(CategoryView.class);
        JavaType categoryListType = mapper.getTypeFactory()
                .constructCollectionType(List.class, CategoryView.class);

        return RedisCacheManager.builder(factory)
                .cacheDefaults(base.entryTtl(Duration.ofMinutes(10)))
                .withInitialCacheConfigurations(Map.of(
                        // TTL لكل كاش حسب معدل تغيّر بياناته
                        "product",       typed(base, mapper, productType, Duration.ofMinutes(10)),
                        "productBySlug", typed(base, mapper, productType, Duration.ofMinutes(10)),
                        "category",      typed(base, mapper, categoryType, Duration.ofHours(1)),
                        "categoryTree",  typed(base, mapper, categoryListType, Duration.ofHours(6))))
                .transactionAware()
                .build();
    }

    @SuppressWarnings({"unchecked", "rawtypes"})
    private static RedisCacheConfiguration typed(RedisCacheConfiguration base,
                                                 ObjectMapper mapper,
                                                 JavaType type,
                                                 Duration ttl) {
        RedisSerializer serializer = new Jackson2JsonRedisSerializer<>(mapper, type);
        return base.entryTtl(ttl)
                .serializeValuesWith(RedisSerializationContext.SerializationPair
                        .fromSerializer(serializer));
    }

    /**
     * سقوط Redis يجب ألا يُسقط الخدمة: نسجّل الخطأ ونكمل بالقراءة من MongoDB.
     * السلوك الافتراضي في Spring هو رمي الاستثناء — غير مقبول لكاش اختياري.
     */
    @Override
    public CacheErrorHandler errorHandler() {
        return new CacheErrorHandler() {
            @Override
            public void handleCacheGetError(RuntimeException e, Cache cache, Object key) {
                log.warn("cache GET failed cache={} key={} : {}", cache.getName(), key, e.toString());
            }

            @Override
            public void handleCachePutError(RuntimeException e, Cache cache, Object key, Object value) {
                log.warn("cache PUT failed cache={} key={} : {}", cache.getName(), key, e.toString());
            }

            @Override
            public void handleCacheEvictError(RuntimeException e, Cache cache, Object key) {
                log.warn("cache EVICT failed cache={} key={} : {}", cache.getName(), key, e.toString());
            }

            @Override
            public void handleCacheClearError(RuntimeException e, Cache cache) {
                log.warn("cache CLEAR failed cache={} : {}", cache.getName(), e.toString());
            }
        };
    }
}
