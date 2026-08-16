"""
تعريف فهرس المنتجات في OpenSearch.

التحليل ثنائي اللغة مقصود: البحث العربي يحتاج مُحلّلًا يزيل التشكيل ويطبّع
الألف والهمزة، وإلا فلن يجد "ايفون" من يكتب "أيفون". حقل `suggest` بـ
edge_ngram يخدم الإكمال التلقائي أثناء الكتابة.
"""

INDEX_SETTINGS: dict = {
    "settings": {
        "index": {
            "number_of_shards": 3,
            "number_of_replicas": 1,
            "refresh_interval": "5s",
            "max_result_window": 10_000,
        },
        "analysis": {
            "filter": {
                "arabic_normalization": {"type": "arabic_normalization"},
                "arabic_stop": {"type": "stop", "stopwords": "_arabic_"},
                "arabic_stemmer": {"type": "stemmer", "language": "arabic"},
                "english_stop": {"type": "stop", "stopwords": "_english_"},
                "english_stemmer": {"type": "stemmer", "language": "english"},
                "edge_ngram_filter": {"type": "edge_ngram", "min_gram": 2, "max_gram": 20},
            },
            "analyzer": {
                "ar_text": {
                    "tokenizer": "standard",
                    "filter": [
                        "lowercase",
                        "decimal_digit",
                        "arabic_normalization",
                        "arabic_stop",
                        "arabic_stemmer",
                    ],
                },
                "en_text": {
                    "tokenizer": "standard",
                    "filter": ["lowercase", "english_stop", "english_stemmer"],
                },
                "autocomplete_index": {
                    "tokenizer": "standard",
                    "filter": ["lowercase", "arabic_normalization", "edge_ngram_filter"],
                },
                "autocomplete_search": {
                    "tokenizer": "standard",
                    "filter": ["lowercase", "arabic_normalization"],
                },
            },
        },
    },
    "mappings": {
        "dynamic": "strict",
        "properties": {
            "sku": {"type": "keyword"},
            "slug": {"type": "keyword"},
            "titleAr": {
                "type": "text",
                "analyzer": "ar_text",
                "fields": {
                    "raw": {"type": "keyword", "ignore_above": 256},
                    "suggest": {
                        "type": "text",
                        "analyzer": "autocomplete_index",
                        "search_analyzer": "autocomplete_search",
                    },
                },
            },
            "titleEn": {
                "type": "text",
                "analyzer": "en_text",
                "fields": {
                    "raw": {"type": "keyword", "ignore_above": 256},
                    "suggest": {
                        "type": "text",
                        "analyzer": "autocomplete_index",
                        "search_analyzer": "autocomplete_search",
                    },
                },
            },
            "brandId": {"type": "keyword"},
            "brandName": {"type": "keyword"},
            "categoryPath": {"type": "keyword"},
            "priceMinor": {"type": "long"},
            "wasMinor": {"type": "long"},
            "currency": {"type": "keyword"},
            "image": {"type": "keyword", "index": False},
            "rating": {"type": "float"},
            "ratingCount": {"type": "integer"},
            # flat_object هو مقابل flattened في OpenSearch (النوع الأخير خاص
            # بـ Elasticsearch). يسمح بخصائص مختلفة لكل قسم دون انفجار
            # عدد الحقول في الـ mapping.
            "attributes": {"type": "flat_object"},
            "tags": {"type": "keyword"},
            "inStock": {"type": "boolean"},
            "popularity": {"type": "float"},
            "status": {"type": "keyword"},
            "updatedAt": {"type": "date"},
        },
    },
}

# الحقول القابلة للتصفية كـ facets، مع الاسم المعروض
FACET_FIELDS: dict[str, str] = {
    "brandName": "brand",
    "categoryPath": "category",
    "tags": "tags",
}
