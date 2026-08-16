#!/usr/bin/env bash
# ============================================================================
#  بذر بيانات تجريبية: الأقسام + المنتجات.
#  المخزون يُبذر تلقائيًا عبر Flyway (V2__seed_stock.sql).
#  المستخدم التجريبي كذلك (V2__seed_admin.sql): demo@noon.local / Passw0rd!
# ============================================================================
set -euo pipefail

CATALOG_URL="${CATALOG_URL:-http://localhost:8082}"
GATEWAY_URL="${GATEWAY_URL:-http://localhost:8080}"
CDN="${CDN_BASE:-https://images.unsplash.com}"

echo "==> waiting for catalog-service at ${CATALOG_URL}"
for i in $(seq 1 60); do
  if curl -fsS "${CATALOG_URL}/actuator/health/readiness" >/dev/null 2>&1; then
    echo "    ready"
    break
  fi
  [ "$i" -eq 60 ] && { echo "catalog-service never became ready" >&2; exit 1; }
  sleep 2
done

# ---------------------------------------------------------------- categories

echo "==> seeding categories"

# ملف البيئة مطلوب: ملف الـ compose يقع في deploy/ بينما .env في جذر المستودع
COMPOSE=(docker compose -f deploy/docker-compose.yml --env-file .env)

mongosh_cmd() {
  "${COMPOSE[@]}" exec -T mongo mongosh \
    --quiet --username "${MONGO_USER:-noon}" --password "${MONGO_PASS:-noon_local_pw}" \
    --authenticationDatabase admin noon_catalog --eval "$1"
}

mongosh_cmd '
const categories = [
  { slug: "electronics", name: { ar: "إلكترونيات", en: "Electronics" }, parentSlug: null, sortOrder: 1, active: true, productCount: 0 },
  { slug: "mobiles",     name: { ar: "هواتف",      en: "Mobiles" },     parentSlug: "electronics", sortOrder: 1, active: true, productCount: 0 },
  { slug: "laptops",     name: { ar: "لابتوبات",   en: "Laptops" },     parentSlug: "electronics", sortOrder: 2, active: true, productCount: 0 },
  { slug: "audio",       name: { ar: "صوتيات",     en: "Audio" },       parentSlug: "electronics", sortOrder: 3, active: true, productCount: 0 },
  { slug: "tv",          name: { ar: "تلفزيونات",  en: "TVs" },         parentSlug: "electronics", sortOrder: 4, active: true, productCount: 0 },
  { slug: "gaming",      name: { ar: "ألعاب",      en: "Gaming" },      parentSlug: "electronics", sortOrder: 5, active: true, productCount: 0 },
  { slug: "fashion",     name: { ar: "أزياء",      en: "Fashion" },     parentSlug: null, sortOrder: 2, active: true, productCount: 0 },
  { slug: "shoes",       name: { ar: "أحذية",      en: "Shoes" },       parentSlug: "fashion", sortOrder: 1, active: true, productCount: 0 },
  { slug: "beauty",      name: { ar: "الجمال",     en: "Beauty" },      parentSlug: null, sortOrder: 3, active: true, productCount: 0 },
  { slug: "home",        name: { ar: "المنزل",     en: "Home" },        parentSlug: null, sortOrder: 4, active: true, productCount: 0 },
  { slug: "appliances",  name: { ar: "أجهزة منزلية", en: "Appliances" }, parentSlug: "home", sortOrder: 1, active: true, productCount: 0 }
];
for (const c of categories) {
  db.categories.updateOne({ slug: c.slug }, { $set: c }, { upsert: true });
}
print("categories: " + db.categories.countDocuments());
'

# ------------------------------------------------------------------ products

echo "==> seeding products via catalog API"

upsert() {
  local payload="$1"
  local sku
  sku=$(printf '%s' "$payload" | sed -n 's/.*"sku": *"\([^"]*\)".*/\1/p' | head -1)
  local code
  code=$(curl -s -o /dev/null -w '%{http_code}' -X PUT "${CATALOG_URL}/api/v1/products/admin" \
    -H 'content-type: application/json' \
    -H "x-request-id: seed-$(date +%s)-${sku}" \
    -d "$payload")
  if [ "$code" = "200" ]; then
    echo "    ok   ${sku}"
  else
    echo "    FAIL ${sku} (HTTP ${code})" >&2
  fi
}

img() { echo "${CDN}/$1?auto=format&fit=crop&w=800&q=70"; }

