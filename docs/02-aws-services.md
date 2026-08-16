# 02 — خدمات AWS المستخدمة

جدول شامل لكل خدمة AWS في هذا التصميم، سبب استخدامها، والمقابل المحلي أثناء التطوير.

## 1. الحوسبة والحاويات

| الخدمة | الاستخدام | ملاحظات |
|---|---|---|
| **Amazon EKS** | تشغيل كل الـ microservices | إصدار مُدار، control plane عبر 3 AZs |
| **Karpenter** | توفير العُقد تلقائيًا | يخلط On-Demand + **Spot** (حتى 70% توفير للأحمال بلا حالة) |
| **EC2 (Graviton — `m7g`, `c7g`)** | عُقد العنقود | أداء/سعر أفضل ~20% للأحمال Java/Node |
| **AWS Fargate (EKS profile)** | مهام دفعية ومهام cron | لا إدارة عُقد |
| **AWS Lambda** | معالجة الصور عند الرفع، تقارير، مهام مجدولة | مشغَّل من S3 Events / EventBridge |
| **Amazon ECR** | مستودع صور Docker | فحص الثغرات + immutable tags + lifecycle policy |

## 2. الشبكة والحافة (Edge)

| الخدمة | الاستخدام |
|---|---|
| **Amazon CloudFront** | CDN للأصول الثابتة، صور المنتجات، وصفحات Next.js المُخزّنة. Origin Shield مفعّل. |
| **AWS WAF** | حماية من OWASP Top 10، Bot Control، rate-based rules على `/login` و`/checkout` |
| **AWS Shield Standard/Advanced** | حماية DDoS |
| **Route 53** | DNS، latency-based routing، health checks، failover |
| **Application Load Balancer** | موازنة الحمل L7 داخل EKS عبر AWS Load Balancer Controller (Ingress) |
| **Network Load Balancer** | للـ gRPC / TCP الداخلي عند الحاجة |
| **AWS Certificate Manager** | شهادات TLS مجانية ومتجددة تلقائيًا |
| **VPC** | 3 AZs × (public / private / data) subnets |
| **NAT Gateway** | خروج للإنترنت من الـ private subnets |
| **VPC Endpoints (Gateway/Interface)** | S3, ECR, Secrets Manager, CloudWatch... — يقلّل تكلفة NAT ويحسّن الأمان |
| **AWS Global Accelerator** | (اختياري) تحسين زمن الاستجابة عالميًا |

## 3. قواعد البيانات

| الخدمة | الاستخدام | تفاصيل |
|---|---|---|
| **Amazon Aurora PostgreSQL** | identity · order · payment · inventory | Multi-AZ writer + 2 read replicas، Performance Insights، backups 35 يوم |
| **Amazon RDS Proxy** | تجميع الاتصالات | ضروري مع تعدّد الـ pods (كل pod له connection pool) |
| **Amazon DocumentDB** | كتالوج المنتجات (MongoDB-compatible) | 3 instances عبر AZs، TLS إجباري |
| **Amazon DynamoDB** | الجلسات، مفاتيح الـ idempotency، سلال الضيوف طويلة الأمد | On-Demand + TTL تلقائي + Global Tables للتوسع متعدد المناطق |
| **Amazon ElastiCache for Redis** | السلة، الكاش، rate limiting، leaderboards | Cluster mode enabled، 3 shards × 1 replica، Multi-AZ failover |
| **Amazon OpenSearch Service** | بحث المنتجات و facets | 3 data nodes + 3 dedicated master، UltraWarm للسجلات القديمة |

## 4. المراسلة والتكامل

| الخدمة | الاستخدام |
|---|---|
| **Amazon MSK (Managed Kafka)** | ناقل الأحداث الرئيسي — الـ Saga، مزامنة الفهرس، التحليلات |
| **MSK Connect (Debezium)** | CDC من Aurora → Kafka (بديل إنتاجي لـ Outbox polling) |
| **Amazon SQS + DLQ** | طوابير المهام والإشعارات، عزل الفشل |
| **Amazon SNS** | fan-out للإشعارات و SMS |
| **Amazon SES** | إيميلات المعاملات (تأكيد الطلب، الشحن) |
| **Amazon Pinpoint** | حملات تسويقية وPush للموبايل |
| **Amazon EventBridge** | جدولة (cron) وربط أحداث خدمات AWS |
| **AWS Step Functions** | (اختياري) Sagas طويلة الأمد مثل مسار الإرجاع/الاسترداد |

## 5. التخزين

| الخدمة | الاستخدام |
|---|---|
| **Amazon S3** | صور المنتجات، أصول الواجهة، نسخ احتياطية، data lake |
| **S3 Intelligent-Tiering** | تقليل تكلفة الصور نادرة الوصول |
| **Amazon EFS** | (عند الحاجة) تخزين مشترك لمهام معينة |
| **AWS Backup** | سياسة نسخ احتياطي موحّدة عبر RDS/DocumentDB/EFS |

## 6. الذكاء الاصطناعي والتوصيات

