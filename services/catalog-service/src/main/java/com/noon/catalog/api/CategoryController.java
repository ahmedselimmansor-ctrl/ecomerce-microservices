package com.noon.catalog.api;

import com.noon.catalog.api.dto.CatalogDtos.CategoryView;
import com.noon.catalog.service.CategoryService;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.Duration;
import java.util.List;

@RestController
@RequestMapping("/api/v1/categories")
public class CategoryController {

    private final CategoryService categories;

    public CategoryController(CategoryService categories) {
        this.categories = categories;
    }

    @GetMapping
    public ResponseEntity<List<CategoryView>> tree(
            @RequestHeader(value = "Accept-Language", defaultValue = "ar") String locale) {
        return ResponseEntity.ok()
                .cacheControl(CacheControl.maxAge(Duration.ofHours(1)).cachePublic())
                .body(categories.tree(loc(locale)));
    }

    @GetMapping("/{slug}")
    public ResponseEntity<CategoryView> get(
            @PathVariable String slug,
            @RequestHeader(value = "Accept-Language", defaultValue = "ar") String locale) {
        return ResponseEntity.ok()
                .cacheControl(CacheControl.maxAge(Duration.ofMinutes(30)).cachePublic())
                .body(categories.get(slug, loc(locale)));
    }

    private static String loc(String acceptLanguage) {
        if (acceptLanguage == null || acceptLanguage.isBlank()) return "ar";
        String first = acceptLanguage.split(",")[0].trim().split("-")[0].toLowerCase();
        return "en".equals(first) ? "en" : "ar";
    }
}