upsert "$(cat <<JSON
{
  "sku": "N-APL-IP15-128-BLK", "slug": "apple-iphone-15-128gb-black",
  "title": { "ar": "ابل ايفون 15 - 128 جيجا - أسود", "en": "Apple iPhone 15 128GB Black" },
  "description": { "ar": "شاشة سوبر ريتينا XDR مقاس 6.1 بوصة، شريحة A16 Bionic، كاميرا 48 ميجابكسل.",
                   "en": "6.1-inch Super Retina XDR display, A16 Bionic chip, 48MP main camera." },
  "brandId": "apple", "brandName": "Apple",
  "categoryPath": ["electronics", "mobiles"],
  "currency": "EGP", "priceMinor": 3898700, "wasMinor": 4548700,
  "images": ["$(img photo-1592750475338-74b7b21085ab)"],
  "attributes": { "color": "Black", "storage": "128GB", "ram": "6GB", "screen": "6.1\"" },
  "tags": ["express", "bestseller"], "sellerId": "noon-retail", "status": "ACTIVE"
}
JSON
)"

upsert "$(cat <<JSON
{
  "sku": "N-APL-IP15-256-BLU", "slug": "apple-iphone-15-256gb-blue",
  "title": { "ar": "ابل ايفون 15 - 256 جيجا - أزرق", "en": "Apple iPhone 15 256GB Blue" },
  "description": { "ar": "سعة أكبر بنفس الأداء المميز.", "en": "More storage, same great performance." },
  "brandId": "apple", "brandName": "Apple",
  "categoryPath": ["electronics", "mobiles"],
  "currency": "EGP", "priceMinor": 4548700, "wasMinor": 4938700,
  "images": ["$(img photo-1695048133142-1a20484d2569)"],
  "attributes": { "color": "Blue", "storage": "256GB", "ram": "6GB" },
  "tags": ["express"], "sellerId": "noon-retail", "status": "ACTIVE"
}
JSON
)"

upsert "$(cat <<JSON
{
  "sku": "N-SAM-S24-256-GRY", "slug": "samsung-galaxy-s24-256gb-grey",
  "title": { "ar": "سامسونج جالكسي S24 - 256 جيجا", "en": "Samsung Galaxy S24 256GB" },
  "description": { "ar": "معالج Snapdragon 8 Gen 3 وذكاء اصطناعي مدمج.", "en": "Snapdragon 8 Gen 3 with built-in AI." },
  "brandId": "samsung", "brandName": "Samsung",
  "categoryPath": ["electronics", "mobiles"],
  "currency": "EGP", "priceMinor": 3638700, "wasMinor": 4158700,
  "images": ["$(img photo-1610945265064-0e34e5519bbf)"],
  "attributes": { "color": "Onyx Grey", "storage": "256GB", "ram": "8GB" },
  "tags": ["express", "bestseller"], "sellerId": "noon-retail", "status": "ACTIVE"
}
JSON
)"

upsert "$(cat <<JSON
{
  "sku": "N-SAM-S24U-512-TTN", "slug": "samsung-galaxy-s24-ultra-512gb",
  "title": { "ar": "سامسونج جالكسي S24 الترا - 512 جيجا", "en": "Samsung Galaxy S24 Ultra 512GB" },
  "description": { "ar": "قلم S Pen وكاميرا 200 ميجابكسل.", "en": "S Pen included, 200MP camera." },
  "brandId": "samsung", "brandName": "Samsung",
  "categoryPath": ["electronics", "mobiles"],
  "currency": "EGP", "priceMinor": 6758700, "wasMinor": 7538700,
  "images": ["$(img photo-1580910051074-3eb694886505)"],
  "attributes": { "color": "Titanium", "storage": "512GB", "ram": "12GB" },
  "tags": ["bestseller"], "sellerId": "noon-retail", "status": "ACTIVE"
}
JSON
)"

upsert "$(cat <<JSON
{
  "sku": "N-APL-MBA-M3-256", "slug": "apple-macbook-air-m3-256gb",
  "title": { "ar": "ابل ماك بوك اير M3 - 256 جيجا", "en": "Apple MacBook Air M3 256GB" },
  "description": { "ar": "شريحة M3، شاشة 13.6 بوصة، بطارية حتى 18 ساعة.", "en": "M3 chip, 13.6-inch display, up to 18h battery." },
  "brandId": "apple", "brandName": "Apple",
  "categoryPath": ["electronics", "laptops"],
  "currency": "EGP", "priceMinor": 5848700, "wasMinor": 6498700,
  "images": ["$(img photo-1517336714731-489689fd1ca8)"],
  "attributes": { "color": "Midnight", "storage": "256GB", "ram": "8GB", "screen": "13.6\"" },
  "tags": ["bestseller"], "sellerId": "noon-retail", "status": "ACTIVE"
}
JSON
)"

