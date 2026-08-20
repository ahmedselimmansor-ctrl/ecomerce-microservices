#!/usr/bin/env bash
# ============================================================================
#  تثبيت مكوّنات العنقود بعد إنشاء GKE بـ Terraform.
#
#  هذه المكوّنات لا تُدار في Terraform عمدًا: دورة حياتها تتبع العنقود
#  لا البنية التحتية، وترقيتها يجب أن تكون منفصلة عن تغييرات الشبكة
#  وقواعد البيانات.
#
#  القائمة هنا أقصر مما كانت: GKE يأتي بموازن الأحمال، ومخدّم المقاييس،
#  وجمع السجلات مدمجة في العنقود نفسه، فلا نثبّت لها بديلًا.
# ============================================================================
set -euo pipefail

CLUSTER="${CLUSTER:-topchoice-dev}"
REGION="${GCP_REGION:-me-central1}"
PROJECT="${GOOGLE_CLOUD_PROJECT:-$(gcloud config get-value project 2>/dev/null || true)}"
TF_DIR="$(dirname "$0")/../infra/terraform"

need() { command -v "$1" >/dev/null 2>&1 || { echo "missing: $1" >&2; exit 1; }; }
need gcloud
need kubectl
need helm

if [ -z "$PROJECT" ] || [ "$PROJECT" = "(unset)" ]; then
  echo "set GOOGLE_CLOUD_PROJECT or run: gcloud config set project PROJECT_ID" >&2
  exit 1
fi

echo "==> connecting to ${CLUSTER}"
gcloud container clusters get-credentials "$CLUSTER" \
  --region "$REGION" --project "$PROJECT"
kubectl cluster-info

tf_out() { terraform -chdir="$TF_DIR" output -raw "$1" 2>/dev/null || echo ""; }

# ------------------------------------------------------ الدخول من الخارج

echo ""
echo "==> Ingress / Gateway"
# لا يوجد controller نثبّته: وحدة تحكم GKE تُنشئ موازن أحمال Google مباشرةً
# من موارد Ingress و Gateway. نتحقق فقط أن الـ CRDs موجودة — غيابها يعني
# أن العنقود أُنشئ بلا gateway_api_config في Terraform.
if kubectl get crd gateways.gateway.networking.k8s.io >/dev/null 2>&1; then
  echo "    Gateway API متاح"
else
  echo "    تحذير: Gateway API غير مفعّل على العنقود — يعمل Ingress وحده"
fi

# -------------------------------------------------- External Secrets Operator

echo ""
echo "==> External Secrets Operator"
helm repo add external-secrets https://charts.external-secrets.io >/dev/null 2>&1 || true
helm repo update >/dev/null

# الحساب الذي يقرأ Secret Manager. الربط عبر Workload Identity: لا مفتاح
# JSON داخل العنقود، والصلاحية تُسحب بحذف الربط لا بتدوير سرّ.
ESO_GSA="$(tf_out external_secrets_service_account)"
[ -n "$ESO_GSA" ] || ESO_GSA="${CLUSTER}-external-secrets@${PROJECT}.iam.gserviceaccount.com"

helm upgrade --install external-secrets external-secrets/external-secrets \
  --namespace external-secrets --create-namespace \
  --set installCRDs=true \
  --set webhook.replicaCount=2 \
  --set serviceAccount.create=true \
  --set serviceAccount.name=external-secrets \
  --set "serviceAccount.annotations.iam\.gke\.io/gcp-service-account=${ESO_GSA}" \
  --wait --timeout 5m

# ------------------------------------------------------------------- metrics

echo ""
echo "==> Metrics Server (مطلوب لـ HPA)"
# مدمج في GKE ويُدار مع نسخة العنقود؛ تثبيت نسخة ثانية يُنتج مصدرَي مقاييس
# متنافسين ويجعل قرارات الـ HPA غير قابلة للتفسير.
kubectl -n kube-system get deployment metrics-server >/dev/null 2>&1 \
  && echo "    متوفّر مع العنقود" \
  || echo "    تحذير: غير موجود — HPA لن يتوسّع"

# ---------------------------------------------------------------------- KEDA

echo ""
echo "==> KEDA (التوسّع بعمق طابور Kafka)"
helm repo add kedacore https://kedacore.github.io/charts >/dev/null 2>&1 || true
helm repo update >/dev/null
helm upgrade --install keda kedacore/keda \
  --namespace keda --create-namespace \
  --wait --timeout 5m

# ------------------------------------------------------------ توفير العُقد

echo ""
echo "==> Node auto-provisioning (توفير العُقد تلقائيًا)"
echo "    مُفعَّل على مستوى العنقود في Terraform — راجع docs/06-deployment-gke.md"

# ------------------------------------------------------------- observability

echo ""
echo "==> Prometheus + Grafana"
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts >/dev/null 2>&1 || true
helm repo update >/dev/null

helm upgrade --install kube-prometheus prometheus-community/kube-prometheus-stack \
  --namespace monitoring --create-namespace \
  --set prometheus.prometheusSpec.retention=15d \
  --set prometheus.prometheusSpec.resources.requests.memory=2Gi \
  --set grafana.enabled=true \
  --wait --timeout 10m

# وسم namespace المراقبة حتى تسمح له NetworkPolicy بجمع المقاييس
kubectl label namespace monitoring kubernetes.io/metadata.name=monitoring --overwrite

echo ""
echo "==> Cloud Logging"
# وكيل السجلات جزء من العنقود المُدار: كل ما يُكتب على stdout يصل
# Cloud Logging بلا DaemonSet نصونه بأنفسنا.
gcloud container clusters describe "$CLUSTER" \
  --region "$REGION" --project "$PROJECT" \
  --format 'value(loggingConfig.componentConfig.enableComponents)'

echo ""
echo "=============================================="
echo " مكوّنات العنقود جاهزة."
echo ""
echo " الخطوة التالية:"
echo "   1) حدّث القيم النائبة (REPLACE_WITH_*) في infra/k8s/base/"
echo "      من مخرجات Terraform:  terraform -chdir=infra/terraform output"
echo "   2) انشر:  kubectl apply -k infra/k8s/overlays/\${ENV}"
echo "=============================================="
