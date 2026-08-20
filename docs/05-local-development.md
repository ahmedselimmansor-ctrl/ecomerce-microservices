# 05 — دليل التطوير المحلي

## 1. المتطلبات

| الأداة | الإصدار | ملاحظات |
|---|---|---|
| Docker + Compose | 24+ | **الوحيد المطلوب فعلًا** |
| Node.js | 22+ | اختياري — لتشغيل الواجهة خارج Docker |
| Python | 3.12+ | اختياري |
| Java | — | **غير مطلوب**: خدمات Java تُبنى داخل Docker |
| gcloud CLI | — | **غير مطلوب محليًا**: المحاكيات حاويات مستقلة، ولا نتصل بـ Google Cloud إطلاقًا أثناء التطوير |
| kubectl / terraform | — | للنشر على Google Cloud فقط |

**الموارد:** 8 GB RAM على الأقل (12 GB مريح). المنصة تشغّل 22 حاوية.

---

## 2. البدء

```bash
make up
```

يستغرق أول تشغيل 8–12 دقيقة (بناء صور Java وNode وPython). ما بعده أسرع بكثير بفضل الـ layer cache.

ثم:

```bash
make seed
```

| الخدمة | الرابط |
|---|---|
| المتجر | http://localhost:3000 |
| API Gateway | http://localhost:8080 |
| Kafka UI | http://localhost:8090 |
| OpenSearch Dashboards | http://localhost:5601 |
| Mailpit (الإيميلات) | http://localhost:8025 |

**حساب تجريبي:** `demo@topchoice.local` / `Passw0rd!`

---

## 3. التحقق السريع

```bash
make smoke
```

يفحص 27 حالة عبر المسار الكامل: الصحة، الكتالوج، البحث، المصادقة، السلة، الـ Saga كاملة، وحدود الأمان.

---

## 4. أوامر يومية

```bash
make ps                        # حالة الحاويات
make logs S=order-service      # متابعة سجلات خدمة
make restart S=catalog-service # إعادة بناء وتشغيل خدمة واحدة
make down                      # إيقاف
make clean                     # إيقاف + حذف كل البيانات
```

---

## 5. محاكيات Google Cloud محليًا

خدمات Google المُدارة لا تعمل على جهازك، ولا يوجد محاكي واحد يغطيها كلها: Google تنشر **محاكيًا منفصلًا لكل خدمة**، وبعض الخدمات بلا محاكي أصلًا. لذلك ثلاث حاويات لا واحدة:

| المحاكي | الحاوية | المنفذ | يقابل |
|---|---|---|---|
| Pub/Sub | `pubsub-emulator` | 8681 | Pub/Sub (topics + subscriptions) |
| Firestore | `firestore-emulator` | 8091 | Firestore in Native mode |
| fake-gcs-server | `fake-gcs` | 4443 | Cloud Storage |

**لماذا لا يحتاج كود الخدمة مسارًا «محليًا» منفصلًا:** مكتبات Google العميلة — بايثون وNode وJava — تقرأ هذه المتغيرات بنفسها وتوجّه كل النداءات إلى المحاكي بدل الـ endpoint الحقيقي، وتتخطى المصادقة تمامًا:

```bash
PUBSUB_EMULATOR_HOST=pubsub-emulator:8681
FIRESTORE_EMULATOR_HOST=firestore-emulator:8091
STORAGE_EMULATOR_HOST=http://fake-gcs:4443     # هذا وحده يحتاج المخطط (scheme)
GOOGLE_CLOUD_PROJECT=topchoice-local
```

احذف المتغير ⇒ تتحدث الخدمة مع Google Cloud الحقيقية بالهوية الافتراضية. هذا هو المفتاح الوحيد للتبديل، ولا يوجد فرع `if (local)` في أي خدمة.

### 5.1 ما لا يوجد له محاكي

