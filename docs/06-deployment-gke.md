# 06 — النشر على Google Cloud / GKE

## 1. المتطلبات المسبقة

```bash
gcloud version
gcloud components install gke-gcloud-auth-plugin   # بدونه لن يصادق kubectl على العنقود
terraform -version   # >= 1.9
kubectl version --client
helm version
```

```bash
export PROJECT_ID="topchoice-prod-4821"    # عدّله لمشروعك
export REGION="me-central1"                # الدوحة — أقرب منطقة لعملاء مصر والخليج
export ENV="dev"

gcloud config set project "$PROJECT_ID"
gcloud config set compute/region "$REGION"
```

**الصلاحيات المطلوبة على المشروع:** `roles/container.admin` · `roles/compute.networkAdmin` ·
`roles/cloudsql.admin` · `roles/redis.admin` · `roles/managedkafka.admin` ·
`roles/datastore.owner` · `roles/secretmanager.admin` · `roles/artifactregistry.admin` ·
`roles/cloudkms.admin` · `roles/iam.serviceAccountAdmin` · `roles/resourcemanager.projectIamAdmin`.

> `projectIamAdmin` هو الأخطر في القائمة (يمنح حاملَه القدرة على منح نفسه أي شيء).
> يُعطى لحساب خدمة الـ CI وحده، لا للمهندسين، ولا يُترك عليهم بعد التهيئة الأولى.

### 1.1 تفعيل الـ APIs

على Google Cloud كل خدمة معطّلة حتى تُفعَّل صراحةً؛ إغفال واحدة يوقف `terraform apply`
في منتصفه برسالة `API has not been used in project`:

```bash
gcloud services enable \
  compute.googleapis.com \
  container.googleapis.com \
  servicenetworking.googleapis.com \
  sqladmin.googleapis.com \
  redis.googleapis.com \
  managedkafka.googleapis.com \
  firestore.googleapis.com \
  pubsub.googleapis.com \
  secretmanager.googleapis.com \
  artifactregistry.googleapis.com \
  cloudkms.googleapis.com \
  certificatemanager.googleapis.com \
  dns.googleapis.com \
  retail.googleapis.com \
  dataflow.googleapis.com \
  bigquery.googleapis.com \
  logging.googleapis.com \
  monitoring.googleapis.com \
  cloudtrace.googleapis.com \
  binaryauthorization.googleapis.com \
  iam.googleapis.com
```

### 1.2 خطوة يدوية واحدة: MongoDB Atlas

الكتالوج على MongoDB Atlas، وهي ليست خدمة Google. أنشئ العنقود واتصاله **قبل**
`terraform apply`، لأن Terraform هنا مقصور على مزوّدَي `google` و`google-beta`
فقط — لا نضيف مزوّدًا خارجيًا لئلا يصبح `terraform init` معتمدًا على طرف ثالث:

1. أنشئ عنقود Atlas بحجم M30 فما فوق (Private Service Connect يحتاج طبقة مخصصة) في `me-central1`.
2. من واجهة Atlas: **Network Access → Private Endpoint → Google Cloud**، واختر شبكة `topchoice-dev-vpc`.
3. Atlas يعطيك أمر `gcloud compute forwarding-rules create` جاهزًا — نفّذه كما هو.
4. ضع سلسلة الاتصال في Secret Manager (القسم 6)، ولا تضعها في `.tfvars` إطلاقًا.

النتيجة: حركة الكتالوج لا تخرج إلى الإنترنت ولا تحتاج قائمة عناوين مسموحة.

---

## 2. تهيئة حالة Terraform (مرة واحدة)

الحالة في Cloud Storage. لا حاجة لجدول قفل منفصل: الـ backend من نوع `gcs` يقفل
عبر أرقام أجيال الكائن (object generation) في الدلو نفسه، فالقفل والحالة شيء
واحد يُنشأ ويُهدَم معًا — نصف الإعداد اختفى مقارنةً بقفل خارجي.

