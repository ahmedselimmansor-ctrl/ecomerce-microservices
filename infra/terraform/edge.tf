# ============================================================================
#  الحافة — موازن الحمل العالمي والـ CDN والحماية
#
#  فرق جوهري عن CloudFront: موازن حمل Google عالمي بعنوان IP واحد (anycast).
#  لا نُنشئ توزيعة CDN منفصلة أمام موازن إقليمي — الـ CDN خاصية تُفعَّل على
#  خدمة خلفية. النتيجة قطعة واحدة أقل، ومسار واحد أقصر للطلب.
#
#  العنوان الثابت يُنشأ هنا، أما خدمات الخلفية فيُنشئها GKE Ingress من تعريفات
#  Kubernetes (BackendConfig / ManagedCertificate) في infra/k8s. هذا التقسيم
#  مقصود: ما يتبع دورة حياة التطبيق يعيش مع التطبيق.
# ============================================================================

resource "google_compute_global_address" "ingress" {
  name        = "${local.name}-ingress"
  description = "عنوان anycast عالمي — يُشار إليه في Ingress عبر التعليق التوضيحي"
}

# --------------------------------------------------------------- Cloud Armor

resource "google_compute_security_policy" "main" {
  count = var.enable_cloud_armor ? 1 : 0

  name        = "${local.name}-armor"
  description = "حماية الحافة: DDoS وقواعد OWASP"
  type        = "CLOUD_ARMOR"

  adaptive_protection_config {
    layer_7_ddos_defense_config {
      enable = true
    }
  }

  /*
   * حدّ المعدّل عند الحافة يوقف الفيضان قبل أن يستهلك عقدة أو اتصال قاعدة
   * بيانات. بوابة الـ API تفرض حدًا أدقّ لكل مستخدم لاحقًا — الطبقتان تكمّلان
   * بعضهما ولا تُغنيان.
   */
  rule {
    action   = "rate_based_ban"
    priority = 1000

    match {
      versioned_expr = "SRC_IPS_V1"
      config {
        src_ip_ranges = ["*"]
      }
    }

    rate_limit_options {
      conform_action = "allow"
      exceed_action  = "deny(429)"

      enforce_on_key = "IP"

      rate_limit_threshold {
        count        = 600
        interval_sec = 60
      }

      ban_duration_sec = 300
    }

    description = "٦٠٠ طلب في الدقيقة لكل عنوان"
  }

  rule {
    action   = "deny(403)"
    priority = 2000

    match {
      expr {
        expression = "evaluatePreconfiguredExpr('sqli-v33-stable')"
      }
    }

    description = "حقن SQL"
  }

  rule {
    action   = "deny(403)"
    priority = 2100

    match {
      expr {
        expression = "evaluatePreconfiguredExpr('xss-v33-stable')"
      }
    }

    description = "XSS"
  }

  rule {
    action   = "deny(403)"
    priority = 2200

    match {
      expr {
        expression = "evaluatePreconfiguredExpr('lfi-v33-stable')"
      }
    }

    description = "قراءة ملفات محلية"
  }

  rule {
    action   = "allow"
    priority = 2147483647

    match {
      versioned_expr = "SRC_IPS_V1"
      config {
        src_ip_ranges = ["*"]
      }
    }

    description = "القاعدة الافتراضية — يجب أن تبقى الأخيرة"
  }
}

# ------------------------------------------------------------------ Cloud DNS

resource "google_dns_managed_zone" "main" {
  count = var.domain_name != "" ? 1 : 0

  name        = replace("${local.name}-zone", ".", "-")
  dns_name    = "${var.domain_name}."
  description = "النطاق الرئيسي لـ ${var.project_name}"

  dnssec_config {
    state = "on"
  }

  labels = local.labels
}

resource "google_dns_record_set" "apex" {
  count = var.domain_name != "" ? 1 : 0

  name         = google_dns_managed_zone.main[0].dns_name
  managed_zone = google_dns_managed_zone.main[0].name
  type         = "A"
  ttl          = 300

  rrdatas = [google_compute_global_address.ingress.address]
}

