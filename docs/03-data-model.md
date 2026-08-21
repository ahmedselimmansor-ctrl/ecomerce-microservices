# 03 — نماذج البيانات وعقود الأحداث

## 1. توزيع المخازن

| المخزن | مُدار بـ | الخدمة | السبب |
|---|---|---|---|
| PostgreSQL `topchoice_identity` | Cloud SQL | identity | علاقات + ACID |
| PostgreSQL `topchoice_order` | Cloud SQL | order | معاملات + تدقيق محاسبي |
| PostgreSQL `topchoice_payment` | Cloud SQL | payment | متطلبات مالية صارمة |
| PostgreSQL `topchoice_inventory` | Cloud SQL | inventory | حجز متزامن يحتاج قفل صفوف |
| MongoDB `topchoice_catalog` | MongoDB Atlas على GCP | catalog | مخطط متغيّر لكل قسم |
| Redis | Memorystore for Redis Cluster | cart · gateway · recommendation | زمن استجابة تحت المللي ثانية |
| OpenSearch | مُدار ذاتيًا على GKE | search | بحث نصي + facets |
| Firestore (Native mode) | Firestore | gateway | idempotency + sessions مع TTL |

> **قواعد PostgreSQL الأربع على نسخة Cloud SQL واحدة، لا أربع نسخ.** العزل منطقي
> (قاعدة لكل خدمة، ومستخدم لكل قاعدة بلا صلاحية على غيرها) لا فيزيائي. هذا يوفّر
> ثلاث نسخ عالية التوفر بلا تنازل عن حدود الملكية؛ لو صار حِمل خدمة يزاحم غيرها
> فالفصل إلى نسخة مستقلة تغييرُ سلسلةِ اتصال لا تغييرُ مخطط.

---

## 2. PostgreSQL — identity

```sql
users(
  id UUID PK, email CITEXT UNIQUE, phone TEXT UNIQUE,
  password_hash TEXT, full_name TEXT, locale TEXT DEFAULT 'ar',
  email_verified BOOL, status TEXT, -- ACTIVE | SUSPENDED
  created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ)

user_roles(user_id UUID FK, role TEXT)          -- CUSTOMER | SELLER | ADMIN

addresses(
  id UUID PK, user_id UUID FK, label TEXT,
  line1 TEXT, line2 TEXT, city TEXT, area TEXT,
  country CHAR(2), phone TEXT, is_default BOOL,
  lat NUMERIC(9,6), lng NUMERIC(9,6))

refresh_tokens(
  id UUID PK, user_id UUID FK, token_hash TEXT UNIQUE,
  family_id UUID,            -- كشف إعادة الاستخدام
  expires_at TIMESTAMPTZ, revoked_at TIMESTAMPTZ)
```

## 3. PostgreSQL — order

```sql
orders(
  id UUID PK, order_number TEXT UNIQUE,     -- TC-2026-000123
  user_id UUID, status TEXT,                -- PENDING|AWAITING_PAYMENT|CONFIRMED|SHIPPED|DELIVERED|CANCELLED|REFUNDED
  currency CHAR(3), subtotal_minor BIGINT, shipping_minor BIGINT,
  discount_minor BIGINT, tax_minor BIGINT, total_minor BIGINT,
  shipping_address JSONB, payment_id UUID,
  failure_reason TEXT, version INT,
  created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ)

order_items(
  id UUID PK, order_id UUID FK, sku TEXT, product_id TEXT,
  title TEXT, image_url TEXT,               -- لقطة وقت الشراء
  unit_price_minor BIGINT, quantity INT, seller_id TEXT)

outbox(
  id UUID PK, aggregate_type TEXT, aggregate_id TEXT,
  event_type TEXT, topic TEXT, payload JSONB,
  created_at TIMESTAMPTZ, published_at TIMESTAMPTZ, attempts INT)

processed_events(event_id UUID PK, consumer TEXT, processed_at TIMESTAMPTZ)

idempotency_keys(key TEXT PK, user_id UUID, response JSONB, created_at TIMESTAMPTZ)
```