```bash
gcloud storage buckets create "gs://topchoice-tfstate-${PROJECT_ID}" \
  --project="$PROJECT_ID" \
  --location="$REGION" \
  --default-storage-class=STANDARD \
  --uniform-bucket-level-access \
  --public-access-prevention

# الإصدارات ليست رفاهية: هي طريقة التراجع الوحيدة بعد تطبيق خاطئ
gcloud storage buckets update "gs://topchoice-tfstate-${PROJECT_ID}" --versioning
```

ثم فعّل كتلة `backend "gcs"` في [infra/terraform/versions.tf](../infra/terraform/versions.tf):

```hcl
backend "gcs" {
  bucket = "topchoice-tfstate-<project-id>"
  prefix = "platform"
}
```

---

## 3. إنشاء البنية التحتية

```bash
make tf-init
make tf-plan ENV=dev      # راجع الخطة بعناية
make tf-apply ENV=dev
```

**المدة المتوقعة: 30–45 دقيقة.** الأبطأ: Cloud SQL Enterprise Plus بترتيب HA إقليمي
(~20 دقيقة) و Managed Service for Apache Kafka (~20) وعنقود GKE الإقليمي (~10).

> Firestore استثناء يستحق الانتباه: **وضع القاعدة (Native مقابل Datastore) لا يتغيّر
> بعد الإنشاء، وقاعدة `(default)` لا تُحذف.** خطأ هنا يعني مشروعًا جديدًا، لا
> `terraform destroy`. تحقق من `terraform plan` قبل التطبيق أول مرة.

```bash
terraform -chdir=infra/terraform output
```

---

## 4. ربط kubectl بالعنقود

```bash
gcloud container clusters get-credentials "topchoice-${ENV}" \
  --region "$REGION" \
  --project "$PROJECT_ID"

kubectl get nodes -o wide
```

> `--region` لا `--zone`: العنقود إقليمي، والـ control plane منسوخ عبر
> `me-central1-a/b/c`. استخدام `--zone` يفشل بـ `cluster not found`.

العُقد خاصة بلا عناوين عامة. الوصول إلى الـ control plane محصور بـ authorized
networks، فإن جاء `kubectl` بـ `i/o timeout` فالسبب غالبًا عنوانك لا العنقود:

```bash
gcloud container clusters update "topchoice-${ENV}" --region "$REGION" \
  --enable-master-authorized-networks \
  --master-authorized-networks "$(curl -s ifconfig.me)/32"
```

---

## 5. تثبيت مكوّنات العنقود

```bash
./scripts/bootstrap-cluster.sh
```

يثبّت: External Secrets Operator · KEDA · Prometheus/Grafana · OpenSearch (StatefulSet).

**ما لا يثبّته، وهو الفرق الأكبر عن عنقود نبنيه بأنفسنا:** موازن الحمل يأتي من
GKE Ingress مدمجًا في العنقود (لا متحكم نثبّته)، و`metrics-server` مفعّل افتراضيًا،
وجمع السجلات والمقاييس يتم بوكلاء Cloud Logging و Cloud Monitoring المدارَين من
Google — فلا DaemonSet لتجميع السجلات ولا مخزن مقاييس ندير سعته. قائمة الـ
bootstrap أقصر بأربعة مكوّنات، وكل مكوّن محذوف هو ترقية أقل كل ربع سنة.

### 5.1 توفير العُقد تلقائيًا (node auto-provisioning)

لا نعرّف مجموعات عُقد ثابتة نخمّن أحجامها. نضع حدود موارد للعنقود كله، ويتولى GKE
إنشاء مجموعات بأشكال مناسبة عند الحاجة وحذفها عند الفراغ:

```bash
cat > /tmp/nap-config.yaml <<'EOF'
resourceLimits:
  - resourceType: 'cpu'
    minimum: 4
    maximum: 200
  - resourceType: 'memory'
    minimum: 16
    maximum: 800
management:
  autoRepair: true
  autoUpgrade: true
shieldedInstanceConfig:
  enableSecureBoot: true
  enableIntegrityMonitoring: true
autoprovisioningLocations:
  - me-central1-a
  - me-central1-b
  - me-central1-c
diskSizeGb: 100
diskType: pd-balanced
EOF

gcloud container clusters update "topchoice-${ENV}" --region "$REGION" \
  --enable-autoprovisioning \
  --autoprovisioning-config-file /tmp/nap-config.yaml

# دمج أسرع للعُقد قليلة الاستغلال — مقبول لأن كل خدمة عليها PodDisruptionBudget
gcloud container clusters update "topchoice-${ENV}" --region "$REGION" \
  --autoscaling-profile optimize-utilization
```

