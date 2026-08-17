#!/usr/bin/env bash
# ============================================================================
#  اختبار لوحة التحكم: الصلاحيات + CRUD كامل للمنتجات + المخزون + الطلبات.
#  يمر بالكامل عبر الـ api-gateway تمامًا كما تفعل الواجهة.
# ============================================================================
set -uo pipefail

GW="${GATEWAY_URL:-http://localhost:8080}"
SKU="N-ADMIN-TEST-$$"
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

login() {
  curl -s -X POST "${GW}/api/v1/auth/login" -H 'content-type: application/json' \
    -d "{\"email\":\"$1\",\"password\":\"$2\"}" \
    | sed -n 's/.*"accessToken":"\([^"]*\)".*/\1/p'
}

echo "=============================================="
echo " admin dashboard test — ${GW}"
echo "=============================================="

# ------------------------------------------------------------ 1. صلاحيات

echo ""
echo "1) access control"

ADMIN=$(login "admin@topchoice.local" "Admin@123")
CUSTOMER=$(login "demo@topchoice.local" "Passw0rd!")

if [ -z "$ADMIN" ]; then
  red "  FAIL  admin login failed"
  exit 1
fi
green "  PASS  admin login"
PASS=$((PASS + 1))

auth() { curl -s -o /dev/null -w '%{http_code}' -H "authorization: Bearer ${ADMIN}" "$@"; }

check "anonymous rejected" \
  "$(curl -s -o /dev/null -w '%{http_code}' "${GW}/api/v1/admin/products")" 401
check "customer forbidden" \
  "$(curl -s -o /dev/null -w '%{http_code}' -H "authorization: Bearer ${CUSTOMER}" \
     "${GW}/api/v1/admin/products")" 403
check "admin allowed" "$(auth "${GW}/api/v1/admin/products")" 200

# الحاجز الأول عند الحافة: مسارات الخدمات الداخلية غير قابلة للوصول مباشرةً
check "raw service admin path blocked" \
  "$(curl -s -o /dev/null -w '%{http_code}' -H "authorization: Bearer ${ADMIN}" \
     "${GW}/api/v1/products/admin")" 404

# ------------------------------------------------------------ 2. dashboard

echo ""
echo "2) dashboard"
DASH=$(curl -s -H "authorization: Bearer ${ADMIN}" "${GW}/api/v1/admin/dashboard")
for key in catalog orders inventory; do
  if printf '%s' "$DASH" | grep -q "\"${key}\":{"; then
    green "  PASS  ${key} stats present"
    PASS=$((PASS + 1))
  else
    red "  FAIL  ${key} stats missing"
    FAIL=$((FAIL + 1))
  fi
done

# ------------------------------------------------------- 3. CRUD المنتجات

echo ""
echo "3) product CRUD"

check "CREATE" "$(auth -X PUT "${GW}/api/v1/admin/products" \
  -H 'content-type: application/json' -d "{
    \"sku\": \"${SKU}\", \"slug\": \"$(echo "$SKU" | tr 'A-Z' 'a-z')\",
    \"title\": { \"ar\": \"منتج اختبار\", \"en\": \"Test Product\" },
    \"description\": { \"ar\": \"وصف\", \"en\": \"desc\" },
    \"brandId\": \"test\", \"brandName\": \"TestBrand\",
    \"categoryPath\": [\"electronics\", \"mobiles\"],
    \"currency\": \"EGP\", \"priceMinor\": 125050, \"wasMinor\": 180000,
    \"images\": [\"https://example.com/a.jpg\"],
    \"attributes\": { \"color\": \"Black\" }, \"tags\": [\"express\"],
    \"sellerId\": \"topchoice-retail\", \"status\": \"ACTIVE\"
  }")" 200

READ=$(curl -s -H "authorization: Bearer ${ADMIN}" \
  "${GW}/api/v1/admin/products/${SKU}")
check "READ price is exact minor units" \
  "$(printf '%s' "$READ" | sed -n 's/.*"priceMinor":\([0-9]*\).*/\1/p')" "125050"

check "stock upsert" "$(auth -X PUT "${GW}/api/v1/admin/inventory/stock" \
  -H 'content-type: application/json' \
  -d "{\"sku\":\"${SKU}\",\"warehouseId\":\"DXB-1\",\"onHand\":42}")" 200