> **كل المبالغ بالوحدة الصغرى (minor units) كـ `BIGINT`** — لا `FLOAT` أبدًا في المال.

## 4. PostgreSQL — inventory

```sql
stock_items(
  sku VARCHAR(64) PK, warehouse_id VARCHAR(32),
  on_hand INT CHECK (on_hand >= 0),
  reserved INT CHECK (reserved >= 0),
  version BIGINT,                      -- optimistic locking
  updated_at TIMESTAMPTZ,
  -- قيد على مستوى القاعدة: لا يمكن حجز أكثر من الموجود مهما أخطأ الكود
  CONSTRAINT chk_reserved_le_onhand CHECK (reserved <= on_hand))
-- المتاح = on_hand - reserved ويُحسب في الكود (StockItem.available())

reservations(
  id UUID PK, order_id UUID, sku TEXT, quantity INT,
  status TEXT,                         -- HELD | COMMITTED | RELEASED
  expires_at TIMESTAMPTZ,              -- تحرير تلقائي بعد 15 دقيقة
  created_at TIMESTAMPTZ,
  UNIQUE(order_id, sku))
```

## 5. PostgreSQL — payment

```sql
payments(
  id UUID PK, order_id UUID UNIQUE, user_id UUID,
  amount_minor BIGINT, currency CHAR(3),
  method TEXT,                          -- CARD | COD | APPLE_PAY | TABBY
  status TEXT,                          -- REQUIRES_AUTH|AUTHORIZED|CAPTURED|FAILED|VOIDED|REFUNDED
  provider TEXT, provider_ref TEXT, failure_code TEXT,
  created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ)

refunds(id UUID PK, payment_id UUID FK, amount_minor BIGINT,
        reason TEXT, status TEXT, provider_ref TEXT, created_at TIMESTAMPTZ)
```

## 6. MongoDB — catalog

```javascript
// collection: products
{
  _id: ObjectId,
  sku: "TC-APL-IP15-128-BLK",            // فريد
  slug: "apple-iphone-15-128gb-black",
  title:    { ar: "ابل ايفون 15", en: "Apple iPhone 15" },
  description: { ar: "...", en: "..." },
  brand: { id: "apple", name: "Apple" },
  categoryPath: ["electronics", "mobiles", "smartphones"],
  price:      { currency: "EGP", amountMinor: 299900, wasMinor: 349900 },
  images: ["https://cdn.../1.jpg"],
  attributes: { color: "Black", storage: "128GB", ram: "6GB" },  // متغيّر لكل قسم
  variants: [ { sku: "...", attributes: { color: "Blue" }, priceMinor: 299900 } ],
  rating: { average: 4.6, count: 1284 },
  sellerId: "topchoice-retail",
  tags: ["express", "bestseller"],
  status: "ACTIVE",
  createdAt: ISODate, updatedAt: ISODate, version: 7
}
```

**الفهارس:**

```javascript
db.products.createIndex({ sku: 1 }, { unique: true })
db.products.createIndex({ slug: 1 }, { unique: true })
db.products.createIndex({ categoryPath: 1, "price.amountMinor": 1 })
db.products.createIndex({ "brand.id": 1, status: 1 })
db.products.createIndex({ status: 1, updatedAt: -1 })
db.products.createIndex({ "title.ar": "text", "title.en": "text", tags: "text" })
```

> **هذا MongoDB حقيقي لا نسخة متوافقة معه.** العنقود على MongoDB Atlas داخل GCP،
> ويُوصَل عبر Private Service Connect فلا تخرج حركته إلى الإنترنت ولا تحتاج
> عنوانًا عامًا. الفارق عملي لا شكلي: `$text` والفهارس الجزئية وتغيّرات الـ
> aggregation pipeline تعمل بنفس دلالات المحرك الأصلي، وترقية إصدار المحرك لا
> تنتظر أن يلحق بها مزوّد متوافق.

