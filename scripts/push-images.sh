#!/usr/bin/env bash
# ============================================================================
#  بناء كل الصور ورفعها إلى Artifact Registry.
#
#    ./scripts/push-images.sh <registry> [tag]
#
#  مثال:
#    ./scripts/push-images.sh me-central1-docker.pkg.dev/topchoice-prod/topchoice v1.0.0
#
#  المستودع الإقليمي (me-central1) لا يقلّد أو ينسخ الصور بين المناطق: البناء
#  والسحب يحدثان في المنطقة نفسها التي يعمل فيها العنقود، فلا خروج بيانات
#  ولا زمن عبور بين القارات عند كل rollout.
# ============================================================================
set -euo pipefail

cd "$(dirname "$0")/.."

REGION="${GCP_REGION:-me-central1}"
REPOSITORY="${AR_REPOSITORY:-topchoice}"
TAG="${2:-${TAG:-latest}}"
# عُقد GKE في me-central1 من عائلات x86؛ صورة arm64 لن تجد عقدة تقبلها
PLATFORM="${PLATFORM:-linux/amd64}"

REGISTRY="${1:-${AR_REGISTRY:-}}"

# اشتقاق العنوان من إعداد gcloud حين لا يُمرَّر: أقصر طريق صحيح، وأقل فرصة
# لرفع صور إلى مشروع خاطئ بسبب متغيّر بيئة قديم في الصدفة.
if [ -z "$REGISTRY" ]; then
  PROJECT="${GOOGLE_CLOUD_PROJECT:-$(gcloud config get-value project 2>/dev/null || true)}"
  if [ -n "$PROJECT" ] && [ "$PROJECT" != "(unset)" ]; then
    REGISTRY="${REGION}-docker.pkg.dev/${PROJECT}/${REPOSITORY}"
  fi
fi

if [ -z "$REGISTRY" ]; then
  echo "usage: $0 <region-docker.pkg.dev/PROJECT_ID/REPO> [tag]" >&2
  echo "   or: AR_REGISTRY=... $0" >&2
  echo "   or: gcloud config set project PROJECT_ID" >&2
  exit 1
fi

SERVICES=(
  "api-gateway:services/api-gateway"
  "identity-service:services/identity-service"
  "catalog-service:services/catalog-service"
  "order-service:services/order-service"
  "payment-service:services/payment-service"
  "inventory-service:services/inventory-service"
  "cart-service:services/cart-service"
  "search-service:services/search-service"
  "recommendation-service:services/recommendation-service"
  "notification-service:services/notification-service"
  "web:frontend/web"
)

# لا `docker login` بكلمة مرور: gcloud يزرع مساعد اعتماد يجدّد الـ token
# تلقائيًا، فلا ينتهي الرفع في منتصفه بعد ساعة.
echo "==> configuring docker for ${REGISTRY%%/*}"
gcloud auth configure-docker "${REGISTRY%%/*}" --quiet

echo "==> ensuring buildx builder"
docker buildx inspect topchoice-builder >/dev/null 2>&1 \
  || docker buildx create --name topchoice-builder --use --bootstrap
docker buildx use topchoice-builder

FAILED=()

for entry in "${SERVICES[@]}"; do
  name="${entry%%:*}"
  context="${entry##*:}"
  image="${REGISTRY}/${name}:${TAG}"

  echo ""
  echo "==> building ${name} (${PLATFORM})"

  if docker buildx build \
      --platform "$PLATFORM" \
      --tag "$image" \
      --cache-from "type=registry,ref=${REGISTRY}/${name}:buildcache" \
      --cache-to "type=registry,ref=${REGISTRY}/${name}:buildcache,mode=max" \
      --provenance=false \
      --push \
      "$context"; then
    echo "    pushed ${image}"
  else
    echo "    FAILED ${name}" >&2
    FAILED+=("$name")
  fi
done

echo ""
if [ "${#FAILED[@]}" -gt 0 ]; then
  echo "failed to build: ${FAILED[*]}" >&2
  exit 1
fi

echo "all images pushed with tag ${TAG}"
echo ""
echo "next:"
echo "  cd infra/k8s/overlays/prod"
echo "  for s in api-gateway identity-service catalog-service order-service payment-service \\"
echo "           inventory-service cart-service search-service recommendation-service \\"
echo "           notification-service web; do"
echo "    kustomize edit set image topchoice/\$s=${REGISTRY}/\$s:${TAG}"
echo "  done"
echo "  kubectl apply -k ."
