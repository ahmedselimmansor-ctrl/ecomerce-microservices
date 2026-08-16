package com.noon.catalog.service;

import com.noon.catalog.api.dto.CatalogDtos.CategoryView;
import com.noon.catalog.domain.Category;
import com.noon.catalog.error.ApiException;
import com.noon.catalog.repository.CategoryRepository;
import com.noon.catalog.repository.ProductRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class CategoryService {

    private static final Logger log = LoggerFactory.getLogger(CategoryService.class);

    private final CategoryRepository categories;
    private final ProductRepository products;

    public CategoryService(CategoryRepository categories, ProductRepository products) {
        this.categories = categories;
        this.products = products;
    }

    /** شجرة الأقسام تتغير نادرًا جدًا ⇒ كاش طويل الأمد. */
    @Cacheable(value = "categoryTree", key = "#locale")
    public List<CategoryView> tree(String locale) {
        return categories.findByParentSlugIsNullAndActiveIsTrueOrderBySortOrderAsc()
                .stream()
                .map(root -> CategoryView.of(root, locale, childrenOf(root.getSlug(), locale)))
                .toList();
    }

    @Cacheable(value = "category", key = "#slug + ':' + #locale")
    public CategoryView get(String slug, String locale) {
        Category c = categories.findBySlugAndActiveIsTrue(slug)
                .orElseThrow(() -> ApiException.notFound("CATEGORY_NOT_FOUND",
                        "No category with slug " + slug));
        return CategoryView.of(c, locale, childrenOf(slug, locale));
    }

    private List<CategoryView> childrenOf(String parentSlug, String locale) {
        return categories.findByParentSlugAndActiveIsTrueOrderBySortOrderAsc(parentSlug)
                .stream()
                // مستويان يكفيان للقائمة الرئيسية؛ الأعمق يُحمَّل عند الطلب
                .map(c -> CategoryView.of(c, locale, List.of()))
                .toList();
    }

    /**
     * تحديث عدّاد المنتجات دوريًا بدل حسابه عند كل طلب.
     * في الإنتاج ينفَّذ كـ Kubernetes CronJob مرة واحدة، لا في كل pod.
     */
    @Scheduled(cron = "${noon.catalog.count-refresh-cron:0 */15 * * * *}")
    @CacheEvict(value = {"categoryTree", "category"}, allEntries = true)
    public void refreshProductCounts() {
        List<Category> all = categories.findAll();
        for (Category c : all) {
            long count = products.countByCategoryPathContainingAndStatus(c.getSlug(), "ACTIVE");
            if (count != c.getProductCount()) {
                c.setProductCount(count);
                categories.save(c);
            }
        }
        log.debug("refreshed product counts for {} categories", all.size());
    }
}
