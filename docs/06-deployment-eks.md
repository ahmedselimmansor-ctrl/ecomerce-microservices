# 06 — النشر على AWS / EKS

## 1. المتطلبات المسبقة

```bash
aws --version        # v2
terraform -version   # >= 1.9
kubectl version --client
helm version
```

صلاحيات IAM كافية لإنشاء VPC و EKS و RDS و MSK و OpenSearch و IAM roles.

---

## 2. تهيئة حالة Terraform (مرة واحدة)

الحالة في S3 مع قفل في DynamoDB — بدون ذلك يمكن لمهندسَين أن يفسدا البنية بتطبيق متزامن.

```bash
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
REGION=me-south-1

aws s3api create-bucket \
  --bucket "noon-tfstate-${ACCOUNT_ID}" \
  --region "$REGION" \
  --create-bucket-configuration LocationConstraint="$REGION"

aws s3api put-bucket-versioning \
  --bucket "noon-tfstate-${ACCOUNT_ID}" \
  --versioning-configuration Status=Enabled

aws s3api put-bucket-encryption \
  --bucket "noon-tfstate-${ACCOUNT_ID}" \
  --server-side-encryption-configuration \
  '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'

aws dynamodb create-table \
  --table-name noon-tf-locks \
  --attribute-definitions AttributeName=LockID,AttributeType=S \
  --key-schema AttributeName=LockID,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --region "$REGION"
```

ثم فعّل كتلة `backend "s3"` في [infra/terraform/versions.tf](../infra/terraform/versions.tf).

---

## 3. إنشاء البنية التحتية

```bash
make tf-init
make tf-plan ENV=dev      # راجع الخطة بعناية
make tf-apply ENV=dev
```

**المدة المتوقعة: 25–40 دقيقة.** الأبطأ: MSK (~20 دقيقة) و OpenSearch (~15) و Aurora (~10).

```bash
terraform -chdir=infra/terraform output
```

---

## 4. تثبيت مكوّنات العنقود

```bash
make kubeconfig CLUSTER=noon-dev REGION=me-south-1
./scripts/bootstrap-cluster.sh
```

يثبّت: AWS Load Balancer Controller · External Secrets Operator · Metrics Server · KEDA · Prometheus/Grafana · Fluent Bit.

### 4.1 Karpenter (توفير العُقد تلقائيًا)

```bash
helm upgrade --install karpenter oci://public.ecr.aws/karpenter/karpenter \
  --version "1.0.8" --namespace kube-system \
  --set "settings.clusterName=noon-dev" \
  --set "settings.interruptionQueue=noon-dev" \
  --wait

kubectl apply -f - <<'EOF'
apiVersion: karpenter.sh/v1
kind: NodePool
metadata:
  name: default
spec:
  template:
    spec:
      requirements:
        # تنويع الأنواع مقصود: كلما زاد التنوع قلّ احتمال
        # سحب كل عُقد الـ Spot دفعة واحدة
        - key: kubernetes.io/arch
          operator: In
          values: ["arm64"]
        - key: karpenter.sh/capacity-type
          operator: In
          values: ["spot", "on-demand"]
        - key: node.kubernetes.io/instance-type
          operator: In
          values: ["m7g.large","m7g.xlarge","c7g.large","c7g.xlarge","r7g.large"]
      nodeClassRef:
        group: karpenter.k8s.aws
        kind: EC2NodeClass
        name: default
      expireAfter: 720h
  limits:
    cpu: 200
  disruption:
    consolidationPolicy: WhenEmptyOrUnderutilized
    consolidateAfter: 60s
---
apiVersion: karpenter.k8s.aws/v1
kind: EC2NodeClass
metadata:
  name: default
spec:
  amiFamily: AL2023
  role: "KarpenterNodeRole-noon-dev"
  subnetSelectorTerms:
    - tags:
        karpenter.sh/discovery: "noon-dev"
  securityGroupSelectorTerms:
    - tags:
        karpenter.sh/discovery: "noon-dev"
EOF
```

---

## 5. تعبئة الأسرار

External Secrets يقرأ من Secrets Manager؛ ننشئ أسرار التطبيق أولًا:

```bash
REGION=me-south-1
ENV=dev

aws secretsmanager create-secret --region $REGION \
  --name "noon-${ENV}/app/jwt" \
  --secret-string "{\"secret\":\"$(openssl rand -hex 32)\"}"

aws secretsmanager create-secret --region $REGION \
  --name "noon-${ENV}/app/payment" \
  --secret-string '{"apiKey":"sk_live_replace_me"}'

aws secretsmanager create-secret --region $REGION \
  --name "noon-${ENV}/app/personalize" \
  --secret-string '{"campaignUserArn":"","trackingId":""}'
```

> أسرار Aurora و DocumentDB و Redis أنشأها Terraform تلقائيًا.

---

## 6. استبدال القيم النائبة

manifests الأساس تحتوي على `REPLACE_WITH_*` مقصودة — لا نضع ARNs في Git.

```bash
cd infra/terraform
MSK=$(terraform output -raw msk_bootstrap_brokers_iam)
OS="https://$(terraform output -raw opensearch_endpoint)"
APP_ROLE=$(terraform output -raw app_irsa_role_arn)
ES_ROLE=$(terraform output -raw external_secrets_role_arn)
cd -

sed -i "s|REPLACE_WITH_MSK_BOOTSTRAP|${MSK}|g"            infra/k8s/base/01-config.yaml
sed -i "s|REPLACE_WITH_OPENSEARCH_ENDPOINT|${OS}|g"        infra/k8s/base/01-config.yaml
sed -i "s|REPLACE_WITH_APP_ROLE_ARN|${APP_ROLE}|g"         infra/k8s/base/03-serviceaccounts.yaml
sed -i "s|REPLACE_WITH_EXTERNAL_SECRETS_ROLE_ARN|${ES_ROLE}|g" infra/k8s/base/02-secrets.yaml
```