**عن Spot:** لا يوجد إعداد عام يقول «استخدم Spot». المُوفِّر التلقائي ينشئ مجموعة
Spot حين يجد pod يطلبها صراحةً بـ `nodeSelector` ويتحمّل الـ taint المرافق. أي أن
سياسة التكلفة تُكتب في manifest الخدمة لا في إعداد العنقود — وهذا مقصود: الخدمة
التي لا يجوز سحبها من تحتها تعلن ذلك في ملفها، لا في إعداد بعيد ينساه أحد.
التفصيل في [ADR 0005](adr/0005-gke-over-alternatives.md).

```bash
# تحقّق مما أنشأه المُوفِّر فعلًا بعد أول نشر
kubectl get nodes -L cloud.google.com/gke-spot,node.kubernetes.io/instance-type
```

---

## 6. تعبئة الأسرار

External Secrets يقرأ من Secret Manager؛ ننشئ أسرار التطبيق أولًا:

```bash
create_secret() {   # الاسم، ثم القيمة على stdin
  gcloud secrets create "$1" \
    --replication-policy=user-managed --locations="$REGION" \
    2>/dev/null || true
  gcloud secrets versions add "$1" --data-file=-
}

openssl rand -hex 32 | jq -Rn '{secret: input}' \
  | create_secret "topchoice-${ENV}-app-jwt"

echo '{"apiKey":"sk_live_replace_me"}' \
  | create_secret "topchoice-${ENV}-app-payment"

echo '{"apiKey":"SG.replace_me"}' \
  | create_secret "topchoice-${ENV}-app-sendgrid"

echo '{"uri":"mongodb+srv://...replace_me..."}' \
  | create_secret "topchoice-${ENV}-catalog-mongodb"
```

> **`-` بدل `/` مقصود.** معرّف السرّ في Secret Manager لا يقبل الشرطة المائلة —
> لا يوجد مفهوم مسار هرمي أصلًا. الاسم مسطّح، والتجميع يتم بالـ labels
> (`env=dev`, `component=app`) لا بالبنية.

> **`user-managed` بدل التلقائي مقصود أيضًا.** النسخ التلقائي يوزّع السرّ عالميًا؛
> نحن نثبّته في `me-central1` وحدها لأن إقامة البيانات جزء من متطلباتنا
> (انظر [07 — الأمان](07-security.md)).

> أسرار Cloud SQL و Memorystore أنشأها Terraform تلقائيًا. سلسلة اتصال Atlas
> أدخلناها يدويًا أعلاه لأن Terraform لا يدير Atlas هنا.

---

## 7. استبدال القيم النائبة

manifests الأساس تحتوي على `REPLACE_WITH_*` مقصودة — لا نضع عناوين ولا حسابات خدمة في Git.

```bash
cd infra/terraform
KAFKA=$(terraform output -raw kafka_bootstrap_servers)
APP_GSA=$(terraform output -raw app_service_account_email)
ES_GSA=$(terraform output -raw external_secrets_service_account_email)
CERT=$(terraform output -raw ssl_certificate_name)
ARMOR=$(terraform output -raw cloud_armor_policy_name)
cd -

sed -i "s|REPLACE_WITH_KAFKA_BOOTSTRAP|${KAFKA}|g"          infra/k8s/base/01-config.yaml
sed -i "s|REPLACE_WITH_KAFKA_BOOTSTRAP|${KAFKA}|g"          infra/k8s/components/keda/keda.yaml
sed -i "s|REPLACE_WITH_APP_GSA_EMAIL|${APP_GSA}|g"          infra/k8s/base/03-serviceaccounts.yaml
sed -i "s|REPLACE_WITH_EXTERNAL_SECRETS_GSA_EMAIL|${ES_GSA}|g" infra/k8s/base/02-secrets.yaml
sed -i "s|REPLACE_WITH_SSL_CERT_NAME|${CERT}|g"             infra/k8s/base/50-ingress.yaml
sed -i "s|REPLACE_WITH_ARMOR_POLICY|${ARMOR}|g"             infra/k8s/base/50-ingress.yaml
```