resource "google_dns_record_set" "www" {
  count = var.domain_name != "" ? 1 : 0

  name         = "www.${google_dns_managed_zone.main[0].dns_name}"
  managed_zone = google_dns_managed_zone.main[0].name
  type         = "A"
  ttl          = 300

  rrdatas = [google_compute_global_address.ingress.address]
}

resource "google_dns_record_set" "api" {
  count = var.domain_name != "" ? 1 : 0

  name         = "api.${google_dns_managed_zone.main[0].dns_name}"
  managed_zone = google_dns_managed_zone.main[0].name
  type         = "A"
  ttl          = 300

  rrdatas = [google_compute_global_address.ingress.address]
}

# ------------------------------------------------------- Cloud Storage للوسائط

resource "google_storage_bucket" "media" {
  name     = "${local.name}-media-${data.google_project.current.number}"
  location = var.region

  /*
   * الوصول الموحّد على مستوى الدلو يلغي قوائم ACL لكل كائن. ACL لكل كائن هي
   * الطريقة الكلاسيكية لتسريب دلو كامل عن طريق الخطأ.
   */
  uniform_bucket_level_access = true
  public_access_prevention    = "inherited"

  versioning {
    enabled = true
  }

  encryption {
    default_kms_key_name = google_kms_crypto_key.app.id
  }

  cors {
    origin          = var.domain_name != "" ? ["https://${var.domain_name}"] : ["*"]
    method          = ["GET", "HEAD"]
    response_header = ["Content-Type", "Cache-Control"]
    max_age_seconds = 3600
  }

  lifecycle_rule {
    condition {
      age                = 30
      with_state         = "ARCHIVED"
      num_newer_versions = 3
    }
    action {
      type = "Delete"
    }
  }

  lifecycle_rule {
    condition {
      age = 90
    }
    action {
      type          = "SetStorageClass"
      storage_class = "NEARLINE"
    }
  }

  labels = local.labels
}

# وكيل خدمة Cloud Storage يحتاج المفتاح ليشفّر الكائنات
resource "google_kms_crypto_key_iam_member" "storage" {
  crypto_key_id = google_kms_crypto_key.app.id
  role          = "roles/cloudkms.cryptoKeyEncrypterDecrypter"
  member        = "serviceAccount:service-${data.google_project.current.number}@gs-project-accounts.iam.gserviceaccount.com"
}

resource "google_storage_bucket_iam_member" "public_read" {
  bucket = google_storage_bucket.media.name
  role   = "roles/storage.objectViewer"
  member = "allUsers"
}

resource "google_storage_bucket_iam_member" "catalog_writer" {
  bucket = google_storage_bucket.media.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.workload["catalog-service"].email}"
}

# --------------------------------------------- CDN لدلو الوسائط

/*
 * الصور تُقدَّم من الحافة مباشرة لا عبر العنقود: طلب صورة لا يجب أن يستهلك
 * اتصالًا في خدمة الكتالوج. دلو خلفي مستقل بالـ CDN أمامه.
 */
resource "google_compute_backend_bucket" "media" {
  name        = "${local.name}-media"
  bucket_name = google_storage_bucket.media.name
  enable_cdn  = true

  cdn_policy {
    cache_mode        = "CACHE_ALL_STATIC"
    default_ttl       = var.cdn_default_ttl
    max_ttl           = 86400
    client_ttl        = var.cdn_default_ttl
    negative_caching  = true
    serve_while_stale = 86400

    /*
     * تجميع الطلبات المتزامنة على نفس المفتاح في طلب أصل واحد. بدونه، انتهاء
     * صلاحية صورة شائعة يرسل آلاف الطلبات للأصل في اللحظة نفسها.
     */
    request_coalescing = true

    negative_caching_policy {
      code = 404
      ttl  = 60
    }
  }

  compression_mode = "AUTOMATIC"
}