upsert "$(cat <<JSON
{
  "sku": "N-SON-WH1000XM5-BLK", "slug": "sony-wh-1000xm5-black",
  "title": { "ar": "سوني WH-1000XM5 سماعات لاسلكية", "en": "Sony WH-1000XM5 Wireless Headphones" },
  "description": { "ar": "أفضل عزل ضوضاء في فئتها، 30 ساعة تشغيل.", "en": "Best-in-class noise cancelling, 30h battery." },
  "brandId": "sony", "brandName": "Sony",
  "categoryPath": ["electronics", "audio"],
  "currency": "EGP", "priceMinor": 1688700, "wasMinor": 2078700,
  "images": ["$(img photo-1505740420928-5e560c06d30e)"],
  "attributes": { "color": "Black", "type": "Over-ear", "battery": "30h" },
  "tags": ["express", "bestseller"], "sellerId": "noon-retail", "status": "ACTIVE"
}
JSON
)"

upsert "$(cat <<JSON
{
  "sku": "N-APL-AIRPODS-PRO2", "slug": "apple-airpods-pro-2",
  "title": { "ar": "ابل ايربودز برو الجيل الثاني", "en": "Apple AirPods Pro 2nd Gen" },
  "description": { "ar": "عزل ضوضاء نشط وصوت مكاني.", "en": "Active noise cancellation and spatial audio." },
  "brandId": "apple", "brandName": "Apple",
  "categoryPath": ["electronics", "audio"],
  "currency": "EGP", "priceMinor": 1168700, "wasMinor": 1428700,
  "images": ["$(img photo-1600294037681-c80b4cb5b434)"],
  "attributes": { "color": "White", "type": "In-ear" },
  "tags": ["express", "bestseller"], "sellerId": "noon-retail", "status": "ACTIVE"
}
JSON
)"

upsert "$(cat <<JSON
{
  "sku": "N-LG-OLED55C4", "slug": "lg-oled55c4-4k-tv",
  "title": { "ar": "ال جي OLED 55 بوصة 4K", "en": "LG OLED55C4 4K Smart TV" },
  "description": { "ar": "شاشة OLED مع معالج α9 وتردد 144Hz.", "en": "OLED evo panel, α9 processor, 144Hz." },
  "brandId": "lg", "brandName": "LG",
  "categoryPath": ["electronics", "tv"],
  "currency": "EGP", "priceMinor": 7148700, "wasMinor": 9098700,
  "images": ["$(img photo-1593359677879-a4bb92f829d1)"],
  "attributes": { "size": "55\"", "resolution": "4K", "panel": "OLED" },
  "tags": [], "sellerId": "noon-retail", "status": "ACTIVE"
}
JSON
)"

upsert "$(cat <<JSON
{
  "sku": "N-PSN-PS5-SLIM-DE", "slug": "playstation-5-slim-digital",
  "title": { "ar": "سوني بلايستيشن 5 سليم - رقمي", "en": "Sony PlayStation 5 Slim Digital" },
  "description": { "ar": "أداء الجيل الجديد بحجم أصغر.", "en": "Next-gen performance in a smaller form." },
  "brandId": "sony", "brandName": "Sony",
  "categoryPath": ["electronics", "gaming"],
  "currency": "EGP", "priceMinor": 2468700, "wasMinor": 2728700,
  "images": ["$(img photo-1606813907291-d86efa9b94db)"],
  "attributes": { "edition": "Digital", "storage": "1TB" },
  "tags": ["bestseller"], "sellerId": "noon-retail", "status": "ACTIVE"
}
JSON
)"

upsert "$(cat <<JSON
{
  "sku": "N-XBX-SERIESX-1TB", "slug": "xbox-series-x-1tb",
  "title": { "ar": "مايكروسوفت اكس بوكس سيريس اكس", "en": "Microsoft Xbox Series X 1TB" },
  "description": { "ar": "أقوى جهاز ألعاب من مايكروسوفت.", "en": "The most powerful Xbox ever." },
  "brandId": "microsoft", "brandName": "Microsoft",
  "categoryPath": ["electronics", "gaming"],
  "currency": "EGP", "priceMinor": 2338700, "wasMinor": 2598700,
  "images": ["$(img photo-1621259182978-fbf93132d53d)"],
  "attributes": { "storage": "1TB", "resolution": "4K" },
  "tags": [], "sellerId": "noon-retail", "status": "ACTIVE"
}
JSON
)"

upsert "$(cat <<JSON
{
  "sku": "N-NIK-AIRMAX270-42", "slug": "nike-air-max-270-42",
  "title": { "ar": "نايك اير ماكس 270 - مقاس 42", "en": "Nike Air Max 270 Size 42" },
  "description": { "ar": "راحة طوال اليوم بوحدة هواء كبيرة.", "en": "All-day comfort with a large Air unit." },
  "brandId": "nike", "brandName": "Nike",
  "categoryPath": ["fashion", "shoes"],
  "currency": "EGP", "priceMinor": 648700, "wasMinor": 843700,
  "images": ["$(img photo-1542291026-7eec264c27ff)"],
  "attributes": { "size": "42", "color": "Black/White", "material": "Mesh" },
  "tags": ["express"], "sellerId": "noon-fashion", "status": "ACTIVE"
}
JSON
)"

