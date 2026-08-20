# ============================================================================
#  طبقة البيانات
#
#  قاعدة بيانات لكل خدمة. نسخة Cloud SQL واحدة تستضيف أربع قواعد منفصلة بدل
#  أربع نسخ: عزل منطقي كامل (لا خدمة تصل لقاعدة أخرى بفضل صلاحيات المستخدم)
#  بتكلفة نسخة واحدة. الترقية لنسخ منفصلة لاحقًا لا تغيّر سطرًا في التطبيق —
#  المتغيّر البيئي وحده يتبدّل.
# ============================================================================

# ----------------------------------------------------------------- Cloud KMS

resource "google_kms_key_ring" "main" {
  name     = local.name
  location = var.region
}

/*
 * مفتاحان لا واحد: مفتاح etcd يخصّ مستوى التحكّم ويديره GKE، ومفتاح التطبيق
 * يخصّ بياناتنا. خلطهما يعني أن تدوير أحدهما يمسّ الآخر بلا داع.
 */
resource "google_kms_crypto_key" "gke_etcd" {
  name     = "${local.name}-gke-etcd"
  key_ring = google_kms_key_ring.main.id
  purpose  = "ENCRYPT_DECRYPT"

  # ٩٠ يومًا: توازن بين تقليل نافذة الانكشاف وتكلفة الاحتفاظ بالإصدارات القديمة
  rotation_period = "7776000s"

  lifecycle {
    prevent_destroy = true
  }
}

resource "google_kms_crypto_key" "app" {
  name            = "${local.name}-app"
  key_ring        = google_kms_key_ring.main.id
  purpose         = "ENCRYPT_DECRYPT"
  rotation_period = "7776000s"

  lifecycle {
    prevent_destroy = true
  }
}

# وكيل خدمة GKE يحتاج فك تشفير مفتاح etcd وإلا فشل إنشاء العنقود بخطأ غامض
resource "google_kms_crypto_key_iam_member" "gke_etcd" {
  crypto_key_id = google_kms_crypto_key.gke_etcd.id
  role          = "roles/cloudkms.cryptoKeyEncrypterDecrypter"
  member        = "serviceAccount:service-${data.google_project.current.number}@container-engine-robot.iam.gserviceaccount.com"
}

# --------------------------------------------------------- Cloud SQL PostgreSQL

resource "random_password" "postgres" {
  length  = 32
  special = true

  # هذه الرموز تكسر سلاسل الاتصال ومتغيّرات البيئة في الصدفة
  override_special = "!#%*_-+="
}

resource "google_sql_database_instance" "postgres" {
  name             = "${local.name}-pg"
  database_version = "POSTGRES_16"
  region           = var.region

  deletion_protection = var.cloudsql_deletion_protection

  settings {
    tier              = var.cloudsql_tier
    availability_type = var.cloudsql_availability_type
    disk_type         = "PD_SSD"
    disk_size         = var.cloudsql_disk_size_gb

    /*
     * التوسيع التلقائي للقرص: امتلاء قرص قاعدة البيانات يوقف الكتابة فورًا،
     * وهو أسوأ أنواع الأعطال لأنه يحدث ليلًا وبلا إنذار مبكر.
     */
    disk_autoresize       = true
    disk_autoresize_limit = var.cloudsql_disk_size_gb * 4

    edition = var.cloudsql_availability_type == "REGIONAL" ? "ENTERPRISE_PLUS" : "ENTERPRISE"

    ip_configuration {
      # لا عنوان عام إطلاقًا — الوصول عبر الشبكة الخاصة فقط
      ipv4_enabled                                  = false
      private_network                               = google_compute_network.vpc.id
      enable_private_path_for_google_cloud_services = true
      ssl_mode                                      = "ENCRYPTED_ONLY"
    }

    backup_configuration {
      enabled                        = true
      start_time                     = "01:00"
      point_in_time_recovery_enabled = true
      transaction_log_retention_days = 7

      backup_retention_settings {
        retained_backups = var.cloudsql_backup_retention_days
        retention_unit   = "COUNT"
      }
    }

    maintenance_window {
      day          = 3
      hour         = 2
      update_track = "stable"
    }

    insights_config {
      query_insights_enabled  = true
      query_string_length     = 1024
      record_application_tags = true
      record_client_address   = false
    }

    database_flags {
      name  = "max_connections"
      value = "500"
    }

    /*
     * تسجيل الاستعلامات الأبطأ من ثانية. القيمة 0 تسجّل كل شيء وتُغرق السجلات
     * وتكلّف أكثر من قاعدة البيانات نفسها.
     */
    database_flags {
      name  = "log_min_duration_statement"
      value = "1000"
    }

    user_labels = local.labels
  }

  depends_on = [google_service_networking_connection.psa]
}

resource "google_sql_database" "app" {
  for_each = toset(local.postgres_databases)

  name     = "${var.project_name}_${each.value}"
  instance = google_sql_database_instance.postgres.name
}

resource "google_sql_user" "app" {
  name     = var.project_name
  instance = google_sql_database_instance.postgres.name
  password = random_password.postgres.result
}

/*
 * النسخة القارئة تحمل تقارير لوحة التحكم بعيدًا عن مسار الشراء: استعلام
 * تجميعي ثقيل على الطلبات يجب ألّا يبطّئ إتمام طلب جارٍ.
 */
