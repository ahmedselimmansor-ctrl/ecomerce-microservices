#!/usr/bin/env bash
# ============================================================================
#  اختبار دخان شامل يمرّ بالمسار الكامل عبر الـ api-gateway:
#  تسجيل دخول ← تصفّح ← بحث ← سلة ← إنشاء طلب ← متابعة الـ Saga حتى تستقر.
# ============================================================================
set -uo pipefail

GW="${GATEWAY_URL:-http://localhost:8080}"
PASS=0
FAIL=0

green() { printf '\033[32m%s\033[0m\n' "$1"; }
red()   { printf '\033[31m%s\033[0m\n' "$1"; }

check() {
  local name="$1" actual="$2" expected="$3"
  if [ "$actual" = "$expected" ]; then
    green "  PASS  ${name}"
    PASS=$((PASS + 1))
  else
    red   "  FAIL  ${name} (got ${actual}, want ${expected})"
    FAIL=$((FAIL + 1))
  fi
}

status() { curl -s -o /dev/null -w '%{http_code}' "$@"; }

echo "=============================================="
echo " noon smoke test — ${GW}"
echo "=============================================="

# ---------------------------------------------------------------- 1. health
echo ""
echo "1) health"
check "gateway live"     "$(status "${GW}/health/live")" 200
check "gateway ready"    "$(status "${GW}/health/ready")" 200

# --------------------------------------------------------------- 2. catalog
echo ""
echo "2) catalog & discovery"
check "home aggregate"   "$(status "${GW}/api/v1/bff/home")" 200
check "product list"     "$(status "${GW}/api/v1/products?size=5")" 200
check "categories"       "$(status "${GW}/api/v1/categories")" 200
check "product detail"   "$(status "${GW}/api/v1/products/N-APL-IP15-128-BLK")" 200
check "pdp aggregate"    "$(status "${GW}/api/v1/bff/pdp/N-APL-IP15-128-BLK")" 200
check "unknown product"  "$(status "${GW}/api/v1/products/DOES-NOT-EXIST")" 404
# الاستعلام مُرمَّز بـ percent-encoding: curl لا يرمّز محارف UTF-8 في الـ URL
# تلقائيًا فتصل مشوّهة ويردّ الخادم 400. (%D8%A7%D9%8A%D9%81%D9%88%D9%86 = "ايفون")
check "search (arabic)"  "$(status "${GW}/api/v1/search?q=%D8%A7%D9%8A%D9%81%D9%88%D9%86")" 200
check "search (english)" "$(status "${GW}/api/v1/search?q=iphone")" 200
check "autocomplete"     "$(status "${GW}/api/v1/search/suggest?q=ip&limit=5")" 200
check "recommendations"  "$(status "${GW}/api/v1/recommendations/trending?limit=5")" 200

# ------------------------------------------------------------ 3. inventory
echo ""
echo "3) inventory"
check "availability"     "$(status "${GW}/api/v1/inventory/N-APL-IP15-128-BLK")" 200

# ----------------------------------------------------------------- 4. auth
echo ""
echo "4) authentication"
LOGIN=$(curl -s -X POST "${GW}/api/v1/auth/login" \
  -H 'content-type: application/json' \
  -d '{"email":"demo@noon.local","password":"Passw0rd!"}')

TOKEN=$(printf '%s' "$LOGIN" | sed -n 's/.*"accessToken":"\([^"]*\)".*/\1/p')
if [ -n "$TOKEN" ]; then
  green "  PASS  login returns access token"
  PASS=$((PASS + 1))
else
  red   "  FAIL  login  -> $LOGIN"
  FAIL=$((FAIL + 1))
  echo ""
  echo "cannot continue without a token"
  exit 1
fi

check "bad password rejected" \
  "$(status -X POST "${GW}/api/v1/auth/login" -H 'content-type: application/json' \
     -d '{"email":"demo@noon.local","password":"wrong-password"}')" 401

check "profile with token" \
  "$(status "${GW}/api/v1/users/me" -H "authorization: Bearer ${TOKEN}")" 200
check "profile without token" \
  "$(status "${GW}/api/v1/users/me")" 401

# ----------------------------------------------------------------- 5. cart
echo ""
echo "5) cart"
GUEST=$(curl -s -X POST "${GW}/api/v1/cart/guest-token" \
  | sed -n 's/.*"guestToken":"\([^"]*\)".*/\1/p')

check "add to cart" \
  "$(status -X POST "${GW}/api/v1/cart/items" \
     -H 'content-type: application/json' -H "x-guest-token: ${GUEST}" \
     -d '{"sku":"N-APL-IP15-128-BLK","quantity":2}')" 201

CART=$(curl -s "${GW}/api/v1/bff/cart" -H "x-guest-token: ${GUEST}")
SUBTOTAL=$(printf '%s' "$CART" | sed -n 's/.*"subtotalMinor":\([0-9]*\).*/\1/p')
# سعر الوحدة × 2. المصدر هو الكتالوج لا العميل — نقرأه ونتحقق من الضرب
UNIT=$(curl -s "${GW}/api/v1/products/N-APL-IP15-128-BLK" \
  | sed -n 's/.*"priceMinor":\([0-9]*\).*/\1/p')
