# 01 — معمارية النظام (System Architecture)

## 1. المبادئ التصميمية

| المبدأ | التطبيق |
|---|---|
| **Database per service** | كل خدمة تملك قاعدتها. لا يوجد JOIN عبر الخدمات — التكامل بالأحداث. |
| **Async by default** | كل ما ليس على المسار الحرج للمستخدم يمر عبر Kafka/SQS. |
| **Stateless services** | الحالة في RDS/DocumentDB/ElastiCache — يسمح بالتوسع الأفقي والـ spot instances. |
| **Eventual consistency + Saga** | لا توجد معاملات موزّعة (2PC). Saga مع تعويض (compensation). |
| **Cache-aside** | Redis أمام كل قراءة ساخنة، مع TTL + إبطال بالأحداث. |
| **Idempotency** | كل عملية كتابة عامة تقبل `Idempotency-Key`. |
| **Fail fast + degrade gracefully** | Circuit breakers؛ سقوط التوصيات لا يُسقط صفحة المنتج. |

---

## 2. المخطط العام على AWS

```mermaid
flowchart TB
    subgraph Users["المستخدمون"]
        U1["Web / Mobile"]
    end

    subgraph Edge["AWS Edge"]
        R53["Route 53<br/>latency routing"]
        WAF["AWS WAF<br/>+ Shield"]
        CF["CloudFront CDN<br/>static + images"]
    end

    subgraph VPC["VPC — 3 Availability Zones"]
        subgraph Public["Public Subnets"]
            ALB["Application Load Balancer<br/>(AWS Load Balancer Controller)"]
            NAT["NAT Gateways"]
        end

        subgraph Private["Private Subnets — Amazon EKS"]
            GW["api-gateway<br/>Node/Fastify"]
            subgraph Svc["Microservices"]
                ID["identity"]
                CAT["catalog"]
                INV["inventory"]
                ORD["order"]
                PAY["payment"]
                CART["cart"]
                NOT["notification"]
                SRCH["search"]
                REC["recommendation"]
            end
        end

        subgraph Data["Data Subnets (isolated)"]
            RDS[("Aurora PostgreSQL<br/>Multi-AZ + read replicas")]
            DOC[("DocumentDB<br/>MongoDB-compatible")]
            REDIS[("ElastiCache Redis<br/>cluster mode")]
            MSK[("Amazon MSK<br/>Kafka")]
            OS[("OpenSearch Service")]
            DDB[("DynamoDB<br/>sessions/idempotency")]
        end
    end

    subgraph Managed["AWS Managed Services"]
        S3["S3 — media/backups"]
        PERS["Amazon Personalize"]
        SNS["SNS / SES / Pinpoint"]
        SQS["SQS + DLQ"]
        SM["Secrets Manager"]
        KMS["KMS"]
        ECR["ECR"]
        CW["CloudWatch + X-Ray"]
    end

    U1 --> R53 --> WAF --> CF
    CF -->|"/api/*"| ALB
    CF -->|static| S3
    ALB --> GW
    GW --> ID & CAT & CART & SRCH & REC & ORD

    ORD --> MSK
    INV --> MSK
    PAY --> MSK
    CAT --> MSK
    MSK --> NOT & SRCH & REC

    ID --> RDS
    ORD --> RDS
    PAY --> RDS
    INV --> RDS
    CAT --> DOC
    CART --> REDIS
    GW --> REDIS
    SRCH --> OS
    REC --> PERS
    NOT --> SNS
    GW --> DDB

    Svc -.IRSA.-> SM
    Svc -.OTLP.-> CW
```

---

## 3. تفصيل الخدمات

### 3.1 `api-gateway` — Node.js / Fastify (BFF)

المهام: TLS termination خلف ALB، التحقق من JWT، التوجيه، rate limiting بـ Redis، تجميع الاستجابات (aggregation) لصفحات الواجهة، ضغط، CORS، ربط `x-request-id`.

**تمرير الهوية:** الـ gateway يتحقق من التوكن ثم يضيف `X-User-Id` و`X-User-Roles`، ويمرّر `Authorization` كما هو حتى تستطيع خدمة تريد التحقق بنفسها فعل ذلك (`identity-service` تفعل). الكوكيز لا تُمرَّر إطلاقًا — الخدمات الخلفية لا تعرف الجلسات.