> **ملاحظة على `$text`:** الفهرس النصي هنا للبحث الإداري داخل اللوحة فقط. بحث
> المتجر يمر بـ OpenSearch — التحليل العربي في MongoDB أضعف من أن يُبنى عليه.

## 7. Redis — مخطط المفاتيح

| المفتاح | النوع | TTL | الغرض |
|---|---|---|---|
| `cart:user:{userId}` | Hash | 90 يوم | سلة المستخدم |
| `cart:guest:{token}` | Hash | 30 يوم | سلة الضيف |
| `pdp:{sku}:{locale}` | String (JSON) | 300s | صفحة المنتج المجمّعة |
| `product:{sku}` | String (JSON) | 600s | كيان المنتج |
| `cat:{slug}:p{n}:{sort}` | String | 120s | صفحة قسم |
| `rl:{ip}:{route}` | String (counter) | 60s | rate limiting |
| `trending:{category}` | Sorted Set | 1h | fallback التوصيات |
| `session:{sid}` | Hash | 24h | جلسة |
| `stock:{sku}` | String | 30s | مخزون تقريبي للعرض |
| `idem:{key}` | String | 24h | نتيجة عملية idempotent |

## 8. OpenSearch — mapping المنتجات

> **يعمل داخل العنقود، لا كخدمة مُدارة.** لا يوجد مقابل مُدار لـ OpenSearch على
> Google Cloud، فهو StatefulSet على GKE بأقراص مستمرة. النتيجة على المخطط أدناه
> مباشرة: `number_of_replicas: 1` تعني نسخة على عقدة أخرى في نطاق توفر آخر —
> وهذا كل ما يحمينا من سقوط نطاق، فلا مزوّد يعيد بناء الفهرس نيابةً عنّا.

```json
{
  "settings": {
    "index": { "number_of_shards": 3, "number_of_replicas": 1 },
    "analysis": {
      "analyzer": {
        "ar_analyzer": { "type": "arabic" },
        "en_analyzer": { "type": "english" },
        "autocomplete": { "tokenizer": "edge_ngram_tok", "filter": ["lowercase"] }
      },
      "tokenizer": {
        "edge_ngram_tok": { "type": "edge_ngram", "min_gram": 2, "max_gram": 20,
                            "token_chars": ["letter", "digit"] }
      }
    }
  },
  "mappings": {
    "properties": {
      "sku":        { "type": "keyword" },
      "slug":       { "type": "keyword" },
      "titleAr":    { "type": "text", "analyzer": "ar_analyzer",
                      "fields": { "suggest": { "type": "text", "analyzer": "autocomplete",
                                               "search_analyzer": "standard" } } },
      "titleEn":    { "type": "text", "analyzer": "en_analyzer",
                      "fields": { "suggest": { "type": "text", "analyzer": "autocomplete",
                                               "search_analyzer": "standard" } } },
      "brand":      { "type": "keyword" },
      "categoryPath": { "type": "keyword" },
      "priceMinor": { "type": "long" },
      "currency":   { "type": "keyword" },
      "rating":     { "type": "float" },
      "ratingCount":{ "type": "integer" },
      "attributes": { "type": "flat_object" },
      "tags":       { "type": "keyword" },
      "inStock":    { "type": "boolean" },
      "popularity": { "type": "float" },
      "updatedAt":  { "type": "date" }
    }
  }
}
```

## 9. Firestore (Native mode)

نمط الوصول هنا بسيط عمدًا: قراءة وكتابة بمفتاح واحد، وانتهاء صلاحية تلقائي، وبلا
استعلامات معقدة. Firestore في وضع Native يغطيه بلا سعة نُديرها ولا فهارس نصمّمها
مسبقًا.

| المجموعة | معرّف المستند | حقل TTL | الغرض |
|---|---|---|---|
| `idempotency` | مفتاح الـ Idempotency-Key | `expiresAt` | منع تكرار الطلبات |
| `sessions` | `sid` | `expiresAt` | جلسات الويب |
| `user_events/{userId}/events` | `eventId` | `expiresAt` | تفاعلات لـ Vertex AI Search for commerce |