> `OPENSEARCH_URL` لم يعد قيمة نائبة: OpenSearch داخل العنقود، فعنوانه ثابت
> (`http://opensearch:9200`) ولا ينتظر مخرجات Terraform.

### 7.1 ربط Workload Identity

الـ `sed` أعلاه يضع بريد حساب الخدمة على الـ ServiceAccount. يبقى الطرف الآخر من
الربط — أن يسمح حساب خدمة GCP لهوية Kubernetes بانتحاله. Terraform يفعل هذا،
وهذا هو شكل العضو الذي يجب أن تراه إن راجعته:

```
serviceAccount:${PROJECT_ID}.svc.id.goog[topchoice/catalog-service]
```

```bash
# تحقّق عمليًا: أي pod يجب أن يحصل على توكن بلا أي مفتاح على القرص
kubectl run wi-check -n topchoice --rm -it --restart=Never \
  --overrides='{"spec":{"serviceAccountName":"catalog-service"}}' \
  --image=google/cloud-sdk:slim -- gcloud auth list
```

يجب أن يظهر بريد حساب الخدمة. إن ظهر حساب العقدة الافتراضي فالربط ناقص، والخدمة
تعمل بصلاحيات العقدة — وهي أوسع مما ينبغي دائمًا.

---

## 8. بناء الصور ورفعها

```bash
gcloud auth configure-docker "${REGION}-docker.pkg.dev"

export REGISTRY="${REGION}-docker.pkg.dev/${PROJECT_ID}/topchoice"
./scripts/push-images.sh "$REGISTRY" v1.0.0
```

> **المعمارية:** الصور تُبنى لـ `amd64`. عائلات Arm (Axion / C4A) ليست متاحة في كل
> منطقة، ولا نبني لمعمارية قد لا نجد لها آلة في `me-central1`. تحقّق قبل أي تحوّل:
>
> ```bash
> gcloud compute machine-types list --filter="zone:${REGION}-a AND name~^c4a" --limit=5
> ```
>
> إن ظهرت نتائج، التحول إلى `arm64` يوفّر فعليًا — لكنه يتطلب إعادة بناء كل الصور
> معًا؛ صورة `amd64` واحدة تبقى على عقدة Arm تفشل بـ `exec format error`.

---

## 9. النشر

```bash
cd infra/k8s/overlays/dev
for s in api-gateway identity-service catalog-service order-service payment-service \
         inventory-service cart-service search-service recommendation-service \
         notification-service web; do
  kustomize edit set image "topchoice/${s}=${REGISTRY}/${s}:v1.0.0"
done
cd -

kubectl diff -k infra/k8s/overlays/dev    # عاين قبل التطبيق
kubectl apply -k infra/k8s/overlays/dev
kubectl get pods -n topchoice -w
```

---

## 10. تهيئة البيانات بعد أول نشر

ترحيلات قواعد البيانات تُنفَّذ تلقائيًا بـ Flyway عند إقلاع كل خدمة. يبقى شيئان:

### 10.1 مواضيع Kafka

`auto.create` معطّل عمدًا في الإنتاج — موضوع يُنشأ بالخطأ بعدد أقسام افتراضي يكسر
ترتيب الـ Saga بصمت. ننشئها صراحةً، ومن سطر الأوامر مباشرةً بلا pod وسيط:

