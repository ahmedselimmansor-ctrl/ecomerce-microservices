variable "aws_region" {
  description = "المنطقة الرئيسية. me-south-1 (البحرين) أقرب زمنًا لعملاء الخليج."
  type        = string
  default     = "me-south-1"
}

variable "environment" {
  description = "اسم البيئة"
  type        = string
  default     = "dev"

  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "environment must be one of: dev, staging, prod."
  }
}

variable "project" {
  type    = string
  default = "topchoice"
}

variable "owner" {
  description = "الفريق المسؤول — يظهر في الوسوم وتقارير التكلفة"
  type        = string
  default     = "platform-team"
}

# ------------------------------------------------------------------- network

variable "vpc_cidr" {
  type    = string
  default = "10.0.0.0/16"
}

variable "az_count" {
  description = "عدد نطاقات التوفر. 3 هو الحد الأدنى لتحمّل سقوط نطاق كامل."
  type        = number
  default     = 3

  validation {
    condition     = var.az_count >= 2 && var.az_count <= 4
    error_message = "az_count must be between 2 and 4."
  }
}

variable "single_nat_gateway" {
  description = "NAT واحد يوفّر ~90$/شهر لكنه نقطة فشل واحدة — للتطوير فقط"
  type        = bool
  default     = false
}

# ----------------------------------------------------------------------- eks

variable "kubernetes_version" {
  type    = string
  default = "1.31"
}

variable "node_instance_types" {
  description = "Graviton (arm64) — أداء/سعر أفضل ~20% لأحمال Java و Node"
  type        = list(string)
  default     = ["m7g.large", "m7g.xlarge", "c7g.large"]
}

variable "node_desired_size" {
  type    = number
  default = 3
}

variable "node_min_size" {
  type    = number
  default = 2
}

variable "node_max_size" {
  type    = number
  default = 20
}

variable "enable_spot" {
  description = "خلط Spot مع On-Demand عبر Karpenter"
  type        = bool
  default     = true
}

# ----------------------------------------------------------------- databases

variable "aurora_instance_class" {
  type    = string
  default = "db.r6g.large"
}

variable "aurora_replica_count" {
  type    = number
  default = 1
}

variable "aurora_backup_retention_days" {
  type    = number
  default = 7
}

variable "documentdb_instance_class" {
  type    = string
  default = "db.r6g.large"
}

variable "documentdb_instance_count" {
  type    = number
  default = 2
}

variable "redis_node_type" {
  type    = string
  default = "cache.t4g.medium"
}

variable "redis_shards" {
  type    = number
  default = 2
}

variable "redis_replicas_per_shard" {
  type    = number
  default = 1
}

# --------------------------------------------------------------------- kafka

variable "msk_broker_instance_type" {
  type    = string
  default = "kafka.m7g.large"
}

variable "msk_broker_count" {
  description = "يجب أن يكون مضاعفًا لعدد نطاقات التوفر"
  type        = number
  default     = 3
}

variable "msk_volume_size_gb" {
  type    = number
  default = 100
}

# ---------------------------------------------------------------- opensearch

variable "opensearch_instance_type" {
  type    = string
  default = "r6g.large.search"
}

variable "opensearch_instance_count" {
  type    = number
  default = 3
}

# ------------------------------------------------------------------ frontend

variable "domain_name" {
  description = "النطاق الرئيسي. اتركه فارغًا لتخطي Route 53 و ACM."
  type        = string
  default     = ""
}

variable "enable_waf" {
  type    = bool
  default = true
}

variable "enable_personalize" {
  description = "إنشاء موارد Amazon Personalize (مكلفة — أطفئها في dev)"
  type        = bool
  default     = false
}