```javascript
// idempotency/{key}
{
  key:        "550e8400-e29b-41d4-a716-446655440000",
  userId:     "user-uuid",           // المفتاح مرتبط بصاحبه — لا يُقرأ طلبُ غيرِه بتخمين مفتاح
  response:   { orderId: "...", status: "PENDING" },
  createdAt:  Timestamp,
  expiresAt:  Timestamp              // createdAt + 24h
}

// sessions/{sid}
{
  userId:     "user-uuid",
  locale:     "ar",
  createdAt:  Timestamp,
  lastSeenAt: Timestamp,
  expiresAt:  Timestamp              // lastSeenAt + 24h
}

// user_events/{userId}/events/{eventId}
{
  eventType:  "detail-page-view",    // detail-page-view | add-to-cart | purchase-complete
  sku:        "TC-APL-IP15-128-BLK",
  ts:         Timestamp,
  expiresAt:  Timestamp              // ts + 90d
}
```

### 9.1 لماذا مجموعة فرعية لأحداث المستخدم؟

المفتاح المركّب `userId` + `ts#eventId` لم يعد له معنى في Firestore: المستند لا
يملك مفتاح فرز مستقلًا. الشكل الطبيعي هنا مجموعة فرعية تحت المستخدم
(`user_events/{userId}/events`)، وهو ليس ترجمة حرفية بل تحسين فعلي:

- استعلام «آخر 50 تفاعلًا لهذا المستخدم» يقرأ مجموعة واحدة صغيرة، لا يمسح
  مساحة مفاتيح مشتركة.
- «كل مشتريات اليوم عبر كل المستخدمين» — لتغذية Retail API — تبقى ممكنة بـ
  **collection group query** على `events`، دون تكرار البيانات في مجموعة ثانية.

### 9.2 الفهارس المركّبة

الفهرسة الأحادية تلقائية في Firestore. المركّبة تُعرَّف صراحةً في Terraform،
وهذه هي الثلاثة الوحيدة التي نحتاجها:

| المجموعة | النطاق | الحقول | يخدم |
|---|---|---|---|
| `events` | collection group | `eventType` ASC · `ts` DESC | تصدير المشتريات إلى Retail API |
| `events` | collection | `sku` ASC · `ts` DESC | «شوهد مؤخرًا» لمستخدم بعينه |
| `sessions` | collection | `userId` ASC · `lastSeenAt` DESC | «أنهِ كل جلساتي» عند تسريب توكن |

> استعلام يفتقد فهرسه لا يبطؤ في Firestore — **يفشل** برسالة تحوي رابط إنشاء
> الفهرس. هذا مزعج في التطوير ومقصود: يمنع استعلامًا يمسح مجموعة كاملة من الوصول
> إلى الإنتاج أصلًا. الرابط للتشخيص فقط؛ الفهرس يُضاف في Terraform لا بالنقر.

### 9.3 TTL — الفارق الذي يجب أن يعرفه الكود

`expiresAt` حقل `Timestamp` عادي، وسياسة TTL تُضبط عليه مرة واحدة لكل مجموعة.
لكن **الحذف ليس لحظيًا**: Firestore يضمن الحذف عمومًا خلال 24 ساعة من وقت
الانتهاء، لا في اللحظة نفسها.

النتيجة قاعدة صارمة: **كل قراءة تفحص `expiresAt` بنفسها وتتعامل مع المستند
المنتهي كأنه غير موجود.** بلا هذا، مفتاح idempotency عمره 24 ساعة قد يُعيد
استجابة قديمة بعد 40 ساعة، وجلسة منتهية قد تظل صالحة ليوم كامل — وهي ثغرة لا
عطل أداء.

نفس القاعدة تحمينا محليًا: محاكي Firestore لا ينفّذ TTL إطلاقًا، فالفحص في الكود
هو ما يجعل السلوك المحلي مطابقًا للإنتاج.

---

## 10. عقود أحداث Kafka

كل الأحداث تشترك في مغلّف موحّد (CloudEvents-inspired):

