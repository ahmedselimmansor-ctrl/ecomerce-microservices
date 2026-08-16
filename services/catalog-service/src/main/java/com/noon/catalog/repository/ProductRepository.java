package com.noon.catalog.repository;

import com.noon.catalog.domain.Product;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.data.mongodb.repository.Query;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface ProductRepository extends MongoRepository<Product, String> {

    Optional<Product> findBySku(String sku);

    Optional<Product> findBySkuAndStatus(String sku, String status);

    Optional<Product> findBySlugAndStatus(String slug, String status);

    List<Product> findBySkuInAndStatus(Collection<String> skus, String status);

    Page<Product> findByStatus(String status, Pageable pageable);

    Page<Product> findByCategoryPathContainingAndStatus(String categorySlug, String status,
                                                        Pageable pageable);

    Page<Product> findByBrandIdAndStatus(String brandId, String status, Pageable pageable);

    /** «منتجات مشابهة» بسيطة: نفس القسم الأعمق، باستثناء المنتج نفسه. */
    @Query("{ 'categoryPath': ?0, 'sku': { $ne: ?1 }, 'status': 'ACTIVE' }")
    List<Product> findSimilar(String categorySlug, String excludeSku, Pageable pageable);

    boolean existsBySku(String sku);

    long countByCategoryPathContainingAndStatus(String categorySlug, String status);

    // ------------------------------------------------------------------ admin

    long countByStatus(String status);

    Page<Product> findByStatusAndCategoryPathContaining(String status, String categorySlug,
                                                        Pageable pageable);

    /**
     * بحث لوحة التحكم عبر الـ sku والعنوانين والعلامة.
     * {@code $options: 'i'} يجعله غير حساس لحالة الأحرف.
     */
    @Query("""
            { $and: [
              { $or: [ { 'status': { $regex: ?1 } } ] },
              { $or: [
                { 'sku':        { $regex: ?0, $options: 'i' } },
                { 'slug':       { $regex: ?0, $options: 'i' } },
                { 'title.ar':   { $regex: ?0, $options: 'i' } },
                { 'title.en':   { $regex: ?0, $options: 'i' } },
                { 'brand.name': { $regex: ?0, $options: 'i' } }
              ] }
            ] }
            """)
    Page<Product> adminSearch(String term, String statusRegex, Pageable pageable);

    @Query("{ 'status': { $regex: ?0 } }")
    Page<Product> findByStatusRegex(String statusRegex, Pageable pageable);
}