> **أفضل للإنتاج:** أبقِ هذه القيم خارج Git تمامًا واحقنها من الـ CI أو من Argo CD عبر `kustomize edit`.

---

## 7. بناء الصور ورفعها

```bash
export ECR_REGISTRY="$(aws sts get-caller-identity --query Account --output text).dkr.ecr.me-south-1.amazonaws.com"
./scripts/push-images.sh "$ECR_REGISTRY" v1.0.0
```

> الصور تُبنى لـ **arm64** لتطابق عُقد Graviton. بناء amd64 سيفشل عند التشغيل بـ `exec format error`.

---

## 8. النشر

```bash
cd infra/k8s/overlays/dev
for s in api-gateway identity-service catalog-service order-service payment-service \
         inventory-service cart-service search-service recommendation-service \
         notification-service web; do
  kustomize edit set image "noon/${s}=${ECR_REGISTRY}/noon/${s}:v1.0.0"
done
cd -

kubectl diff -k infra/k8s/overlays/dev    # عاين قبل التطبيق
kubectl apply -k infra/k8s/overlays/dev
kubectl get pods -n noon -w
```

---

## 9. تهيئة البيانات بعد أول نشر

```bash
# ترحيلات قواعد البيانات تُنفَّذ تلقائيًا بـ Flyway عند إقلاع كل خدمة.
# يبقى إنشاء topics في MSK (auto.create معطّل عمدًا في الإنتاج):

kubectl run kafka-admin -n noon --rm -it --restart=Never \
  --image=apache/kafka:3.8.1 -- bash -c '
for t in catalog.product.v1:6 order.events.v1:12 inventory.events.v1:12 \
         payment.events.v1:12 user.interactions.v1:6 notification.commands.v1:3; do
  name="${t%%:*}"; parts="${t##*:}"
  /opt/kafka/bin/kafka-topics.sh --bootstrap-server "$KAFKA_BOOTSTRAP_SERVERS" \
    --create --if-not-exists --topic "$name" \
    --partitions "$parts" --replication-factor 3 \
    --config min.insync.replicas=2
  # طابور الرسائل الميتة لكل topic
  /opt/kafka/bin/kafka-topics.sh --bootstrap-server "$KAFKA_BOOTSTRAP_SERVERS" \
    --create --if-not-exists --topic "${name}.dlq" \
    --partitions 3 --replication-factor 3
done'
```

---

## 10. التحقق

```bash
kubectl get pods -n noon
kubectl get ingress -n noon
ALB=$(kubectl get ingress noon -n noon -o jsonpath='{.status.loadBalancer.ingress[0].hostname}')

GATEWAY_URL="https://${ALB}" ./scripts/smoke-test.sh
```

---

## 11. استراتيجية النشر (Rollout)

الإعداد الحالي **Rolling Update بـ `maxUnavailable: 0`**: نسخة جديدة تصعد وتصبح جاهزة قبل أن تنزل القديمة، فلا تنخفض الطاقة أثناء النشر.

### 11.1 Canary (تدريجي)

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

### 11.2 الاسترجاع

```bash
kubectl rollout undo deployment/order-service -n noon
kubectl rollout status deployment/order-service -n noon
```

> **تحذير مهم:** ترحيلات قاعدة البيانات **لا تُسترجَع** مع الكود. القاعدة: كل ترحيل يجب أن يكون متوافقًا مع الإصدارين (expand/contract): أضف عمودًا ⇒ انشر الكود ⇒ في إصدار لاحق احذف القديم.

---

## 12. المراقبة

```bash
kubectl port-forward -n monitoring svc/kube-prometheus-grafana 3001:80
# admin / prom-operator
```

**المقاييس التي يجب مراقبتها فعلًا:**

| المقياس | التنبيه عند |
|---|---|
| `noon_outbox_pending` | > 1000 لمدة 5 دقائق ⇒ الـ Saga متوقفة |
| `kafka_consumergroup_lag` | > 10000 ⇒ المستهلك لا يلحق |
| `noon_orders_total{result="rejected"}` | ارتفاع مفاجئ ⇒ مشكلة في المخزون أو الدفع |
| `noon_payment_gateway_duration` p99 | > 3s ⇒ مزوّد الدفع متأخر |
| `http_server_requests_seconds` p95 | > 500ms ⇒ تدهور أداء |
| `aurora_cpu` / `DatabaseConnections` | > 80% ⇒ الحاجة لنسخة قارئة إضافية |

---

## 13. الهدم

```bash
# احذف موارد Kubernetes أولًا: تركها يترك ALBs يتيمة تستمر في الفوترة
kubectl delete -k infra/k8s/overlays/dev
sleep 60
make tf-destroy ENV=dev
```

> في `prod` فعّلنا `deletion_protection` على Aurora و DocumentDB عمدًا — يجب تعطيلها يدويًا أولًا. هذا حاجز متعمّد ضد الحذف بالخطأ.

---

## 14. تعدد المناطق (مرحلة لاحقة)

| المرحلة | الوصف |
|---|---|
| 1 — Active/Passive | Aurora Global Database + DynamoDB Global Tables + S3 CRR، التحويل عبر Route 53 health checks (RTO ~15 دقيقة) |
| 2 — Active/Active للقراءة | عنقود EKS ثانٍ يخدم القراءة محليًا، الكتابة موجّهة للمنطقة الرئيسية |
| 3 — Active/Active كامل | يحتاج حل تعارض الكتابة — تعقيد كبير، يُبرَّر فقط بمتطلبات إقامة البيانات (data residency) |