| الخدمة | الاستخدام |
|---|---|
| **Amazon Personalize** | محرك التوصيات — 3 recipes: `user-personalization-v2`، `similar-items`، `personalized-ranking` |
| **Personalize Event Tracker** | بثّ تفاعلات المستخدم لحظيًا (view / add-to-cart / purchase) |
| **Amazon Kinesis Data Firehose** | نقل تدفق التفاعلات إلى S3 لتدريب Personalize |
| **Amazon Bedrock** | (اختياري) توليد أوصاف المنتجات وتلخيص المراجعات |
| **Amazon Comprehend** | تحليل مشاعر المراجعات |
| **Amazon Rekognition** | فحص صور المنتجات (محتوى غير لائق / وسم تلقائي) |
| **Amazon Translate** | ترجمة أوصاف المنتجات عربي↔إنجليزي |
| **Amazon Fraud Detector** | كشف احتيال الطلبات |

## 7. الأمان والهوية

| الخدمة | الاستخدام |
|---|---|
| **AWS IAM + IRSA** | كل ServiceAccount في EKS له دور IAM محدد الصلاحيات — لا مفاتيح ثابتة |
| **AWS Secrets Manager** | أسرار قواعد البيانات ومفاتيح المزودين، تدوير تلقائي |
| **External Secrets Operator** | مزامنة الأسرار إلى Kubernetes Secrets |
| **AWS KMS** | تشفير at-rest لكل مخزن (CMK مخصص لكل بيئة) |
| **Amazon Cognito** | (بديل/مكمّل لـ identity-service) تسجيل دخول اجتماعي و MFA |
| **AWS Systems Manager Parameter Store** | إعدادات غير حساسة |
| **Amazon GuardDuty** | كشف التهديدات |
| **AWS Security Hub · AWS Config** | الامتثال والحوكمة |
| **Amazon Inspector** | فحص ثغرات الصور والعُقد |
| **AWS PrivateLink** | وصول خاص للخدمات دون المرور بالإنترنت |

## 8. المراقبة والتشغيل

| الخدمة | الاستخدام |
|---|---|
| **Amazon CloudWatch** | Logs (Fluent Bit من EKS)، Metrics، Alarms، Dashboards |
| **CloudWatch Container Insights** | مقاييس العنقود والحاويات |
| **AWS X-Ray / ADOT** | تتبّع موزّع عبر OpenTelemetry |
| **Amazon Managed Prometheus (AMP)** | تخزين مقاييس Prometheus |
| **Amazon Managed Grafana (AMG)** | لوحات المراقبة |
| **AWS CloudTrail** | سجل استدعاءات API للتدقيق |
| **AWS Cost Explorer + Budgets** | مراقبة التكلفة وتنبيهاتها |

## 9. البيانات والتحليلات

| الخدمة | الاستخدام |
|---|---|
| **Amazon Kinesis Data Streams** | تدفق أحداث النقر (clickstream) |
| **AWS Glue** | ETL وكتالوج البيانات |
| **Amazon Athena** | استعلامات SQL على S3 |
| **Amazon Redshift** | مستودع بيانات للتقارير التجارية |
| **Amazon QuickSight** | لوحات تحليلية للأعمال |

## 10. النشر والأتمتة

| الخدمة | الاستخدام |
|---|---|
| **AWS CodePipeline / GitHub Actions** | CI/CD |
| **AWS CodeBuild** | بناء الصور |
| **Argo CD (على EKS)** | GitOps — النشر التصريحي |
| **AWS App Mesh / Istio** | (اختياري) service mesh — mTLS، canary، retries |

---

## 11. المقابل المحلي أثناء التطوير

| AWS | محليًا |
|---|---|
| Aurora PostgreSQL | حاوية `postgres:16` |
| DocumentDB | حاوية `mongo:7` |
| ElastiCache | حاوية `redis:7` |
| MSK | حاوية `apache/kafka` (KRaft) |
| OpenSearch Service | حاوية `opensearchproject/opensearch` |
| S3 · SNS · SQS · Secrets Manager | **LocalStack** |
| SES | **Mailpit** |
| Personalize | fallback داخلي قائم على الشعبية (Redis sorted set) |
| CloudFront | Next.js dev server |
| EKS | docker-compose |

---

## 12. تقدير التكلفة الشهرية (بيئة إنتاج صغيرة، `me-south-1`)

| البند | التكوين | تقدير USD/شهر |
|---|---|---|
| EKS control plane | 1 عنقود | 73 |
| عُقد EC2 (Graviton, 60% Spot) | 6 × `m7g.large` | ~250 |
| Aurora PostgreSQL | writer `db.r6g.large` + replica | ~430 |
| DocumentDB | 2 × `db.r6g.large` | ~400 |
| ElastiCache Redis | 3 × `cache.r7g.large` | ~350 |
| MSK | 3 × `kafka.m7g.large` | ~420 |
| OpenSearch | 3 × `r6g.large.search` | ~330 |
| ALB + NAT × 3 | — | ~150 |
| CloudFront + S3 | 2 TB نقل | ~180 |
| Personalize | حملة واحدة + تدريب | ~120 |
| المراقبة | CloudWatch/AMP/AMG | ~120 |
| **الإجمالي التقريبي** | | **~2,800** |

**تقليل التكلفة:** Savings Plans (~30%)، Spot عبر Karpenter، Aurora Serverless v2 للبيئات غير الإنتاجية، إيقاف بيئة dev ليلًا، VPC Endpoints بدل NAT، S3 Intelligent-Tiering، Origin Shield لتقليل نداءات الأصل.