resource "google_sql_database_instance" "postgres_replica" {
  count = var.cloudsql_enable_read_replica ? 1 : 0

  name                 = "${local.name}-pg-ro"
  database_version     = "POSTGRES_16"
  region               = var.region
  master_instance_name = google_sql_database_instance.postgres.name

  deletion_protection = false

  replica_configuration {
    failover_target = false
  }

  settings {
    tier              = var.cloudsql_tier
    availability_type = "ZONAL"
    disk_type         = "PD_SSD"
    edition           = google_sql_database_instance.postgres.settings[0].edition

    ip_configuration {
      ipv4_enabled    = false
      private_network = google_compute_network.vpc.id
      ssl_mode        = "ENCRYPTED_ONLY"
    }

    user_labels = local.labels
  }
}

# ------------------------------------------------------------- Memorystore

/*
 * Redis Cluster لا Redis العادي: السلة والكاش وحدود المعدّل تنمو مع عدد
 * المستخدمين لا مع حجم الكتالوج، والنسخة الواحدة تصطدم بسقف ذاكرة العقدة.
 * التوزيع على أجزاء يجعل التوسع أفقيًا.
 */
resource "google_redis_cluster" "main" {
  provider = google-beta

  name        = "${local.name}-redis"
  region      = var.region
  shard_count = var.redis_shard_count

  replica_count               = var.redis_replica_count
  node_type                   = "REDIS_SHARED_CORE_NANO"
  transit_encryption_mode     = "TRANSIT_ENCRYPTION_MODE_SERVER_AUTHENTICATION"
  authorization_mode          = "AUTH_MODE_IAM_AUTH"
  deletion_protection_enabled = var.environment == "prod"

  psc_configs {
    network = google_compute_network.vpc.id
  }

  redis_configs = {
    # الكاش يجب أن يُخلي أقدم المفاتيح لا أن يرفض الكتابة عند الامتلاء
    maxmemory-policy = "allkeys-lru"
  }

  depends_on = [google_service_networking_connection.psa]
}

# --------------------------------------------------------------- Firestore

/*
 * بديل DynamoDB. الجلسات ومفاتيح تعطيل التكرار: مفتاح/قيمة مع انتهاء صلاحية،
 * بلا استعلامات معقّدة. Native mode لا Datastore mode لأن الأول يدعم TTL
 * أصليًا ولا يحتاج مهمة تنظيف نكتبها ونصونها بأنفسنا.
 */
resource "google_firestore_database" "main" {
  name        = "(default)"
  location_id = var.region
  type        = "FIRESTORE_NATIVE"

  concurrency_mode                  = "OPTIMISTIC"
  app_engine_integration_mode       = "DISABLED"
  point_in_time_recovery_enablement = "POINT_IN_TIME_RECOVERY_ENABLED"
  delete_protection_state           = var.environment == "prod" ? "DELETE_PROTECTION_ENABLED" : "DELETE_PROTECTION_DISABLED"
}

resource "google_firestore_field" "sessions_ttl" {
  database   = google_firestore_database.main.name
  collection = "sessions"
  field      = "expiresAt"

  ttl_config {}
}

resource "google_firestore_field" "idempotency_ttl" {
  database   = google_firestore_database.main.name
  collection = "idempotency"
  field      = "expiresAt"

  ttl_config {}
}

# ---------------------------------------------------------------- الأسرار

resource "google_secret_manager_secret" "postgres_password" {
  secret_id = "${local.name}-postgres-password"

  replication {
    user_managed {
      replicas {
        location = var.region
      }
    }
  }
}

resource "google_secret_manager_secret_version" "postgres_password" {
  secret      = google_secret_manager_secret.postgres_password.id
  secret_data = random_password.postgres.result
}

/*
 * سلسلة اتصال MongoDB Atlas. Terraform لا يُنشئ عنقود Atlas — إضافة مزوّد
 * طرف ثالث لهذا وحده ثمن أعلى من قيمته. نُنشئ السر فارغًا ويُملأ بعد إنشاء
 * العنقود، والخطوات في docs/06-deployment-gke.md.
 */
resource "google_secret_manager_secret" "mongodb_uri" {
  secret_id = "${local.name}-mongodb-uri"

  replication {
    user_managed {
      replicas {
        location = var.region
      }
    }
  }
}

resource "google_secret_manager_secret" "jwt" {
  secret_id = "${local.name}-jwt-secret"

  replication {
    user_managed {
      replicas {
        location = var.region
      }
    }
  }
}

resource "random_password" "jwt" {
  length  = 64
  special = false
}

resource "google_secret_manager_secret_version" "jwt" {
  secret      = google_secret_manager_secret.jwt.id
  secret_data = random_password.jwt.result
}

# الخدمات التي تقرأ الأسرار عبر External Secrets Operator
resource "google_secret_manager_secret_iam_member" "accessors" {
  for_each = {
    for pair in setproduct(
      ["postgres_password", "mongodb_uri", "jwt"],
      keys(local.workload_identity_services)
    ) : "${pair[0]}.${pair[1]}" => { secret = pair[0], service = pair[1] }
  }

  secret_id = {
    postgres_password = google_secret_manager_secret.postgres_password.id
    mongodb_uri       = google_secret_manager_secret.mongodb_uri.id
    jwt               = google_secret_manager_secret.jwt.id
  }[each.value.secret]

  role   = "roles/secretmanager.secretAccessor"
  member = "serviceAccount:${google_service_account.workload[each.value.service].email}"
}
