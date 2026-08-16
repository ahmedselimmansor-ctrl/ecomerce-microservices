#!/usr/bin/env bash
# ============================================================================
#  تشغيل اختبارات كل الخدمات محليًا داخل حاويات — بلا حاجة لتسطيب
#  Java أو Maven أو Python على جهازك.
# ============================================================================
set -uo pipefail

cd "$(dirname "$0")/.."

PASS=0
FAIL=0
FAILED_SERVICES=()

run() {
  local name="$1"
  shift
  echo ""
  echo "──────────────────────────────────────────────"
  echo "  ${name}"
  echo "──────────────────────────────────────────────"
  if "$@"; then
    PASS=$((PASS + 1))
  else
    FAIL=$((FAIL + 1))
    FAILED_SERVICES+=("${name}")
  fi
}

# ---------------------------------------------------------------------- java

for svc in identity-service catalog-service order-service payment-service inventory-service; do
  run "java · ${svc}" docker run --rm \
    -v "$PWD/services/${svc}:/app" \
    -v noon-maven-cache:/root/.m2 \
    -w /app \
    maven:3.9-eclipse-temurin-21 \
    mvn -B -q test
done

# ---------------------------------------------------------------------- node

for svc in api-gateway cart-service notification-service; do
  run "node · ${svc}" docker run --rm \
    -v "$PWD/services/${svc}:/app" \
    -w /app \
    node:22-alpine \
    sh -c "npm install --no-audit --no-fund --silent && npm run typecheck"
done

# -------------------------------------------------------------------- python

for svc in search-service recommendation-service; do
  run "python · ${svc}" docker run --rm \
    -v "$PWD/services/${svc}:/app" \
    -w /app \
    python:3.12-slim \
    sh -c "pip install -q -r requirements.txt ruff && ruff check app/ && python -c 'import app.main'"
done

# ------------------------------------------------------------------ frontend

run "frontend · web" docker run --rm \
  -v "$PWD/frontend/web:/app" \
  -w /app \
  node:22-alpine \
  sh -c "npm install --no-audit --no-fund --silent && npm run typecheck"

# ------------------------------------------------------------------- infra

if command -v kubectl >/dev/null 2>&1; then
  run "k8s · kustomize dev"  kubectl kustomize infra/k8s/overlays/dev
  run "k8s · kustomize prod" kubectl kustomize infra/k8s/overlays/prod
fi

run "api · admin dashboard" ./scripts/admin-test.sh

run "terraform · fmt" docker run --rm -v "$PWD/infra/terraform:/wd" -w /wd \
  hashicorp/terraform:1.9 fmt -check -recursive

# ------------------------------------------------------------------ summary

echo ""
echo "=============================================="
echo " passed: ${PASS}   failed: ${FAIL}"
if [ "${#FAILED_SERVICES[@]}" -gt 0 ]; then
  echo " failing:"
  printf '   - %s\n' "${FAILED_SERVICES[@]}"
fi
echo "=============================================="

[ "$FAIL" -eq 0 ]
