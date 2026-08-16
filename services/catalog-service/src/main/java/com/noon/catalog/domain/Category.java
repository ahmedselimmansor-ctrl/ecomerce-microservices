package com.noon.catalog.domain;

import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

import java.util.LinkedHashMap;
import java.util.Map;

@Document(collection = "categories")
public class Category {

    @Id
    private String id;

    private String slug;
    private Map<String, String> name = new LinkedHashMap<>();
    private String parentSlug;
    private String imageUrl;
    private int sortOrder = 0;
    private boolean active = true;

    /** يُحدَّث دوريًا — تفادي COUNT مكلف عند كل عرض للقائمة. */
    private long productCount = 0;

    public String getId() { return id; }
    public String getSlug() { return slug; }
    public Map<String, String> getName() { return name; }
    public String getParentSlug() { return parentSlug; }
    public String getImageUrl() { return imageUrl; }
    public int getSortOrder() { return sortOrder; }
    public boolean isActive() { return active; }
    public long getProductCount() { return productCount; }

    public void setId(String id) { this.id = id; }
    public void setSlug(String slug) { this.slug = slug; }
    public void setName(Map<String, String> name) { this.name = name; }
    public void setParentSlug(String parentSlug) { this.parentSlug = parentSlug; }
    public void setImageUrl(String imageUrl) { this.imageUrl = imageUrl; }
    public void setSortOrder(int sortOrder) { this.sortOrder = sortOrder; }
    public void setActive(boolean active) { this.active = active; }
    public void setProductCount(long productCount) { this.productCount = productCount; }
}
