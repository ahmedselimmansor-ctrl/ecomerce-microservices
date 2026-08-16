#!/usr/bin/env bash
# ============================================================================
#  تثبيت مكوّنات العنقود بعد إنشاء EKS بـ Terraform.
#
#  هذه المكوّنات لا تُدار في Terraform عمدًا: دورة حياتها تتبع العنقود
#  لا البنية التحتية، وترقيتها يجب أن تكون منفصلة عن تغييرات الشبكة
#  وقواعد البيانات.
# ============================================================================
set -euo pipefail

CLUSTER="${CLUSTER:-noon-dev}"
REGION="${AWS_REGION:-me-south-1}"
TF_DIR="$(dirname "$0")/../infra/terraform"

need() { command -v "$1" >/dev/null 2>&1 || { echo "missing: $1" >&2; exit 1; }; }
need aws
need kubectl
need helm

echo "==> connecting to ${CLUSTER}"
aws eks update-kubeconfig --name "$CLUSTER" --region "$REGION"
kubectl cluster-info

tf_out() { terraform -chdir="$TF_DIR" output -raw "$1" 2>/dev/null || echo ""; }

ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
VPC_ID="$(aws eks describe-cluster --name "$CLUSTER" --region "$REGION" \
  --query 'cluster.resourcesVpcConfig.vpcId' --output text)"

# ---------------------------------------------- AWS Load Balancer Controller

echo ""
echo "==> AWS Load Balancer Controller"
helm repo add eks https://aws.github.io/eks-charts >/dev/null 2>&1 || true
helm repo update >/dev/null

LBC_ROLE="$(tf_out lb_controller_role_arn)"
[ -n "$LBC_ROLE" ] || LBC_ROLE="arn:aws:iam::${ACCOUNT_ID}:role/${CLUSTER}-aws-lbc"

helm upgrade --install aws-load-balancer-controller eks/aws-load-balancer-controller \
  --namespace kube-system \
  --set clusterName="$CLUSTER" \
  --set region="$REGION" \
  --set vpcId="$VPC_ID" \
  --set serviceAccount.create=true \
  --set serviceAccount.name=aws-load-balancer-controller \
  --set "serviceAccount.annotations.eks\.amazonaws\.com/role-arn=${LBC_ROLE}" \
  --set replicaCount=2 \
  --wait --timeout 5m

# -------------------------------------------------- External Secrets Operator

echo ""
echo "==> External Secrets Operator"
helm repo add external-secrets https://charts.external-secrets.io >/dev/null 2>&1 || true
helm repo update >/dev/null

helm upgrade --install external-secrets external-secrets/external-secrets \
  --namespace external-secrets --create-namespace \
  --set installCRDs=true \
  --set webhook.replicaCount=2 \
  --wait --timeout 5m

# ------------------------------------------------------------------- metrics

echo ""
echo "==> Metrics Server (مطلوب لـ HPA)"
helm repo add metrics-server https://kubernetes-sigs.github.io/metrics-server/ >/dev/null 2>&1 || true
helm upgrade --install metrics-server metrics-server/metrics-server \
  --namespace kube-system \
  --set 'args={--kubelet-insecure-tls}' \
  --wait --timeout 3m

# ---------------------------------------------------------------------- KEDA

echo ""
echo "==> KEDA (التوسّع بعمق طابور Kafka)"
helm repo add kedacore https://kedacore.github.io/charts >/dev/null 2>&1 || true
helm repo update >/dev/null
helm upgrade --install keda kedacore/keda \
  --namespace keda --create-namespace \
  --wait --timeout 5m

# ----------------------------------------------------------------- Karpenter

echo ""
echo "==> Karpenter (توفير العُقد تلقائيًا)"
echo "    ملاحظة: يحتاج إعداد IAM إضافيًا — راجع docs/06-deployment-eks.md"

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
echo "==> Fluent Bit → CloudWatch Logs"
helm repo add aws-observability https://aws-observability.github.io/helm-charts >/dev/null 2>&1 || true
helm upgrade --install aws-for-fluent-bit aws-observability/aws-for-fluent-bit \
  --namespace kube-system \
  --set cloudWatchLogs.region="$REGION" \
  --set cloudWatchLogs.logGroupName="/aws/eks/${CLUSTER}/application" \
  --wait --timeout 5m || echo "    (تخطّي: يحتاج صلاحيات CloudWatch على دور العقدة)"

echo ""
echo "=============================================="
echo " مكوّنات العنقود جاهزة."
echo ""
echo " الخطوة التالية:"
echo "   1) حدّث القيم النائبة (REPLACE_WITH_*) في infra/k8s/base/"
echo "      من مخرجات Terraform:  terraform -chdir=infra/terraform output"
echo "   2) انشر:  kubectl apply -k infra/k8s/overlays/\${ENV}"
echo "=============================================="
