# 05 — دليل التطوير المحلي

## 1. المتطلبات

| الأداة | الإصدار | ملاحظات |
|---|---|---|
| Docker + Compose | 24+ | **الوحيد المطلوب فعلًا** |
| Node.js | 22+ | اختياري — لتشغيل الواجهة خارج Docker |
| Python | 3.12+ | اختياري |
| Java | — | **غير مطلوب**: خدمات Java تُبنى داخل Docker |
| kubectl / terraform | — | للنشر على AWS فقط |

**الموارد:** 8 GB RAM على الأقل (12 GB مريح). المنصة تشغّل 17 حاوية.

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

**حساب تجريبي:** `demo@noon.local` / `Passw0rd!`

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

## 5. تطوير خدمة بعينها

### 5.1 خدمة Java

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

### 5.2 خدمة Node

```bash
make infra-up
cd services/api-gateway
npm install
REDIS_URL=redis://localhost:6379 \
JWT_SECRET=local-dev-only-change-me-9f2b7c1d4e6a8b0c2d4e6f8a0b2c4d6e \
npm run dev
```

### 5.3 الواجهة

```bash
cd frontend/web
npm install
NEXT_PUBLIC_API_URL=http://localhost:8080 npm run dev
```

---

## 6. أخطاء شائعة وحلولها

| العرَض | السبب | الحل |
|---|---|---|
| `JWT_SECRET is missing` | أوامر compose بلا `--env-file .env` | استخدم `make` أو أضف `--env-file .env` |
| الصفحة الرئيسية فارغة | لم تُبذر البيانات | `make seed` |
| البحث يرجّع 0 نتيجة | الفهرس لم يُبنَ بعد | انتظر 10 ثوانٍ أو `make restart S=search-service` |
| الطلب عالق في `PENDING` | مستهلك Kafka متوقف | `make logs S=inventory-service` وابحث عن `DLQ` |
| الطلب `CANCELLED` بلا سبب واضح | البوابة الوهمية ترفض 10% عمدًا | اضبط `PAYMENT_MOCK_FAILURE_RATE=0` في `.env` |
| `port is already allocated` | خدمة أخرى تستخدم المنفذ | `make down` ثم أعد المحاولة |
| Java build بطيء جدًا | تحميل اعتماديات Maven | مؤقت — الـ cache mount يسرّع ما بعده |
| نفاد الذاكرة | 17 حاوية | ارفع حد ذاكرة Docker أو استخدم `make infra-up` وشغّل ما تحتاجه |

---

## 7. الوصول لقواعد البيانات

```bash
# PostgreSQL
docker compose -f deploy/docker-compose.yml --env-file .env exec postgres \
  psql -U noon -d noon_order -c "SELECT order_number, status, total_minor FROM orders ORDER BY created_at DESC LIMIT 5;"

# المخزون والحجوزات
docker compose -f deploy/docker-compose.yml --env-file .env exec postgres \
  psql -U noon -d noon_inventory -c "SELECT sku, on_hand, reserved FROM stock_items LIMIT 5;"

# صندوق الأحداث (outbox)
docker compose -f deploy/docker-compose.yml --env-file .env exec postgres \
  psql -U noon -d noon_order -c "SELECT event_type, published_at, attempts FROM outbox ORDER BY created_at DESC LIMIT 10;"

# MongoDB
docker compose -f deploy/docker-compose.yml --env-file .env exec mongo \
  mongosh --quiet -u noon -p noon_local_pw --authenticationDatabase admin noon_catalog \
  --eval 'db.products.countDocuments()'

# Redis — محتوى السلة
docker compose -f deploy/docker-compose.yml --env-file .env exec redis \
  redis-cli --scan --pattern 'cart:*'

# OpenSearch
curl -s 'http://localhost:9200/products-v1/_count'
```

---

## 8. تتبّع الـ Saga خطوة بخطوة

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
  -d '{"email":"demo@noon.local","password":"Passw0rd!"}' \
  | grep -o '"accessToken":"[^"]*' | cut -d'"' -f4)

curl -s -X POST localhost:8080/api/v1/orders \
  -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -H "idempotency-key: $(uuidgen)" \
  -d '{"items":[{"sku":"N-APL-IP15-128-BLK","quantity":1}],
       "shippingAddress":{"fullName":"Demo","phone":"+971500000001",
                          "line1":"Street 1","city":"Dubai","country":"AE"},
       "paymentMethod":"CARD"}' | python3 -m json.tool
```

ستشاهد التسلسل: `order.created` → `inventory.reserved` → `payment.requested` → `payment.authorized` → `order.confirmed`، وإيميل التأكيد في Mailpit.

---

## 9. تجربة سيناريوهات الفشل

```bash
# فشل الدفع دائمًا ⇒ يجب أن يُلغى الطلب ويُحرَّر المخزون
PAYMENT_MOCK_FAILURE_RATE=1.0 make restart S=payment-service

# سقوط Redis ⇒ الكتالوج يظل يعمل (أبطأ) والسلة تتوقف
docker compose -f deploy/docker-compose.yml --env-file .env stop redis
curl -s localhost:8080/api/v1/products/N-APL-IP15-128-BLK   # يعمل
curl -s localhost:8080/api/v1/cart -H 'x-guest-token: abcdefghij123456'  # يفشل

# سقوط التوصيات ⇒ صفحة المنتج تعمل بلا قسم "مقترح لك"
docker compose -f deploy/docker-compose.yml --env-file .env stop recommendation-service
curl -s localhost:8080/api/v1/bff/pdp/N-APL-IP15-128-BLK | python3 -c "
import sys,json; d=json.load(sys.stdin)
print('product ok:', bool(d['product']))
print('recommended:', len(d['recommended']))"
```

---

## 10. الاختبارات

```bash
make test     # وحدات كل الخدمات (داخل حاويات)
make smoke    # تكامل عبر الـ API
make lint     # فحص الواجهة
```