```bash
for t in catalog.product.v1:6 order.events.v1:12 inventory.events.v1:12 \
         payment.events.v1:12 user.interactions.v1:6 notification.commands.v1:3; do
  name="${t%%:*}"; parts="${t##*:}"

  gcloud managed-kafka topics create "$name" \
    --cluster="topchoice-${ENV}" --location="$REGION" \
    --partitions="$parts" --replication-factor=3 \
    --configs=min.insync.replicas=2

  # طابور الرسائل الميتة لكل موضوع
  gcloud managed-kafka topics create "${name}.dlq" \
    --cluster="topchoice-${ENV}" --location="$REGION" \
    --partitions=3 --replication-factor=3
done

gcloud managed-kafka topics list --cluster="topchoice-${ENV}" --location="$REGION"
```

### 10.2 سياسات TTL في Firestore

الفهارس المركّبة أنشأها Terraform. سياسات TTL كذلك، وهذا تحقق منها — مستند لا
ينتهي هو تسريب تخزين وتسريب جلسات معًا:

```bash
gcloud firestore fields ttls list --database='(default)'
```

يجب أن ترى `expiresAt` في `idempotency` و`sessions` و`events`.

---

## 11. التحقق

```bash
kubectl get pods -n topchoice
kubectl get ingress -n topchoice

# GKE Ingress يعطي عنوان IP عالميًا، لا اسم مضيف
LB_IP=$(kubectl get ingress topchoice -n topchoice \
  -o jsonpath='{.status.loadBalancer.ingress[0].ip}')

GATEWAY_URL="https://${LB_IP}" ./scripts/smoke-test.sh
```

> أول نشر يحتاج **10–20 دقيقة** قبل أن يستجيب الموازن، ويردّ خلالها بـ 404 أو 502.
> السببان معًا عادةً: نشر إعداد الموازن العالمي، وإصدار شهادة Google المُدارة الذي
> لا يبدأ قبل أن يشير سجل DNS إلى العنوان فعليًا. راقب الحالة بدل التخمين:
>
> ```bash
> kubectl describe ingress topchoice -n topchoice
> gcloud compute ssl-certificates describe "$(terraform -chdir=infra/terraform output -raw ssl_certificate_name)" \
>   --global --format='value(managed.status, managed.domainStatus)'
> ```

---

## 12. استراتيجية النشر (Rollout)

الإعداد الحالي **Rolling Update بـ `maxUnavailable: 0`**: نسخة جديدة تصعد وتصبح جاهزة قبل أن تنزل القديمة، فلا تنخفض الطاقة أثناء النشر.

### 12.1 Canary (تدريجي)

لتوجيه نسبة من الحركة إلى الإصدار الجديد:

```yaml
# Argo Rollouts — بديل Deployment
apiVersion: argoproj.io/v1alpha1
kind: Rollout
metadata:
  name: order-service
spec:
  strategy:
    canary:
      steps:
        - setWeight: 5
        - pause: { duration: 5m }     # راقب معدل الأخطاء
        - setWeight: 25
        - pause: { duration: 10m }
        - setWeight: 50
        - pause: { duration: 10m }
      analysis:
        templates:
          - templateName: error-rate
        # إيقاف تلقائي إن تجاوز معدل الأخطاء الحد
```

### 12.2 الاسترجاع

```bash
kubectl rollout undo deployment/order-service -n topchoice
kubectl rollout status deployment/order-service -n topchoice
```

> **تحذير مهم:** ترحيلات قاعدة البيانات **لا تُسترجَع** مع الكود. القاعدة: كل ترحيل يجب أن يكون متوافقًا مع الإصدارين (expand/contract): أضف عمودًا ⇒ انشر الكود ⇒ في إصدار لاحق احذف القديم.

### 12.3 ترقيات العنقود

على قناة `regular` تُرقّى العُقد تلقائيًا داخل نافذة الصيانة. هذا يعني أن الـ
PodDisruptionBudget ليس تحسينًا اختياريًا بل ما يمنع الترقية من إسقاط كل نسخ خدمة
دفعة واحدة:

```bash
gcloud container clusters update "topchoice-${ENV}" --region "$REGION" \
  --maintenance-window-start="2026-01-01T22:00:00Z" \
  --maintenance-window-end="2026-01-02T02:00:00Z" \
  --maintenance-window-recurrence='FREQ=WEEKLY;BYDAY=TU,WE'

kubectl get pdb -n topchoice   # يجب أن ترى واحدًا لكل خدمة
```

