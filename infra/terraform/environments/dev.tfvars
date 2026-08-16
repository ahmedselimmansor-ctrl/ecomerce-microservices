# ============================================================================
#  بيئة التطوير — مُحسَّنة للتكلفة لا للتوفر
# ============================================================================

environment = "dev"
aws_region  = "me-south-1"
owner       = "platform-team"

# NAT واحد بدل ثلاثة يوفّر ~90$/شهر. نقطة فشل واحدة، مقبولة في dev.
single_nat_gateway = true
az_count           = 2

# ---------------------------------------------------------------------- eks
kubernetes_version  = "1.31"
node_instance_types = ["m7g.large", "c7g.large"]
node_desired_size   = 2
node_min_size       = 1
node_max_size       = 6
enable_spot         = true

# ---------------------------------------------------------------- databases
aurora_instance_class        = "db.t4g.medium"
aurora_replica_count         = 0 # بلا نسخة قارئة في dev
aurora_backup_retention_days = 1

documentdb_instance_class = "db.t4g.medium"
documentdb_instance_count = 1

redis_node_type          = "cache.t4g.micro"
redis_shards             = 1
redis_replicas_per_shard = 0

# -------------------------------------------------------------------- kafka
msk_broker_instance_type = "kafka.t3.small"
msk_broker_count         = 2
msk_volume_size_gb       = 20

# --------------------------------------------------------------- opensearch
opensearch_instance_type  = "t3.small.search"
opensearch_instance_count = 1

# ------------------------------------------------------------------- other
domain_name        = ""
enable_waf         = false # WAF مكلف نسبيًا ولا يلزم في dev
enable_personalize = false