| الخدمة | البديل محليًا | السبب |
|---|---|---|
| Secret Manager | `.env` | لا محاكي رسمي. الأسرار محليًا تطويرية ومعلَن ذلك في `.env.example` |
| Vertex AI Search for commerce (Retail API) | المحرك الاحتياطي الداخلي | `RETAIL_SERVING_CONFIG_*` فارغة ⇒ التوصيات تُحسب من شعبية Redis. المسار الاحتياطي مُختبَر يوميًا بهذا |
| SendGrid | Mailpit | نريد قراءة الإيميل لا إرساله؛ Mailpit يعرضه على 8025 |
| Cloud SQL / Memorystore / Managed Kafka | حاويات `postgres` و`redis` و`kafka` | بروتوكولات مفتوحة — الحاوية هي نفس المحرك، لا محاكاة له |

### 5.2 حدود المحاكيات — اقرأ هذا قبل أن تتفاجأ

المحاكي يطابق الـ API لا السلوك التشغيلي. ثلاثة فروق تسبب أخطاء حقيقية:

1. **محاكي Firestore لا ينفّذ TTL إطلاقًا.** المستندات المنتهية تبقى إلى الأبد. في الإنتاج تُحذف خلال 24 ساعة من `expiresAt` لا في لحظتها بالضبط. النتيجة واحدة في الحالتين: **الكود يفحص `expiresAt` بنفسه ولا يعتمد على الحذف** — انظر [03 — نماذج البيانات](03-data-model.md).
2. **لا شيء يبقى بعد `make clean`.** المحاكيات تبدأ فارغة تمامًا: لا مواضيع Pub/Sub ولا فهارس Firestore ولا دلاء. سكربت التهيئة ينشئها عند كل إقلاع.
3. **لا صلاحيات ولا IAM.** كل نداء ينجح. غياب دور مطلوب لن يظهر محليًا أبدًا، بل عند أول نشر — ولهذا نضبط الأدوار في Terraform لا يدويًا.

---

## 6. تطوير خدمة بعينها

### 6.1 خدمة Java

```bash
# شغّل البنية التحتية فقط
make infra-up

# ثم شغّل الخدمة من الـ IDE أو:
cd services/order-service
POSTGRES_HOST=localhost KAFKA_BOOTSTRAP_SERVERS=localhost:29092 \
JWT_SECRET=local-dev-only-change-me-9f2b7c1d4e6a8b0c2d4e6f8a0b2c4d6e \
SERVICE_URL_CATALOG=http://localhost:8082 \
mvn spring-boot:run
```

> **انتبه للمنفذ:** Kafka يعلن عن نفسه على `kafka:9092` داخل شبكة Docker و`localhost:29092` خارجها.

### 6.2 خدمة Node

```bash
make infra-up
cd services/api-gateway
npm install
REDIS_URL=redis://localhost:6379 \
JWT_SECRET=local-dev-only-change-me-9f2b7c1d4e6a8b0c2d4e6f8a0b2c4d6e \
FIRESTORE_EMULATOR_HOST=localhost:8091 \
GOOGLE_CLOUD_PROJECT=topchoice-local \
npm run dev
```

> **نفس مصيدة المنفذ:** المحاكيات تُعلَن بأسماء الحاويات داخل الشبكة (`firestore-emulator:8091`) وبـ `localhost` خارجها. خدمة تعمل من الـ IDE وتقرأ `.env` كما هو ستحاول حلّ اسم مضيف غير موجود وتفشل بـ `ENOTFOUND`.

### 6.3 الواجهة

```bash
cd frontend/web
npm install
NEXT_PUBLIC_API_URL=http://localhost:8080 npm run dev
```

---

## 7. أخطاء شائعة وحلولها

