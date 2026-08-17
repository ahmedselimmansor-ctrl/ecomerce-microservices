package com.topchoice.catalog.repository;

import com.topchoice.catalog.domain.Category;
import org.springframework.data.mongodb.repository.MongoRepository;

import java.util.List;
import java.util.Optional;

public interface CategoryRepository extends MongoRepository<Category, String> {

    Optional<Category> findBySlugAndActiveIsTrue(String slug);

    List<Category> findByParentSlugIsNullAndActiveIsTrueOrderBySortOrderAsc();

    List<Category> findByParentSlugAndActiveIsTrueOrderBySortOrderAsc(String parentSlug);
}
