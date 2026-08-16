# Noon Clone — Cloud-Native E-Commerce Platform on AWS

منصة تجارة إلكترونية على نمط [noon.com](https://www.noon.com) مبنية كـ **microservices** ومصمّمة من الأساس للتشغيل على **AWS / EKS**.

> **إخلاء مسؤولية:** مشروع تعليمي مستقل، لا علاقة له بشركة Noon ولا مدعوم منها.
> الاسم مستخدم لوصف التصميم المرجعي فقط، وكل العلامات التجارية ملك أصحابها.

---

## 1. Stack

| الطبقة | التقنية |
|---|---|
| Frontend | Next.js 15 (App Router) · TypeScript · Tailwind CSS v4 · Zod · TanStack Query · Sonner (notifications) · Web Push |
| BFF / Gateway | Node.js 22 · Fastify · JWT · Rate limiting · Redis cache |
| Backend Services | Java 21 / Spring Boot 3.3 · Node.js 22 / Fastify · Python 3.12 / FastAPI |
| SQL | PostgreSQL 16 (Amazon RDS / Aurora) — users, orders, payments, inventory |
| NoSQL | MongoDB 7 (Amazon DocumentDB) — product catalog · DynamoDB — sessions/idempotency |
| Cache | Redis 7 (Amazon ElastiCache) — cart, sessions, hot reads, rate limits |
| Search | OpenSearch (Amazon OpenSearch Service) |
| Messaging | Apache Kafka (Amazon MSK) + SQS/SNS |
| Recommendations | Amazon Personalize (+ fallback داخلي) |
| Orchestration | Kubernetes — **Amazon EKS** (Karpenter · HPA · KEDA) |
| Edge / CDN | Amazon CloudFront + AWS WAF + Route 53 |
| IaC | Terraform |
| Observability | OpenTelemetry · Prometheus · Grafana · CloudWatch · X-Ray |

## 2. الخدمات (Microservices)

| # | Service | اللغة | Datastore | المسؤولية |
|---|---|---|---|---|
| 1 | `api-gateway` | Node/Fastify | Redis | BFF، توجيه، JWT، rate-limit، response cache |
| 2 | `identity-service` | Java/Spring Boot | PostgreSQL | تسجيل، دخول، JWT/Refresh، العناوين |
| 3 | `catalog-service` | Java/Spring Boot | MongoDB | المنتجات، الأقسام، العلامات، الأسعار |
| 4 | `inventory-service` | Java/Spring Boot | PostgreSQL | المخزون، الحجز (reservation) والإفراج |
| 5 | `order-service` | Java/Spring Boot | PostgreSQL | الطلبات + **Saga orchestrator** + Outbox |
| 6 | `payment-service` | Java/Spring Boot | PostgreSQL | التفويض، التحصيل، الاسترداد |
| 7 | `cart-service` | Node/Fastify | Redis | السلة (guest + user) ودمجها |
| 8 | `notification-service` | Node | — (SNS/SES) | إيميل/SMS/Web-Push من أحداث Kafka |
| 9 | `search-service` | Python/FastAPI | OpenSearch | بحث، فلاتر، facets، autocomplete |
| 10 | `recommendation-service` | Python/FastAPI | Personalize + Redis | «مقترح لك» / «مشترى معه» |

## 3. التشغيل المحلي (Local Development)

المتطلبات: Docker + Docker Compose. (مش محتاج تسطّب Java أو Maven — الـ build بيتم جوه Docker.)

```bash
make up
```

ده بيشغّل: PostgreSQL · MongoDB · Redis · Kafka (KRaft) · OpenSearch · LocalStack · كل الخدمات العشرة · الواجهة.

| الخدمة | الرابط |
|---|---|
| Web (Next.js) | http://localhost:3000 |
| API Gateway | http://localhost:8080 |
| OpenSearch Dashboards | http://localhost:5601 |
| Kafka UI | http://localhost:8090 |
| Mailpit (اختبار الإيميل) | http://localhost:8025 |

بذر البيانات التجريبية:

```bash
make seed
```

التحقق من أن كل شيء يعمل (27 حالة عبر المسار الكامل):

```bash
make smoke        # 27 حالة على المتجر
make admin-test   # 28 حالة على لوحة التحكم
```

إيقاف كل حاجة:

```bash
make down
```

| الحساب | البريد | كلمة المرور |
|---|---|---|
| عميل | `demo@noon.local` | `Passw0rd!` |
| مشرف | `admin@noon.local` | `Admin@123` |

لوحة التحكم على http://localhost:3000/admin (تظهر لحساب المشرف فقط).

### ما يغطيه اختبار الدخان

الصحة · الكتالوج والأقسام · صفحة المنتج المجمّعة · البحث العربي والإنجليزي والإكمال التلقائي · التوصيات · المخزون · تسجيل الدخول ورفض كلمة المرور الخاطئة · السلة والمجموع المحسوب على الخادم · **الـ Saga كاملة** (`PENDING → AWAITING_PAYMENT → CONFIRMED` خلال ثوانٍ) · التسعير من مصدره · منع الطلب المكرر بـ `Idempotency-Key` · حجب المسارات الداخلية والإدارية عند الحافة.

## 4. النشر على AWS

```bash
make tf-init
make tf-plan
make tf-apply
make deploy-eks
```

التفاصيل الكاملة في [docs/06-deployment-eks.md](docs/06-deployment-eks.md).

## 5. التوثيق

| المستند | المحتوى |
|---|---|
| [docs/01-architecture.md](docs/01-architecture.md) | معمارية النظام، مخططات، تدفق الطلب، الـ Saga |
| [docs/02-aws-services.md](docs/02-aws-services.md) | كل خدمات AWS المستخدمة ولماذا |
| [docs/03-data-model.md](docs/03-data-model.md) | نماذج البيانات SQL/NoSQL وأحداث Kafka |
| [docs/04-scalability.md](docs/04-scalability.md) | التوسّع، موازنة الحمل، الـ caching، الصمود |
| [docs/05-local-development.md](docs/05-local-development.md) | دليل التطوير المحلي |
| [docs/06-deployment-eks.md](docs/06-deployment-eks.md) | النشر على EKS خطوة بخطوة |
| [docs/07-security.md](docs/07-security.md) | الأمان والامتثال |
| [docs/08-admin-dashboard.md](docs/08-admin-dashboard.md) | لوحة التحكم: الشاشات، الصلاحيات، قواعد الخادم |

### قرارات المعمارية (ADRs)

| # | القرار | الخلاصة |
|---|---|---|
| [0001](docs/adr/0001-microservices-boundaries.md) | حدود الخدمات | التقسيم حسب حدود السياق لا الطبقات التقنية |
| [0002](docs/adr/0002-saga-over-2pc.md) | Saga بدل 2PC | لا معاملات موزّعة — تنسيق مركزي مع تعويض |
| [0003](docs/adr/0003-polyglot-persistence.md) | تعدد مخازن البيانات | المخزن يتبع شكل البيانات ومتطلبات الاتساق |
| [0004](docs/adr/0004-bff-gateway.md) | بوابة BFF | رحلة شبكة واحدة بدل أربع، وتدهور متدرّج مركزي |
| [0005](docs/adr/0005-eks-over-alternatives.md) | EKS بدل ECS/Lambda | أحمال طويلة العمر + قابلية نقل — مع الاعتراف بتكلفة التعقيد |

## 6. الواجهة

واجهة مطابقة لتصميم noon: الهيدر الأصفر بمحدّد الموقع والبحث، شريط ١٣ قسمًا
بقوائم منسدلة كبيرة (أعمدة فرعية + Top Brands + صورة ترويجية)، وبطاقة منتج
بنفس تفاصيلها — شارة `Best Seller`، قلب المفضّلة، زر إضافة سريعة، تقييم أخضر،
سعر مشطوب ونسبة خصم، سطر إشارة (توصيل مجاني / كمية محدودة)، وشارة
`express Tomorrow` المائلة.

**الصفحات:** الرئيسية (بانر ترويجي · hero carousel · دوائر أقسام · Mega deals ·
Recommended · Coupon Zone · Official Brand Stores · أقسام بـ VIEW ALL ·
Your favorite brands · Popular searches · فوتر بـ ٧ أعمدة) · صفحة المنتج ·
صفحة القسم · البحث بفلاتر جانبية · السلة · إتمام الشراء · الطلبات · المفضّلة ·
الدخول والتسجيل · لوحة التحكم.

## 7. هيكل المستودع

```
.
├── frontend/web/              Next.js storefront
├── services/                  10 microservices
│   ├── api-gateway/           Node · Fastify
│   ├── identity-service/      Java · Spring Boot
│   ├── catalog-service/       Java · Spring Boot
│   ├── inventory-service/     Java · Spring Boot
│   ├── order-service/         Java · Spring Boot
│   ├── payment-service/       Java · Spring Boot
│   ├── cart-service/          Node · Fastify
│   ├── notification-service/  Node
│   ├── search-service/        Python · FastAPI
│   └── recommendation-service/Python · FastAPI
├── infra/
│   ├── terraform/             AWS infrastructure as code
│   └── k8s/                   Kustomize base + overlays (dev/prod)
├── deploy/docker-compose.yml  بيئة محلية كاملة
├── scripts/                   seed / helpers
└── docs/                      التوثيق المعماري
```

## 8. الترخيص

MIT — مشروع تعليمي. لا علاقة له بشركة Noon، والاسم مستخدم للتوضيح فقط.
