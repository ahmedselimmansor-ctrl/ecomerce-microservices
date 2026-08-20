#!/bin/sh
# ============================================================================
#  تهيئة موارد Google Cloud المحاكاة محليًا.
#  نفس الموارد تُنشأ في GCP الحقيقية عبر Terraform (infra/terraform).
#
#  كل شيء هنا REST خام لسببين: أوامر `gcloud pubsub` تتجاهل متغيّر
#  PUBSUB_EMULATOR_HOST وتتحدث مع الـ API الحقيقية، وسحب صورة gcloud
#  كاملة لأجل خمسة نداءات لا يستحق ثلاثة جيجابايت.
# ============================================================================
set -eu

PROJECT="${GOOGLE_CLOUD_PROJECT:-topchoice-local}"
BUCKET="${GCS_MEDIA_BUCKET:-topchoice-media-local}"
PUBSUB="http://${PUBSUB_EMULATOR_HOST:-pubsub-emulator:8681}"
FIRESTORE="http://${FIRESTORE_EMULATOR_HOST:-firestore-emulator:8091}"
GCS="${STORAGE_EMULATOR_HOST:-http://fake-gcs:4443}"

# المحاكيات تحتاج ثوانيَ لتقلع (Firestore و Pub/Sub على JVM). ننتظر كلًّا
# منها بدل تثبيت `sleep` تعسفي يطول على جهاز بطيء ويقصر على آخر سريع.
wait_for() {
  name="$1"; url="$2"; tries=60
  while [ "$tries" -gt 0 ]; do
    if curl -fsS -o /dev/null "$url" 2>/dev/null; then
      echo "    ${name} ready"
      return 0
    fi
    tries=$((tries - 1))
    sleep 1
  done
  echo "    ${name} did not come up at ${url}" >&2
  return 1
}

echo "==> waiting for emulators"
wait_for "pub/sub"   "${PUBSUB}/v1/projects/${PROJECT}/topics"
wait_for "firestore" "${FIRESTORE}/"
wait_for "storage"   "${GCS}/storage/v1/b"

# ------------------------------------------------------------ Cloud Storage

echo "==> creating bucket ${BUCKET}"
curl -fsS -o /dev/null -X POST \
  "${GCS}/storage/v1/b?project=${PROJECT}" \
  -H 'Content-Type: application/json' \
  -d "{\"name\":\"${BUCKET}\"}" 2>/dev/null || true

# لا نضبط IAM هنا: المحاكي يخدم كل عنصر علنًا أصلًا. في GCP الحقيقية الوصول
# العام يمرّ عبر backend bucket خلف Cloud CDN، لا عبر فتح الدلو للجميع.

# ------------------------------------------------------------------ Pub/Sub

# موضوع واحد للنشر، واشتراك مستقل لكل مستهلك. ولكل اشتراك موضوع رسائل ميتة
# خاص به — الرسالة التي تفشل خمس مرات تُعزل بدل أن تسدّ الاشتراك إلى الأبد.
create_topic() {
  echo "    topic ${1}"
  curl -fsS -o /dev/null -X PUT "${PUBSUB}/v1/projects/${PROJECT}/topics/${1}" \
    -H 'Content-Type: application/json' -d '{}' 2>/dev/null || true
}

create_subscription() {
  sub="$1"; topic="$2"; dlq="$3"
  echo "    subscription ${sub}"
  body="{\"topic\":\"projects/${PROJECT}/topics/${topic}\",\"ackDeadlineSeconds\":30,\"deadLetterPolicy\":{\"deadLetterTopic\":\"projects/${PROJECT}/topics/${dlq}\",\"maxDeliveryAttempts\":5}}"
  # نسخ أقدم من المحاكي لا تعرف deadLetterPolicy؛ ننشئ الاشتراك بدونها بدل
  # أن تسقط التهيئة كلها من أجل حقل اختياري محليًا.
  curl -fsS -o /dev/null -X PUT "${PUBSUB}/v1/projects/${PROJECT}/subscriptions/${sub}" \
    -H 'Content-Type: application/json' -d "${body}" 2>/dev/null \
    || curl -fsS -o /dev/null -X PUT "${PUBSUB}/v1/projects/${PROJECT}/subscriptions/${sub}" \
         -H 'Content-Type: application/json' \
         -d "{\"topic\":\"projects/${PROJECT}/topics/${topic}\"}" 2>/dev/null || true
}

echo "==> creating Pub/Sub topics and subscriptions"
for t in topchoice-notifications topchoice-order-events topchoice-analytics; do
  create_topic "${t}"
  create_topic "${t}-dlq"
  create_subscription "${t}-sub" "${t}" "${t}-dlq"
  create_subscription "${t}-dlq-sub" "${t}-dlq" "${t}-dlq"
done

# ---------------------------------------------------------------- Firestore

# Firestore لا يُنشئ المجموعات صراحةً: أول مستند يوجدها. نكتب مستندًا واحدًا
# لكل مجموعة ليظهر الشكل المتوقّع للحقول — وخصوصًا حقل الانتهاء expires_at
# الذي تعتمد عليه سياسة TTL في السحابة. المحاكي لا ينفّذ TTL، فالمستندات
# المنتهية تبقى محليًا ولا تُحذف تلقائيًا.
fs_doc() {
  collection="$1"; doc_id="$2"; fields="$3"
  echo "    ${collection}/${doc_id}"
  curl -fsS -o /dev/null -X POST \
    "${FIRESTORE}/v1/projects/${PROJECT}/databases/(default)/documents/${collection}?documentId=${doc_id}" \
    -H 'Content-Type: application/json' \
    -d "{\"fields\":${fields}}" 2>/dev/null || true
}

echo "==> seeding Firestore collections"
fs_doc topchoice-idempotency __seed__ \
  '{"key":{"stringValue":"__seed__"},"status":{"stringValue":"SEED"},"expires_at":{"timestampValue":"2030-01-01T00:00:00Z"}}'
fs_doc topchoice-sessions __seed__ \
  '{"sid":{"stringValue":"__seed__"},"expires_at":{"timestampValue":"2030-01-01T00:00:00Z"}}'

# ----------------------------------------------------------------- الأسرار

# لا محاكي لـ Secret Manager. محليًا يأتي JWT_SECRET من .env مباشرة، وفي
# GCP يُسحب من Secret Manager عبر External Secrets Operator إلى Secret في
# العنقود — فلا يمرّ السرّ يومًا عبر صورة أو مستودع.

echo "gcp emulator resources ready"
