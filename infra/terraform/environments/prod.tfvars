# ============================================================================
#  بيئة الإنتاج — مُحسَّنة للتوفر والأداء
# ============================================================================

environment = "prod"
aws_region  = "me-south-1"
owner       = "platform-team"

# NAT لكل نطاق توفر: سقوط نطاق لا يقطع الخروج عن البقية
single_nat_gateway = false
az_count           = 3

# ---------------------------------------------------------------------- eks
kubernetes_version  = "1.31"
node_instance_types = ["m7g.large", "m7g.xlarge", "c7g.large", "c7g.xlarge", "r7g.large"]
node_desired_size   = 6
node_min_size       = 4
node_max_size       = 40
enable_spot         = true

# ---------------------------------------------------------------- databases
aurora_instance_class        = "db.r6g.large"
aurora_replica_count         = 2
aurora_backup_retention_days = 35

documentdb_instance_class = "db.r6g.large"
documentdb_instance_count = 3

redis_node_type          = "cache.r7g.large"
redis_shards             = 3
redis_replicas_per_shard = 1

# -------------------------------------------------------------------- kafka
msk_broker_instance_type = "kafka.m7g.large"
msk_broker_count         = 3
msk_volume_size_gb       = 500

# --------------------------------------------------------------- opensearch
opensearch_instance_type  = "r6g.large.search"
opensearch_instance_count = 3

# ------------------------------------------------------------------- other
# ضع نطاقك الحقيقي هنا لتفعيل Route 53 و ACM
domain_name        = ""
enable_waf         = true
enable_personalize = true
