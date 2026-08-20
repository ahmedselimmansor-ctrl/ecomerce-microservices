# ============================================================================
#  الأحداث
#
#  نظامان لا واحد، لأن لكل منهما وظيفة مختلفة:
#
#    Kafka   — العمود الفقري للـ Saga. نحتاج ترتيبًا مضمونًا داخل القسم (أحداث
#              الطلب الواحد يجب أن تصل بترتيبها) وسجلًا قابلًا لإعادة القراءة
#              (خدمة جديدة تعيد بناء حالتها من الصفر).
#    Pub/Sub — الانتشار الخارجي: بريد ورسائل وإشعارات دفع. لا ترتيب مطلوب،
#              والقياس التلقائي والتسليم للنقاط الخارجية أسهل بكثير.
#
#  استبدال Kafka بـ Pub/Sub كليًا كان سيوفّر تكلفة، لكنه كان سيكلّف إعادة كتابة
#  كل مستهلك ويفقدنا إعادة قراءة السجل — وهي حجر الأساس في تصحيح Saga عالقة.
# ============================================================================

resource "google_project_service" "managedkafka" {
  service            = "managedkafka.googleapis.com"
  disable_on_destroy = false
}

resource "google_managed_kafka_cluster" "main" {
  provider = google-beta

  cluster_id = "${local.name}-kafka"
  location   = var.region

  capacity_config {
    vcpu_count   = var.kafka_vcpu_count
    memory_bytes = var.kafka_memory_gb * 1024 * 1024 * 1024
  }

  gcp_config {
    access_config {
      network_configs {
        subnet = google_compute_subnetwork.gke.id
      }
    }
  }

  rebalance_config {
    mode = "AUTO_REBALANCE_ON_SCALE_UP"
  }

  labels = local.labels

  depends_on = [google_project_service.managedkafka]
}

/*
 * عدد الأقسام هو سقف التوازي: ستة أقسام تعني ستة مستهلكين متوازين كحد أقصى
 * في نفس المجموعة. زيادته لاحقًا ممكنة، لكنها تكسر ضمان الترتيب للمفاتيح
 * الموجودة لأن دالة التقسيم تتغيّر — لذلك نبدأ بعدد أكبر من حاجتنا اليوم.
 */
resource "google_managed_kafka_topic" "topics" {
  provider = google-beta
  for_each = toset(local.kafka_topics)

  topic_id           = each.value
  cluster            = google_managed_kafka_cluster.main.cluster_id
  location           = var.region
  partition_count    = var.kafka_partitions
  replication_factor = var.kafka_replication_factor

  configs = {
    "cleanup.policy" = "delete"
    # سبعة أيام: تكفي لإعادة تشغيل مستهلك بعد عطلة أسبوع دون فقد أحداث
    "retention.ms"        = "604800000"
    "min.insync.replicas" = "2"
  }
}

# ------------------------------------------------------------------ Pub/Sub

resource "google_pubsub_topic" "notifications" {
  name = "${local.name}-notifications"

  labels = local.labels

  message_retention_duration = "604800s"
}

/*
 * موضوع الرسائل الميتة. بدونه تُعاد محاولة الرسالة الفاشلة إلى الأبد وتحجب
 * ما خلفها؛ ومعه نحتفظ بها للفحص ونمضي.
 */
resource "google_pubsub_topic" "notifications_dlq" {
  name   = "${local.name}-notifications-dlq"
  labels = local.labels

  message_retention_duration = "1209600s"
}

resource "google_pubsub_subscription" "email" {
  name  = "${local.name}-email"
  topic = google_pubsub_topic.notifications.id

  ack_deadline_seconds       = 60
  message_retention_duration = "604800s"

  retry_policy {
    minimum_backoff = "10s"
    maximum_backoff = "600s"
  }

  dead_letter_policy {
    dead_letter_topic     = google_pubsub_topic.notifications_dlq.id
    max_delivery_attempts = 5
  }

  expiration_policy {
    # ttl فارغ = لا تنتهي أبدًا. الافتراضي ٣١ يومًا يحذف الاشتراك بصمت
    # إذا صمت المستهلك، وهو أسوأ ما يمكن أن يحدث لطابور بريد.
    ttl = ""
  }

  labels = local.labels
}

resource "google_pubsub_subscription" "push" {
  name  = "${local.name}-push"
  topic = google_pubsub_topic.notifications.id

  ack_deadline_seconds       = 30
  message_retention_duration = "86400s"

  retry_policy {
    minimum_backoff = "10s"
    maximum_backoff = "300s"
  }

  dead_letter_policy {
    dead_letter_topic     = google_pubsub_topic.notifications_dlq.id
    max_delivery_attempts = 5
  }

  expiration_policy {
    ttl = ""
  }

  labels = local.labels
}

# --------------------------------------------------------------- الصلاحيات

resource "google_pubsub_topic_iam_member" "publisher" {
  for_each = toset(["order-service", "notification-service"])

  topic  = google_pubsub_topic.notifications.id
  role   = "roles/pubsub.publisher"
  member = "serviceAccount:${google_service_account.workload[each.value].email}"
}

resource "google_pubsub_subscription_iam_member" "subscriber" {
  for_each = {
    email = google_pubsub_subscription.email.id
    push  = google_pubsub_subscription.push.id
  }

  subscription = each.value
  role         = "roles/pubsub.subscriber"
  member       = "serviceAccount:${google_service_account.workload["notification-service"].email}"
}

resource "google_project_iam_member" "kafka_clients" {
  for_each = toset([
    "order-service",
    "catalog-service",
    "notification-service",
  ])

  project = var.project_id
  role    = "roles/managedkafka.client"
  member  = "serviceAccount:${google_service_account.workload[each.value].email}"
}