check "cart subtotal computed server-side" "${SUBTOTAL}" "$((UNIT * 2))"

# --------------------------------------------------------------- 6. ordering
echo ""
echo "6) order saga"
IDEM=$(cat /proc/sys/kernel/random/uuid 2>/dev/null || echo "smoke-$$-$(date +%s)")

ORDER=$(curl -s -X POST "${GW}/api/v1/orders" \
  -H 'content-type: application/json' \
  -H "authorization: Bearer ${TOKEN}" \
  -H "idempotency-key: ${IDEM}" \
  -d '{
    "items": [{ "sku": "N-APL-IP15-128-BLK", "quantity": 1 }],
    "shippingAddress": {
      "fullName": "Demo Customer", "phone": "+971500000001",
      "line1": "Sheikh Zayed Road, Tower 1", "city": "Dubai", "country": "AE"
    },
    "paymentMethod": "CARD"
  }')

ORDER_ID=$(printf '%s' "$ORDER" | sed -n 's/.*"id":"\([^"]*\)".*/\1/p')
ORDER_TOTAL=$(printf '%s' "$ORDER" | sed -n 's/.*"totalMinor":\([0-9]*\).*/\1/p')

if [ -n "$ORDER_ID" ]; then
  green "  PASS  order created (${ORDER_ID})"
  PASS=$((PASS + 1))
else
  red   "  FAIL  order creation -> $ORDER"
  FAIL=$((FAIL + 1))
  exit 1
fi

# الإجمالي = سعر الكتالوج + 5% ضريبة، والشحن مجاني فوق الحد.
# نحسبه من السعر الحيّ لا من رقم ثابت، حتى لا يكسر الاختبارَ تغييرُ تسعير.
EXPECTED_TOTAL=$(( UNIT + (UNIT * 5 + 50) / 100 ))
check "server-side pricing (catalog price + 5% VAT)" "${ORDER_TOTAL}" "${EXPECTED_TOTAL}"

# نفس المفتاح يجب أن يعيد نفس الطلب لا طلبًا جديدًا
REPLAY_ID=$(curl -s -X POST "${GW}/api/v1/orders" \
  -H 'content-type: application/json' \
  -H "authorization: Bearer ${TOKEN}" \
  -H "idempotency-key: ${IDEM}" \
  -d '{
    "items": [{ "sku": "N-APL-IP15-128-BLK", "quantity": 1 }],
    "shippingAddress": {
      "fullName": "Demo Customer", "phone": "+971500000001",
      "line1": "Sheikh Zayed Road, Tower 1", "city": "Dubai", "country": "AE"
    },
    "paymentMethod": "CARD"
  }' | sed -n 's/.*"id":"\([^"]*\)".*/\1/p')

check "idempotency key prevents duplicate order" "${REPLAY_ID}" "${ORDER_ID}"

# متابعة الـ Saga حتى تستقر الحالة
echo ""
echo "  waiting for the saga to settle…"
FINAL=""
for i in $(seq 1 30); do
  ST=$(curl -s "${GW}/api/v1/orders/${ORDER_ID}" -H "authorization: Bearer ${TOKEN}" \
       | sed -n 's/.*"status":"\([^"]*\)".*/\1/p')
  echo "    t+${i}s  status=${ST}"
  case "$ST" in
    CONFIRMED|CANCELLED|DELIVERED|REFUNDED) FINAL="$ST"; break ;;
  esac
  sleep 1
done

if [ -n "$FINAL" ]; then
  # كلا النهايتين صحيحة: البوابة الوهمية ترفض ~10% عمدًا لاختبار التعويض
  green "  PASS  saga settled at ${FINAL}"
  PASS=$((PASS + 1))
else
  red   "  FAIL  saga did not settle within 30s (last=${ST})"
  FAIL=$((FAIL + 1))
fi

check "order list" \
  "$(status "${GW}/api/v1/orders?page=0&size=10" -H "authorization: Bearer ${TOKEN}")" 200

# ------------------------------------------------------------- 7. security
echo ""
echo "7) security boundaries"
check "internal path blocked at edge" \
  "$(status "${GW}/api/v1/orders/internal/${ORDER_ID}/status" -H "authorization: Bearer ${TOKEN}")" 404
check "admin path blocked at edge" \
  "$(status -X PUT "${GW}/api/v1/products/admin" -H 'content-type: application/json' -d '{}')" 404
check "actuator not exposed" \
  "$(status "${GW}/api/v1/products/actuator/health")" 404

# ------------------------------------------------------------------ summary
echo ""
echo "=============================================="
echo " passed: ${PASS}   failed: ${FAIL}"
echo "=============================================="
[ "$FAIL" -eq 0 ] || exit 1
