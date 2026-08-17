package com.topchoice.catalog.config;

import com.topchoice.catalog.domain.Category;
import com.topchoice.catalog.domain.Product;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.domain.Sort;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.index.Index;
import org.springframework.data.mongodb.core.index.TextIndexDefinition;

/**
 * إنشاء الفهارس صراحةً عند الإقلاع بدل {@code auto-index-creation}،
 * لأن الإنشاء التلقائي يخفي تكلفة الفهارس ويفاجئك في الإنتاج.
 * على Amazon DocumentDB يجب التأكد من دعم كل نوع فهرس في نسخة المحرك.
 */
@Configuration
public class MongoIndexInitializer {

    private static final Logger log = LoggerFactory.getLogger(MongoIndexInitializer.class);

    @Bean
    public ApplicationRunner createIndexes(MongoTemplate mongo) {
        return args -> {
            var products = mongo.indexOps(Product.class);

            products.ensureIndex(new Index().on("sku", Sort.Direction.ASC).unique().named("uq_sku"));
            products.ensureIndex(new Index().on("slug", Sort.Direction.ASC).unique().named("uq_slug"));

            // فهرس مركّب يخدم تصفح القسم مع الفرز بالسعر
            products.ensureIndex(new Index()
                    .on("categoryPath", Sort.Direction.ASC)
                    .on("status", Sort.Direction.ASC)
                    .on("price.amountMinor", Sort.Direction.ASC)
                    .named("ix_category_status_price"));

            products.ensureIndex(new Index()
                    .on("brand.id", Sort.Direction.ASC)
                    .on("status", Sort.Direction.ASC)
                    .named("ix_brand_status"));

            // يخدم مزامنة الفهرس التزايدية (delta indexing) في search-service
            products.ensureIndex(new Index()
                    .on("status", Sort.Direction.ASC)
                    .on("updatedAt", Sort.Direction.DESC)
                    .named("ix_status_updated"));

            try {
                products.ensureIndex(TextIndexDefinition.builder()
                        .onField("title.ar", 3F)
                        .onField("title.en", 3F)
                        .onField("tags", 2F)
                        .onField("brand.name", 2F)
                        .named("ix_text_search")
                        .build());
            } catch (RuntimeException e) {
                // البحث الحقيقي في OpenSearch؛ الفهرس النصي مجرد احتياطي
                log.warn("text index not created ({}), falling back to OpenSearch only",
                        e.getMessage());
            }

            var categories = mongo.indexOps(Category.class);
            categories.ensureIndex(new Index().on("slug", Sort.Direction.ASC).unique().named("uq_cat_slug"));
            categories.ensureIndex(new Index().on("parentSlug", Sort.Direction.ASC).named("ix_cat_parent"));

            log.info("mongo indexes ensured for products & categories");
        };
    }
}
