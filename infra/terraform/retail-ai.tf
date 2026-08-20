# ============================================================================
#  Vertex AI Search for commerce — محرّك التوصيات
#
#  ملاحظة مهمة تعادل ما كان مكتوبًا في نسخة Personalize: مزوّد Google لا يغطي
#  موارد Retail بالكامل. الكتالوج وإعدادات التقديم (serving configs) والنماذج
#  تُنشأ عبر واجهة REST أو gcloud، لأن التدريب عملية طويلة لا تناسب دورة حياة
#  Terraform — سيبقى apply معلّقًا ساعات ثم ينتهي بمهلة.
#
#  ما يُنشأ هنا هو ما يمكن إنشاؤه تصريحيًا: التخزين والهوية والتدفّق. أما إنشاء
#  الكتالوج وربط النموذج فخطوات موثّقة في docs/06-deployment-gke.md.
#
#  الخدمة تتدهور بلطف: recommendation-service يسقط إلى محرّك داخلي يعتمد على
#  الأكثر مبيعًا وتشابه الأقسام إذا لم تكن الواجهة متاحة — فإطفاء هذا الملف
#  في dev لا يكسر شيئًا.
# ============================================================================

resource "google_project_service" "retail" {
  count = var.enable_retail_ai ? 1 : 0

  service            = "retail.googleapis.com"
  disable_on_destroy = false
}

resource "google_storage_bucket" "retail" {
  count = var.enable_retail_ai ? 1 : 0

  name     = "${local.name}-retail-${data.google_project.current.number}"
  location = var.region

  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"

  encryption {
    default_kms_key_name = google_kms_crypto_key.app.id
  }

  /*
   * بيانات التدريب لا تُقرأ بعد أن يستهلكها النموذج. تسعون يومًا تكفي لإعادة
   * تدريب أو تدقيق، وما بعدها تكلفة بلا مقابل.
   */
  lifecycle_rule {
    condition {
      age = 90
    }
    action {
      type = "Delete"
    }
  }

  labels = local.labels
}

# ------------------------------------------------ تدفّق تفاعلات المستخدمين

/*
 * التوصيات تتحسّن بقدر ما تُغذّى بالسلوك الفعلي: مشاهدة، إضافة للسلة، شراء.
 * نُرسل التفاعلات إلى Pub/Sub، ومنه إلى دلو التدريب. التجميع مقصود — النموذج
 * لا يُدرَّب على الحدث اللحظي بل على تجميعة يومية، وتقليل عدد الملفات الصغيرة
 * يقلّل زمن التدريب وتكلفته.
 */
resource "google_pubsub_topic" "interactions" {
  count = var.enable_retail_ai ? 1 : 0

  name   = "${local.name}-interactions"
  labels = local.labels

  message_retention_duration = "86400s"
}

resource "google_pubsub_subscription" "interactions_archive" {
  count = var.enable_retail_ai ? 1 : 0

  name  = "${local.name}-interactions-archive"
  topic = google_pubsub_topic.interactions[0].id

  ack_deadline_seconds = 60

  cloud_storage_config {
    bucket          = google_storage_bucket.retail[0].name
    filename_prefix = "interactions/"
    filename_suffix = ".json"

    max_duration = "300s"
    max_bytes    = 67108864
  }

  expiration_policy {
    ttl = ""
  }

  labels = local.labels
}

# ---------------------------------------------------------------- الهوية

resource "google_project_iam_member" "retail_editor" {
  count = var.enable_retail_ai ? 1 : 0

  project = var.project_id
  role    = "roles/retail.editor"
  member  = "serviceAccount:${google_service_account.workload["recommendation-service"].email}"
}

resource "google_pubsub_topic_iam_member" "interactions_publisher" {
  count = var.enable_retail_ai ? 1 : 0

  topic  = google_pubsub_topic.interactions[0].id
  role   = "roles/pubsub.publisher"
  member = "serviceAccount:${google_service_account.workload["recommendation-service"].email}"
}

# وكيل Pub/Sub يكتب في الدلو نيابةً عن الاشتراك
resource "google_storage_bucket_iam_member" "pubsub_writer" {
  count = var.enable_retail_ai ? 1 : 0

  bucket = google_storage_bucket.retail[0].name
  role   = "roles/storage.objectCreator"
  member = "serviceAccount:service-${data.google_project.current.number}@gcp-sa-pubsub.iam.gserviceaccount.com"
}

resource "google_storage_bucket_iam_member" "retail_reader" {
  count = var.enable_retail_ai ? 1 : 0

  bucket = google_storage_bucket.retail[0].name
  role   = "roles/storage.objectViewer"
  member = "serviceAccount:service-${data.google_project.current.number}@gcp-sa-retail.iam.gserviceaccount.com"
}