| العرَض | السبب | الحل |
|---|---|---|
| `JWT_SECRET is missing` | أوامر compose بلا `--env-file .env` | استخدم `make` أو أضف `--env-file .env` |
| الصفحة الرئيسية فارغة | لم تُبذر البيانات | `make seed` |
| البحث يرجّع 0 نتيجة | الفهرس لم يُبنَ بعد | انتظر 10 ثوانٍ أو `make restart S=search-service` |
| الطلب عالق في `PENDING` | مستهلك Kafka متوقف | `make logs S=inventory-service` وابحث عن `DLQ` |
| الطلب `CANCELLED` بلا سبب واضح | البوابة الوهمية ترفض 10% عمدًا | اضبط `PAYMENT_MOCK_FAILURE_RATE=0` في `.env` |
| `could not automatically determine credentials` | المتغير `*_EMULATOR_HOST` لم يصل للحاوية، فالمكتبة تحاول المصادقة مع Google الحقيقية | تأكد أن الخدمة ترث المتغير من `.env`، وأعد تشغيلها |
| `NOT_FOUND: Topic not found` | محاكي Pub/Sub أُعيد تشغيله ففقد مواضيعه | `make restart S=pubsub-emulator` يعيد تشغيل سكربت التهيئة |
| مستند منتهي الصلاحية ما زال يُقرأ | المحاكي لا ينفّذ TTL | هذا متوقّع — الكود يفحص `expiresAt` بنفسه |
| `ENOTFOUND firestore-emulator` | تشغّل الخدمة خارج Docker بقيم داخل-الشبكة | استبدل أسماء الحاويات بـ `localhost` (انظر 6.2) |
| `port is already allocated` | خدمة أخرى تستخدم المنفذ | `make down` ثم أعد المحاولة |
| Java build بطيء جدًا | تحميل اعتماديات Maven | مؤقت — الـ cache mount يسرّع ما بعده |
| نفاد الذاكرة | 22 حاوية | ارفع حد ذاكرة Docker أو استخدم `make infra-up` وشغّل ما تحتاجه |

---

## 8. الوصول للمخازن والمحاكيات

```bash
# PostgreSQL
docker compose -f deploy/docker-compose.yml --env-file .env exec postgres \
  psql -U topchoice -d topchoice_order -c "SELECT order_number, status, total_minor FROM orders ORDER BY created_at DESC LIMIT 5;"

# المخزون والحجوزات
docker compose -f deploy/docker-compose.yml --env-file .env exec postgres \
  psql -U topchoice -d topchoice_inventory -c "SELECT sku, on_hand, reserved FROM stock_items LIMIT 5;"

# صندوق الأحداث (outbox)
docker compose -f deploy/docker-compose.yml --env-file .env exec postgres \
  psql -U topchoice -d topchoice_order -c "SELECT event_type, published_at, attempts FROM outbox ORDER BY created_at DESC LIMIT 10;"

# MongoDB
docker compose -f deploy/docker-compose.yml --env-file .env exec mongo \
  mongosh --quiet -u topchoice -p topchoice_local_pw --authenticationDatabase admin topchoice_catalog \
  --eval 'db.products.countDocuments()'

# Redis — محتوى السلة
docker compose -f deploy/docker-compose.yml --env-file .env exec redis \
  redis-cli --scan --pattern 'cart:*'

# OpenSearch
curl -s 'http://localhost:9200/products-v1/_count'
```

**المحاكيات تتكلم نفس REST API الحقيقي، فـ `curl` وحده يكفي للتشخيص — لا حاجة لـ SDK ولا CLI:**

