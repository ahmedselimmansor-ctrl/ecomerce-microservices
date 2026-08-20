# ============================================================================
#  المخرجات — ما تحتاجه الخطوات التالية بعد apply
# ============================================================================

output "cluster_name" {
  description = "اسم عنقود GKE"
  value       = google_container_cluster.main.name
}

output "cluster_endpoint" {
  description = "عنوان مستوى التحكّم"
  value       = google_container_cluster.main.endpoint
  sensitive   = true
}

output "kubeconfig_command" {
  description = "الأمر الذي يربط kubectl بالعنقود"
  value       = "gcloud container clusters get-credentials ${google_container_cluster.main.name} --region ${var.region} --project ${var.project_id}"
}

output "workload_identity_pool" {
  description = "مجمّع Workload Identity — يُستخدم في تعليقات حسابات خدمة Kubernetes"
  value       = "${var.project_id}.svc.id.goog"
}

output "workload_service_accounts" {
  description = "حسابات خدمة Google لكل حمل — تُوضع في التعليق iam.gke.io/gcp-service-account"
  value       = { for k, sa in google_service_account.workload : k => sa.email }
}

# ------------------------------------------------------------------ البيانات

output "postgres_connection_name" {
  description = "اسم اتصال Cloud SQL — يُمرَّر لوكيل المصادقة"
  value       = google_sql_database_instance.postgres.connection_name
}

output "postgres_private_ip" {
  description = "العنوان الخاص لنسخة PostgreSQL"
  value       = google_sql_database_instance.postgres.private_ip_address
  sensitive   = true
}

output "postgres_replica_connection_name" {
  description = "اسم اتصال النسخة القارئة، إن وُجدت"
  value       = var.cloudsql_enable_read_replica ? google_sql_database_instance.postgres_replica[0].connection_name : null
}

output "postgres_databases" {
  description = "قواعد البيانات المُنشأة"
  value       = [for db in google_sql_database.app : db.name]
}

output "redis_discovery_endpoint" {
  description = "نقطة اكتشاف عنقود Redis"
  value       = google_redis_cluster.main.discovery_endpoints
  sensitive   = true
}

output "firestore_database" {
  description = "قاعدة Firestore للجلسات ومفاتيح تعطيل التكرار"
  value       = google_firestore_database.main.name
}

# ------------------------------------------------------------------ الأحداث

output "kafka_bootstrap" {
  description = "عنوان bootstrap لعنقود Kafka"
  value       = "bootstrap.${google_managed_kafka_cluster.main.cluster_id}.${var.region}.managedkafka.${var.project_id}.cloud.goog:9092"
}

output "kafka_topics" {
  description = "المواضيع المُنشأة"
  value       = [for t in google_managed_kafka_topic.topics : t.topic_id]
}

output "pubsub_notifications_topic" {
  description = "موضوع الإشعارات"
  value       = google_pubsub_topic.notifications.name
}

# ------------------------------------------------------------------- الحافة

output "ingress_ip" {
  description = "عنوان anycast العالمي — وجّه إليه سجلات DNS الخارجية"
  value       = google_compute_global_address.ingress.address
}

output "ingress_address_name" {
  description = "اسم العنوان — يُشار إليه في تعليق Ingress"
  value       = google_compute_global_address.ingress.name
}

output "cloud_armor_policy" {
  description = "اسم سياسة Cloud Armor — يُشار إليه في BackendConfig"
  value       = var.enable_cloud_armor ? google_compute_security_policy.main[0].name : null
}

output "media_bucket" {
  description = "دلو الوسائط"
  value       = google_storage_bucket.media.name
}

output "dns_name_servers" {
  description = "خوادم الأسماء — سجّلها عند مُسجّل النطاق"
  value       = var.domain_name != "" ? google_dns_managed_zone.main[0].name_servers : []
}

# ------------------------------------------------------------------ المنصّة

output "artifact_registry" {
  description = "عنوان المستودع — بادئة كل صورة"
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.docker.repository_id}"
}

output "deployer_service_account" {
  description = "حساب خدمة النشر — يُوضع في أسرار GitHub Actions"
  value       = google_service_account.deployer.email
}

output "workload_identity_provider" {
  description = "المعرّف الكامل لمزوّد OIDC — يُوضع في أسرار GitHub Actions"
  value       = google_iam_workload_identity_pool_provider.github.name
}

output "secret_names" {
  description = "أسماء الأسرار في Secret Manager"
  value = {
    postgres_password = google_secret_manager_secret.postgres_password.secret_id
    mongodb_uri       = google_secret_manager_secret.mongodb_uri.secret_id
    jwt               = google_secret_manager_secret.jwt.secret_id
  }
}

output "kms_app_key" {
  description = "مفتاح التشفير للتطبيق"
  value       = google_kms_crypto_key.app.id
}