---

## 13. المراقبة

المقاييس والسجلات تصل إلى Cloud Monitoring و Cloud Logging بلا إعداد منّا. نبقي
Grafana داخل العنقود للوحات المألوفة، ومصدر بياناته هو واجهة Managed Service for
Prometheus:

```bash
kubectl port-forward -n monitoring svc/kube-prometheus-grafana 3001:80
# admin / prom-operator
```

```bash
# قراءة سريعة بلا لوحة: أخطاء البوابة في آخر ساعة
gcloud logging read \
  'resource.type="k8s_container"
   resource.labels.container_name="api-gateway"
   severity>=ERROR' \
  --limit=20 --freshness=1h --format='value(timestamp, textPayload)'
```

**المقاييس التي يجب مراقبتها فعلًا:**

| المقياس | التنبيه عند |
|---|---|
| `topchoice_outbox_pending` | > 1000 لمدة 5 دقائق ⇒ الـ Saga متوقفة |
| `kafka_consumergroup_lag` | > 10000 ⇒ المستهلك لا يلحق |
| `topchoice_orders_total{result="rejected"}` | ارتفاع مفاجئ ⇒ مشكلة في المخزون أو الدفع |
| `topchoice_payment_gateway_duration` p99 | > 3s ⇒ مزوّد الدفع متأخر |
| `http_server_requests_seconds` p95 | > 500ms ⇒ تدهور أداء |
| `cloudsql.googleapis.com/database/cpu/utilization` | > 0.8 ⇒ الحاجة لنسخة قارئة إضافية |
| `cloudsql.googleapis.com/database/postgresql/num_backends` | يقترب من `max_connections` ⇒ راجع حجم الـ pool في الـ sidecar |
| `kubernetes.io/node/cpu/allocatable_utilization` | > 0.85 ⇒ المُوفِّر التلقائي لا يلحق بالطلب |

---

## 14. الهدم

```bash
# احذف موارد Kubernetes أولًا: تركها يترك قواعد توجيه وخدمات خلفية
# يتيمة في المشروع تستمر في الفوترة بعد اختفاء العنقود
kubectl delete -k infra/k8s/overlays/dev
sleep 60
make tf-destroy ENV=dev

# تحقق من عدم بقاء بقايا الموازن
gcloud compute forwarding-rules list --global
gcloud compute backend-services list --global
```

> في `prod` فعّلنا `deletion_protection` على Cloud SQL عمدًا — يجب تعطيلها يدويًا
> أولًا. هذا حاجز متعمّد ضد الحذف بالخطأ.

> **Firestore لا يُهدَم مع الباقي**: قاعدة `(default)` تبقى، والمشروع نفسه هو وحدة
> الحذف. لا تعتبر `terraform destroy` تنظيفًا كاملًا للبيانات.

---

## 15. تعدد المناطق (مرحلة لاحقة)

| المرحلة | الوصف |
|---|---|
| 1 — Active/Passive | نسخة قارئة لـ Cloud SQL عبر المناطق + Firestore متعدد المناطق + دلو Cloud Storage ثنائي المنطقة، والتحويل عبر سياسة توجيه بفحوص صحة في Cloud DNS (RTO ~15 دقيقة) |
| 2 — Active/Active للقراءة | عنقود GKE ثانٍ يخدم القراءة محليًا خلف نفس الموازن العالمي (عنوان IP واحد يوجّه لأقرب backend صحيح)، والكتابة موجّهة للمنطقة الرئيسية |
| 3 — Active/Active كامل | يحتاج حل تعارض الكتابة — تعقيد كبير، يُبرَّر فقط بمتطلبات إقامة البيانات (data residency) |

> المرحلة 2 أسهل هنا مما تبدو: موازن الحمل العالمي في Google أحادي العنوان أصلًا
> ويوزّع على أقرب backend صحيح، فلا نحتاج توجيهًا جغرافيًا في DNS. المرحلة 1 هي
> الصعبة لأنها تخص البيانات لا الحركة — وهذا هو الترتيب الحقيقي للصعوبة دائمًا.