```json
{
  "eventId":   "uuid",
  "eventType": "order.created",
  "version":   1,
  "occurredAt":"2026-08-14T10:00:00Z",
  "traceId":   "w3c-trace-id",
  "aggregateId": "order-uuid",
  "payload":   { }
}
```

| Topic | Partitions | Key | المنتج | المستهلك |
|---|---|---|---|---|
| `catalog.product.v1` | 6 | `sku` | catalog | search · recommendation |
| `order.events.v1` | 12 | `orderId` | order | inventory · payment · notification · analytics |
| `inventory.events.v1` | 12 | `orderId` | inventory | order |
| `payment.events.v1` | 12 | `orderId` | payment | order · notification |
| `user.interactions.v1` | 6 | `userId` | gateway | recommendation · جسر Pub/Sub → Dataflow → BigQuery |
| `notification.commands.v1` | 3 | `userId` | order · identity | notification |

**قواعد:** التقسيم بمفتاح التجميع (aggregate id) لضمان الترتيب داخل نفس الطلب · تطور المخطط backward-compatible (إضافة حقول اختيارية فقط) · إصدار جديد = topic جديد `.v2` · كل consumer group له DLQ (`<topic>.dlq`).

### لماذا Kafka وPub/Sub معًا؟

السؤال المشروع على Google Cloud: لماذا لا نستبدل Kafka بـ Pub/Sub ونختصر خدمة
مُدارة كاملة؟ الجواب في السطر الأول من القواعد أعلاه — **الترتيب**.

الـ Saga تعتمد على أن أحداث الطلب الواحد تصل بترتيبها. Pub/Sub يوفّر ترتيبًا
بمفتاح (ordering key)، لكنه يفرض ثمنًا لا نريده هنا: الترتيب يُضعف التوازي عبر
المفتاح نفسه، ولا يوجد مفهوم «إعادة القراءة من الإزاحة» الذي نعيد به بناء فهرس
البحث بالكامل من الصفر. إعادة بناء فهرس OpenSearch من `catalog.product.v1` هي
حجر الأساس في [ADR 0003](adr/0003-polyglot-persistence.md) — بدونها لا يعود
الفهرس «مشتقًّا قابلًا لإعادة البناء» بل مصدر حقيقة ثانيًا.

فالتقسيم بمسؤوليتين لا بتفضيل:

| | Kafka | Pub/Sub |
|---|---|---|
| الاستخدام | ناقل الـ Saga وسجل الأحداث القابل لإعادة القراءة | ما يخرج من النظام: إشعارات، تحليلات، fan-out |
| الترتيب | لكل partition — مضمون داخل الطلب الواحد | بمفتاح، وبكلفة على الإنتاجية |
| الاحتفاظ | مدة محددة، تُقرأ من أي إزاحة | حتى الإقرار (ack) |
| المستهلك | consumer group يتحكم في إزاحته | اشتراك push أو pull |

عمليًا: `notification.commands.v1` و`user.interactions.v1` يُجسَّران إلى Pub/Sub
لأن مستهلكهما لا يحتاج إعادة قراءة، ويستفيدان من fan-out إلى Dataflow وSendGrid
بلا كتابة مستهلك Kafka جديد لكل وجهة.

### أمثلة الحمولات (payloads)

```json
// order.created
{ "orderId":"...", "userId":"...", "currency":"EGP", "totalMinor":299900,
  "items":[{"sku":"TC-APL-IP15-128-BLK","quantity":1,"unitPriceMinor":299900}] }

// inventory.reserved / inventory.rejected
{ "orderId":"...", "reservations":[{"sku":"...","quantity":1}],
  "reason": "OUT_OF_STOCK" }

// payment.authorized / payment.failed
{ "orderId":"...", "paymentId":"...", "amountMinor":299900,
  "provider":"mock", "providerRef":"ch_123", "failureCode": null }

// catalog.product.upserted
{ "sku":"...", "slug":"...", "titleAr":"...", "titleEn":"...",
  "priceMinor":299900, "categoryPath":["electronics"], "status":"ACTIVE" }
```