upsert "$(cat <<JSON
{
  "sku": "N-ADI-ULTRA22-43", "slug": "adidas-ultraboost-22-43",
  "title": { "ar": "اديداس الترا بوست 22 - مقاس 43", "en": "Adidas Ultraboost 22 Size 43" },
  "description": { "ar": "نعل Boost لعودة طاقة أعلى.", "en": "Boost midsole for superior energy return." },
  "brandId": "adidas", "brandName": "Adidas",
  "categoryPath": ["fashion", "shoes"],
  "currency": "EGP", "priceMinor": 713700, "wasMinor": 908700,
  "images": ["$(img photo-1606107557195-0e29a4b5b4aa)"],
  "attributes": { "size": "43", "color": "Core Black" },
  "tags": ["express"], "sellerId": "noon-fashion", "status": "ACTIVE"
}
JSON
)"

upsert "$(cat <<JSON
{
  "sku": "N-LOR-REV-SERUM-30", "slug": "loreal-revitalift-serum-30ml",
  "title": { "ar": "لوريال ريفيتاليفت سيروم 30 مل", "en": "L'Oreal Revitalift Serum 30ml" },
  "description": { "ar": "سيروم بحمض الهيالورونيك النقي.", "en": "Pure hyaluronic acid serum." },
  "brandId": "loreal", "brandName": "L'Oreal",
  "categoryPath": ["beauty"],
  "currency": "EGP", "priceMinor": 128700, "wasMinor": 193700,
  "images": ["$(img photo-1620916566398-39f1143ab7be)"],
  "attributes": { "volume": "30ml", "skinType": "All" },
  "tags": ["express"], "sellerId": "noon-beauty", "status": "ACTIVE"
}
JSON
)"

upsert "$(cat <<JSON
{
  "sku": "N-DYS-V15-DETECT", "slug": "dyson-v15-detect",
  "title": { "ar": "دايسون V15 ديتكت مكنسة لاسلكية", "en": "Dyson V15 Detect Cordless Vacuum" },
  "description": { "ar": "ليزر يكشف الغبار الدقيق.", "en": "Laser reveals microscopic dust." },
  "brandId": "dyson", "brandName": "Dyson",
  "categoryPath": ["home", "appliances"],
  "currency": "EGP", "priceMinor": 3508700, "wasMinor": 3898700,
  "images": ["$(img photo-1558618666-fcd25c85cd64)"],
  "attributes": { "type": "Cordless", "battery": "60min" },
  "tags": [], "sellerId": "noon-home", "status": "ACTIVE"
}
JSON
)"

upsert "$(cat <<JSON
{
  "sku": "N-NES-VERTUO-POP", "slug": "nespresso-vertuo-pop",
  "title": { "ar": "نسبريسو فيرتو بوب صانعة قهوة", "en": "Nespresso Vertuo Pop Coffee Machine" },
  "description": { "ar": "قهوة بلمسة زر بأربعة أحجام.", "en": "One-touch coffee in four cup sizes." },
  "brandId": "nespresso", "brandName": "Nespresso",
  "categoryPath": ["home", "appliances"],
  "currency": "EGP", "priceMinor": 778700, "wasMinor": 1038700,
  "images": ["$(img photo-1517668808822-9ebb02f2a0e6)"],
  "attributes": { "color": "Red", "capacity": "560ml" },
  "tags": ["express"], "sellerId": "noon-home", "status": "ACTIVE"
}
JSON
)"

upsert "$(cat <<JSON
{
  "sku": "N-IKE-DESK-140", "slug": "office-desk-140cm",
  "title": { "ar": "مكتب عمل 140 سم", "en": "Office Desk 140cm" },
  "description": { "ar": "سطح واسع بهيكل معدني ثابت.", "en": "Spacious top with a sturdy steel frame." },
  "brandId": "generic", "brandName": "Generic",
  "categoryPath": ["home"],
  "currency": "EGP", "priceMinor": 518700, "wasMinor": 713700,
  "images": ["$(img photo-1518455027359-f3f8164ba6bd)"],
  "attributes": { "width": "140cm", "material": "MDF + Steel" },
  "tags": [], "sellerId": "noon-home", "status": "ACTIVE"
}
JSON
)"

echo ""
echo "==> verifying"
sleep 3
total=$(curl -fsS "${CATALOG_URL}/api/v1/products?size=100" | grep -o '"totalItems":[0-9]*' | cut -d: -f2)
echo "    catalog products: ${total:-0}"

echo ""
echo "done. try:"
echo "  ${GATEWAY_URL}/api/v1/bff/home"
echo "  http://localhost:3000"