STOCK=$(curl -s -H "authorization: Bearer ${ADMIN}" \
  "${GW}/api/v1/admin/inventory/stock?search=${SKU}")
check "stock reads back" \
  "$(printf '%s' "$STOCK" | sed -n 's/.*"available":\([0-9]*\).*/\1/p')" "42"

# منتج جديد نشط يجب أن يظهر في المتجر العام فورًا
check "visible in storefront" "$(curl -s -o /dev/null -w '%{http_code}' \
  "${GW}/api/v1/products/${SKU}")" 200

check "UPDATE price" "$(auth -X PATCH "${GW}/api/v1/admin/products/${SKU}/price" \
  -H 'content-type: application/json' -d '{"priceMinor":99900,"wasMinor":150000}')" 200

check "UPDATE status -> INACTIVE" \
  "$(auth -X PATCH "${GW}/api/v1/admin/products/${SKU}/status" \
     -H 'content-type: application/json' -d '{"status":"INACTIVE"}')" 200

# إخفاء المنتج يجب أن يزيله من المتجر مباشرةً
check "hidden from storefront" "$(curl -s -o /dev/null -w '%{http_code}' \
  "${GW}/api/v1/products/${SKU}")" 404

check "still visible to admin" "$(auth "${GW}/api/v1/admin/products/${SKU}")" 200

check "search finds it" \
  "$(curl -s -H "authorization: Bearer ${ADMIN}" \
     "${GW}/api/v1/admin/products?search=${SKU}" \
     | sed -n 's/.*"totalItems":\([0-9]*\).*/\1/p')" "1"

check "DELETE (archive)" "$(auth -X DELETE "${GW}/api/v1/admin/products/${SKU}")" 204

check "archived status persisted" \
  "$(curl -s -H "authorization: Bearer ${ADMIN}" "${GW}/api/v1/admin/products/${SKU}" \
     | sed -n 's/.*"status":"\([A-Z]*\)".*/\1/p')" "ARCHIVED"

# --------------------------------------------------- 4. حماية المخزون المحجوز

echo ""
echo "4) inventory guards"
check "negative stock rejected" "$(auth -X PUT "${GW}/api/v1/admin/inventory/stock" \
  -H 'content-type: application/json' \
  -d "{\"sku\":\"${SKU}\",\"warehouseId\":\"DXB-1\",\"onHand\":-5}")" 400

check "low-stock filter" "$(auth "${GW}/api/v1/admin/inventory/stock?lowStockOnly=true")" 200

# ------------------------------------------------------------- 5. الطلبات

echo ""
echo "5) orders"
check "list all orders" "$(auth "${GW}/api/v1/admin/orders")" 200
check "filter by status" "$(auth "${GW}/api/v1/admin/orders?status=CONFIRMED")" 200
check "invalid status rejected" "$(auth "${GW}/api/v1/admin/orders?status=NOPE")" 400

ORDER_ID=$(curl -s -H "authorization: Bearer ${ADMIN}" \
  "${GW}/api/v1/admin/orders?status=CONFIRMED&size=1" \
  | sed -n 's/.*"id":"\([^"]*\)".*/\1/p')

if [ -n "$ORDER_ID" ]; then
  check "order detail" "$(auth "${GW}/api/v1/admin/orders/${ORDER_ID}")" 200

  # آلة الحالة تُطبَّق على المشرف أيضًا: لا قفز من CONFIRMED إلى DELIVERED
  check "illegal transition rejected" \
    "$(auth -X PUT "${GW}/api/v1/admin/orders/${ORDER_ID}/status" \
       -H 'content-type: application/json' -d '{"status":"DELIVERED"}')" 409

  check "legal transition accepted" \
    "$(auth -X PUT "${GW}/api/v1/admin/orders/${ORDER_ID}/status" \
       -H 'content-type: application/json' -d '{"status":"PROCESSING"}')" 200
else
  echo "  (تخطّي اختبارات الانتقالات — لا يوجد طلب مؤكَّد)"
fi

# ------------------------------------------------------------------ summary

echo ""
echo "=============================================="
echo " passed: ${PASS}   failed: ${FAIL}"
echo "=============================================="
[ "$FAIL" -eq 0 ]