نقطة مهمة: صفحة المنتج تحتاج 4 نداءات (product + inventory + reviews + recommendations). الـ BFF يجمعها في نداء واحد `GET /api/v1/bff/pdp/:sku` بالتوازي مع timeout لكل نداء، والتوصيات اختيارية.

### 3.2 `identity-service` — Java / Spring Boot / PostgreSQL

تسجيل، دخول، تدوير Refresh tokens (rotation + reuse detection)، الأدوار، العناوين. كلمات المرور بـ BCrypt. في الإنتاج يمكن استبداله/دمجه مع **Amazon Cognito**.

### 3.3 `catalog-service` — Java / Spring Boot / MongoDB

المنتجات كمستندات (variants، attributes متغيّرة حسب القسم — وهو السبب الأساسي لاختيار MongoDB). يبثّ `catalog.product.v1` عند كل تعديل ليُحدِّث الـ search index والـ CDN invalidation.

### 3.4 `inventory-service` — Java / Spring Boot / PostgreSQL

الحقيقة الوحيدة للمخزون. `reserve` / `release` / `commit` بمعاملات ACID و optimistic locking. يستهلك `order.created` ويردّ بـ `inventory.reserved|rejected`.

### 3.5 `order-service` — Java / Spring Boot / PostgreSQL — **Saga Orchestrator**

يملك دورة حياة الطلب وينسّق الـ Saga. يستخدم **Transactional Outbox** لضمان النشر مرة واحدة على الأقل بلا فقد.

### 3.6 `payment-service` — Java / Spring Boot / PostgreSQL

تفويض/تحصيل/استرداد عبر مزوّد (Stripe/Checkout.com/Tabby) خلف واجهة `PaymentGateway`. محليًا: `MockPaymentGateway`.

### 3.7 `cart-service` — Node / Redis

سلة الضيف على `cart:guest:{token}` (TTL 30 يوم) وسلة المستخدم على `cart:user:{id}`. الدمج عند تسجيل الدخول.

### 3.8 `notification-service` — Node

مستهلك Kafka → SES (إيميل) / SNS / Web Push. Retry مع backoff ثم DLQ.

### 3.9 `search-service` — Python / FastAPI / OpenSearch

بحث نصي عربي/إنجليزي، facets ديناميكية، فرز، autocomplete، مزامنة الفهرس من Kafka.

### 3.10 `recommendation-service` — Python / FastAPI / Amazon Personalize

ثلاثة استخدامات: `recommended-for-you` (USER_PERSONALIZATION)، `bought-together` (RELATED_ITEMS)، `personalized-ranking`. عند غياب الـ campaign ARN يسقط تلقائيًا إلى ترتيب شعبية محسوب من Redis.

---

## 4. تدفق إنشاء الطلب (Order Saga)

```mermaid
sequenceDiagram
    autonumber
    actor C as العميل
    participant GW as api-gateway
    participant O as order-service
    participant I as inventory-service
    participant P as payment-service
    participant K as Kafka (MSK)
    participant N as notification-service

    C->>GW: POST /api/v1/orders (Idempotency-Key)
    GW->>O: create order
    O->>O: INSERT order(PENDING) + outbox(order.created)  [نفس المعاملة]
    O-->>C: 202 Accepted {orderId, status: PENDING}
    O->>K: order.created

    K->>I: order.created
    I->>I: reserve stock (ACID + optimistic lock)
    alt متاح
        I->>K: inventory.reserved
    else غير متاح
        I->>K: inventory.rejected
    end

    K->>O: inventory.*
    alt reserved
        O->>K: payment.requested
        K->>P: payment.requested
        P->>P: authorize via PSP
        alt نجح
            P->>K: payment.authorized
            K->>O: payment.authorized
            O->>O: status = CONFIRMED
            O->>K: order.confirmed
        else فشل
            P->>K: payment.failed
            K->>O: payment.failed
            O->>K: order.cancelled  (تعويض)
            K->>I: order.cancelled → release stock
        end
    else rejected
        O->>O: status = CANCELLED (OUT_OF_STOCK)
        O->>K: order.cancelled
    end

    K->>N: order.confirmed / order.cancelled
    N->>N: إيميل + Web Push
```

