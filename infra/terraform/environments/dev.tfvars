# ============================================================================
#  dev — أرخص ما يمكن مع بقاء الشكل مطابقًا للإنتاج
#
#  المبدأ: نقلّل الحجم لا البنية. نفس الموارد ونفس المسارات، بأصغر فئة ممكنة.
#  بيئة تطوير مختلفة بنيويًا عن الإنتاج تخفي الأعطال حتى النشر.
# ============================================================================

project_id  = "topchoice-dev"
environment = "dev"
region      = "me-central1"

# ------------------------------------------------------------------- شبكة
subnet_cidr   = "10.0.0.0/20"
pods_cidr     = "10.4.0.0/16"
services_cidr = "10.8.0.0/20"
master_cidr   = "172.16.0.0/28"

# --------------------------------------------------------------------- gke
gke_release_channel           = "RAPID" # نلتقي بالمشاكل هنا قبل الإنتاج
node_machine_type             = "t2a-standard-2"
node_count                    = 1
node_min_count                = 1
node_max_count                = 4
node_disk_size_gb             = 50
enable_spot                   = true
enable_node_auto_provisioning = false # تبسيط: مجمّع ثابت يكفي في dev
nap_max_cpu                   = 16
nap_max_memory_gb             = 64

# --------------------------------------------------------------- قواعد بيانات
cloudsql_tier                  = "db-custom-1-3840"
cloudsql_availability_type     = "ZONAL" # بلا نسخة احتياطية ساخنة
cloudsql_disk_size_gb          = 20
cloudsql_backup_retention_days = 3
cloudsql_enable_read_replica   = false
cloudsql_deletion_protection   = false

redis_shard_count   = 1
redis_replica_count = 0

# ------------------------------------------------------------------- kafka
kafka_vcpu_count         = 3
kafka_memory_gb          = 12
kafka_partitions         = 3
kafka_replication_factor = 3

# -------------------------------------------------------------- opensearch
opensearch_node_count   = 1
opensearch_disk_size_gb = 20

# -------------------------------------------------------------------- أخرى
domain_name        = ""
enable_cloud_armor = false # مكلف نسبيًا ولا يلزم في dev
enable_retail_ai   = false
cdn_default_ttl    = 60 # كاش قصير حتى نرى تغييراتنا فورًا