```bash
# Pub/Sub — المواضيع والاشتراكات الموجودة
curl -s http://localhost:8681/v1/projects/topchoice-local/topics | python3 -m json.tool
curl -s http://localhost:8681/v1/projects/topchoice-local/subscriptions | python3 -m json.tool

# سحب رسالة يدويًا (مفيد حين لا يصل الإشعار)
curl -s -X POST -H 'content-type: application/json' -d '{"maxMessages":5}' \
  'http://localhost:8681/v1/projects/topchoice-local/subscriptions/topchoice-notifications-sub:pull' \
  | python3 -m json.tool

# Firestore — مفاتيح الـ idempotency
curl -s 'http://localhost:8091/v1/projects/topchoice-local/databases/(default)/documents/idempotency' \
  | python3 -m json.tool

# Firestore — تصفير كامل بلا إعادة تشغيل الحاوية
curl -s -X DELETE 'http://localhost:8091/emulator/v1/projects/topchoice-local/databases/(default)/documents'

# Cloud Storage — الدلاء ومحتوياتها
curl -s 'http://localhost:4443/storage/v1/b?project=topchoice-local' | python3 -m json.tool
curl -s 'http://localhost:4443/storage/v1/b/topchoice-media-local/o' | python3 -m json.tool

# تنزيل ملف مباشرةً — نفس المسار الذي تستخدمه الواجهة كـ CDN محلي
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:4443/topchoice-media-local/placeholder.jpg
```

---

## 9. تتبّع الـ Saga خطوة بخطوة

أفضل طريقة لفهم النظام: أنشئ طلبًا وراقب الأحداث.

```bash
# 1) نافذة أولى — راقب الأحداث
open http://localhost:8090   # Kafka UI → topics → order.events.v1

# 2) نافذة ثانية — راقب السجلات
make logs S=order-service &
make logs S=inventory-service &
make logs S=payment-service &

# 3) نافذة ثالثة — أنشئ طلبًا
TOKEN=$(curl -s -X POST localhost:8080/api/v1/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"demo@topchoice.local","password":"Passw0rd!"}' \
  | grep -o '"accessToken":"[^"]*' | cut -d'"' -f4)

curl -s -X POST localhost:8080/api/v1/orders \
  -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -H "idempotency-key: $(uuidgen)" \
  -d '{"items":[{"sku":"TC-APL-IP15-128-BLK","quantity":1}],
       "shippingAddress":{"fullName":"Demo","phone":"+971500000001",
                          "line1":"Street 1","city":"Dubai","country":"AE"},
       "paymentMethod":"CARD"}' | python3 -m json.tool
```

ستشاهد التسلسل: `order.created` → `inventory.reserved` → `payment.requested` → `payment.authorized` → `order.confirmed`، وإيميل التأكيد في Mailpit.

> **انتبه للفصل:** Kafka هو ناقل الـ Saga، وPub/Sub هو ناقل ما يخرج منها (الإشعارات، التحليلات). أرسل الحدث نفسه إلى الاثنين وستحصل على إيميل مزدوج.

---

## 10. تجربة سيناريوهات الفشل

```bash
# فشل الدفع دائمًا ⇒ يجب أن يُلغى الطلب ويُحرَّر المخزون
PAYMENT_MOCK_FAILURE_RATE=1.0 make restart S=payment-service

# سقوط Redis ⇒ الكتالوج يظل يعمل (أبطأ) والسلة تتوقف
docker compose -f deploy/docker-compose.yml --env-file .env stop redis
curl -s localhost:8080/api/v1/products/TC-APL-IP15-128-BLK   # يعمل
curl -s localhost:8080/api/v1/cart -H 'x-guest-token: abcdefghij123456'  # يفشل

# سقوط التوصيات ⇒ صفحة المنتج تعمل بلا قسم "مقترح لك"
docker compose -f deploy/docker-compose.yml --env-file .env stop recommendation-service
curl -s localhost:8080/api/v1/bff/pdp/TC-APL-IP15-128-BLK | python3 -c "
import sys,json; d=json.load(sys.stdin)
print('product ok:', bool(d['product']))
print('recommended:', len(d['recommended']))"

# سقوط محاكي Firestore ⇒ الطلبات تعمل، لكن حماية التكرار تسقط
# جرّبها لتفهم لماذا لا نعتبر Firestore تبعية اختيارية في مسار الطلب
docker compose -f deploy/docker-compose.yml --env-file .env stop firestore-emulator
```

---

## 11. الاختبارات

```bash
make test     # وحدات كل الخدمات (داخل حاويات)
make smoke    # تكامل عبر الـ API
make lint     # فحص الواجهة
```
