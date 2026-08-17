#!/usr/bin/env bash
# ============================================================================
#  بناء كل الصور ورفعها إلى ECR.
#
#    ./scripts/push-images.sh <registry> [tag]
#
#  مثال:
#    ./scripts/push-images.sh 123456789012.dkr.ecr.me-south-1.amazonaws.com v1.0.0
# ============================================================================
set -euo pipefail

cd "$(dirname "$0")/.."

REGISTRY="${1:-${ECR_REGISTRY:-}}"
TAG="${2:-${TAG:-latest}}"
REGION="${AWS_REGION:-me-south-1}"
# عُقد العنقود Graviton (arm64)؛ بناء amd64 سيفشل عند التشغيل
PLATFORM="${PLATFORM:-linux/arm64}"

if [ -z "$REGISTRY" ]; then
  echo "usage: $0 <ecr-registry> [tag]" >&2
  echo "   or: ECR_REGISTRY=... $0" >&2
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

echo "==> logging in to ${REGISTRY}"
aws ecr get-login-password --region "$REGION" \
  | docker login --username AWS --password-stdin "$REGISTRY"

echo "==> ensuring buildx builder"
docker buildx inspect topchoice-builder >/dev/null 2>&1 \
  || docker buildx create --name topchoice-builder --use --bootstrap
docker buildx use topchoice-builder

FAILED=()

for entry in "${SERVICES[@]}"; do
  name="${entry%%:*}"
  context="${entry##*:}"
  image="${REGISTRY}/topchoice/${name}:${TAG}"

  echo ""
  echo "==> building ${name} (${PLATFORM})"

  if docker buildx build \
      --platform "$PLATFORM" \
      --tag "$image" \
      --cache-from "type=registry,ref=${REGISTRY}/topchoice/${name}:buildcache" \
      --cache-to "type=registry,ref=${REGISTRY}/topchoice/${name}:buildcache,mode=max" \
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
echo "    kustomize edit set image topchoice/\$s=${REGISTRY}/topchoice/\$s:${TAG}"
echo "  done"
echo "  kubectl apply -k ."