### خطوات التعويض (Compensation)

| الخطوة | التعويض |
|---|---|
| حجز المخزون | `inventory.release` عند `order.cancelled` |
| تفويض الدفع | `payment.void` / `payment.refund` |
| نقاط الولاء | عكس القيد |

**كل معالج أحداث idempotent**: جدول `processed_events(event_id PK)` يمنع التكرار عند إعادة التسليم.

---

## 5. نمط Transactional Outbox

```mermaid
flowchart LR
    A["Business TX<br/>INSERT orders<br/>INSERT outbox"] --> DB[("PostgreSQL")]
    DB --> R["OutboxRelay<br/>@Scheduled poller<br/>FOR UPDATE SKIP LOCKED"]
    R --> K[("Kafka / MSK")]
    R --> DB2["UPDATE outbox SET published_at"]
```

بديل جاهز للإنتاج: **Debezium** على MSK Connect يقرأ WAL بدل الـ polling.

---

## 6. تدفق قراءة صفحة المنتج (Read Path)

```mermaid
flowchart LR
    U["المستخدم"] --> CF["CloudFront"]
    CF -->|"HIT (صور/JS/CSS)"| U
    CF -->|MISS| ALB --> GW["api-gateway"]
    GW --> RC{"Redis<br/>pdp:{sku}"}
    RC -->|HIT ~1ms| GW
    RC -->|MISS| PAR["نداءات متوازية"]
    PAR --> CAT["catalog"] & INV["inventory"] & REC["recommendation"]
    CAT --> MG[("DocumentDB")]
    PAR --> GW
    GW --> RC2["SETEX 300s"]
    GW --> U
```

**طبقات الـ Cache:**

1. المتصفح (`Cache-Control`)
2. CloudFront (الأصول الثابتة + استجابات GET العامة)
3. Next.js ISR / `revalidate`
4. Redis في الـ gateway (استجابات مجمّعة)
5. Redis داخل الخدمة (كيانات مفردة)
6. Read replicas في Aurora

---

## 7. حدود السياق (Bounded Contexts)

```mermaid
flowchart TB
    subgraph Identity
        U["User · Address · Role"]
    end
    subgraph Catalog
        P["Product · Variant · Category · Brand"]
    end
    subgraph Inventory
        S["StockItem · Reservation"]
    end
    subgraph Ordering
        O["Order · OrderLine · Shipment"]
    end
    subgraph Payments
        Pay["Payment · Refund"]
    end
    subgraph Discovery
        Se["SearchDocument · Recommendation"]
    end

    Catalog -.product.upserted.-> Discovery
    Catalog -.product.upserted.-> Inventory
    Ordering -.order.created.-> Inventory
    Ordering -.payment.requested.-> Payments
    Ordering -.order.*.-> Discovery
    Identity -.user.registered.-> Ordering
```

القاعدة: **لا نداء متزامن بين خدمتي مجال (domain services)** إلا في حالتين مبرّرتين (order → inventory عند الـ checkout المتزامن الاختياري). التكامل الافتراضي بالأحداث.

---

## 8. قرارات مفتاحية

| القرار | البديل المرفوض | السبب |
|---|---|---|
| Kafka/MSK كناقل رئيسي | SQS فقط | نحتاج إعادة تشغيل الأحداث (replay) لبناء الفهرس والتوصيات |
| MongoDB للكتالوج | PostgreSQL JSONB | مخطط المنتج يختلف جذريًا بين الأقسام + قراءات مستندية |
| PostgreSQL للطلبات/الدفع | MongoDB | معاملات ACID ومتطلبات محاسبية |
| Saga مُنسَّقة (orchestration) | Choreography | تتبّع أوضح لحالة الطلب وأسهل في التشخيص |
| BFF منفصل | نداء مباشر من المتصفح | تقليل عدد الرحلات + إخفاء التفاصيل الداخلية |
