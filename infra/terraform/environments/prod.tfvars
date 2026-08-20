# ============================================================================
#  prod — التوفّر أولًا
#
#  كل فرق عن dev هنا مقصود ومدفوع الثمن: توفّر إقليمي، نسخة قارئة، حماية
#  الحافة، ومنع الحذف. لا شيء «مفعّل احتياطًا» — كل بند يقابل عطلًا محددًا
#  يمنعه.
# ============================================================================

project_id  = "topchoice-prod"
environment = "prod"
region      = "me-central1"

# ------------------------------------------------------------------- شبكة
subnet_cidr   = "10.16.0.0/20"
pods_cidr     = "10.20.0.0/16"
services_cidr = "10.24.0.0/20"
master_cidr   = "172.16.1.0/28"

# --------------------------------------------------------------------- gke
gke_release_channel           = "REGULAR" # الاستقرار يسبق الحداثة هنا
node_machine_type             = "t2a-standard-4"
node_count                    = 2 # لكل منطقة فرعية → ٦ عقد
node_min_count                = 2
node_max_count                = 12
node_disk_size_gb             = 100
enable_spot                   = true # للأحمال عديمة الحالة فقط — الوسم يفرض ذلك
enable_node_auto_provisioning = true
nap_max_cpu                   = 128
nap_max_memory_gb             = 512

# --------------------------------------------------------------- قواعد بيانات
cloudsql_tier                  = "db-custom-4-15360"
cloudsql_availability_type     = "REGIONAL" # تجاوز فشل تلقائي لمنطقة أخرى
cloudsql_disk_size_gb          = 100
cloudsql_backup_retention_days = 30
cloudsql_enable_read_replica   = true
cloudsql_deletion_protection   = true

redis_shard_count   = 3
redis_replica_count = 1

# ------------------------------------------------------------------- kafka
kafka_vcpu_count         = 6
kafka_memory_gb          = 24
kafka_partitions         = 12 # سقف التوازي — لا يمكن تقليصه لاحقًا
kafka_replication_factor = 3

# -------------------------------------------------------------- opensearch
opensearch_node_count   = 3
opensearch_disk_size_gb = 200

# -------------------------------------------------------------------- أخرى
domain_name        = ""
enable_cloud_armor = true
enable_retail_ai   = true
cdn_default_ttl    = 3600
