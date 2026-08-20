variable "project_id" {
  description = "معرّف مشروع Google Cloud. لا قيمة افتراضية — خطأ صريح أفضل من نشر في المشروع الغلط."
  type        = string
}

variable "project_name" {
  description = "بادئة تسمية كل الموارد"
  type        = string
  default     = "topchoice"
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

variable "region" {
  description = "المنطقة الرئيسية. me-central1 (الدوحة) أقرب مناطق Google زمنًا لمصر والخليج."
  type        = string
  default     = "me-central1"
}

variable "owner" {
  description = "الفريق المسؤول — يظهر في labels وتقارير التكلفة"
  type        = string
  default     = "platform-team"
}

# ------------------------------------------------------------------- network

variable "subnet_cidr" {
  description = "النطاق الأساسي للعقد"
  type        = string
  default     = "10.0.0.0/20"
}

variable "pods_cidr" {
  description = <<-EOT
    النطاق الثانوي للـ Pods. GKE يخصّص /24 لكل عقدة افتراضيًا، فـ /16 يكفي
    ٢٥٦ عقدة. توسيعه لاحقًا ممكن لكن تقليصه مستحيل — نبدأ كبيرًا.
  EOT
  type        = string
  default     = "10.4.0.0/16"
}

variable "services_cidr" {
  description = "النطاق الثانوي لخدمات Kubernetes (ClusterIP)"
  type        = string
  default     = "10.8.0.0/20"
}

variable "master_cidr" {
  description = "نطاق /28 لمستوى التحكّم المُدار. لا يتقاطع مع أي نطاق آخر."
  type        = string
  default     = "172.16.0.0/28"
}

variable "authorized_networks" {
  description = "النطاقات المسموح لها بالوصول لواجهة مستوى التحكّم"
  type = list(object({
    cidr_block   = string
    display_name = string
  }))
  default = []
}

# ----------------------------------------------------------------------- gke

variable "gke_release_channel" {
  description = "قناة الإصدار: REGULAR توازن بين الحداثة والاستقرار"
  type        = string
  default     = "REGULAR"

  validation {
    condition     = contains(["RAPID", "REGULAR", "STABLE"], var.gke_release_channel)
    error_message = "gke_release_channel must be RAPID, REGULAR or STABLE."
  }
}

variable "node_machine_type" {
  description = <<-EOT
    عائلة T2A/C4A من معالجات Arm (Axion/Ampere) تعطي أداءً لكل جنيه أفضل
    بنحو ٢٠٪ لأحمال Java و Node. الصور في هذا المشروع تُبنى multi-arch.
  EOT
  type        = string
  default     = "t2a-standard-4"
}

variable "node_count" {
  description = "عدد العقد الأولي لكل منطقة فرعية في المجمّع الافتراضي"
  type        = number
  default     = 1
}

variable "node_min_count" {
  type    = number
  default = 1
}

variable "node_max_count" {
  type    = number
  default = 8
}

variable "node_disk_size_gb" {
  type    = number
  default = 100
}

variable "enable_spot" {
  description = "عقد Spot: أرخص ٦٠–٩١٪ مقابل إخلاء بإشعار ٣٠ ثانية. لا تصلح للحالة الثابتة."
  type        = bool
  default     = true
}

variable "enable_node_auto_provisioning" {
  description = <<-EOT
    بديل Karpenter على GKE. يُنشئ مجمّعات عقد بأشكال جديدة عند الحاجة بدل
    حصرنا في نوع آلة واحد اخترناه مسبقًا.
  EOT
  type        = bool
  default     = true
}

variable "nap_max_cpu" {
  description = "سقف vCPU الذي يسمح للتوفير التلقائي بالوصول إليه"
  type        = number
  default     = 64
}

variable "nap_max_memory_gb" {
  type    = number
  default = 256
}

# ----------------------------------------------------------------- databases

variable "cloudsql_tier" {
  description = "فئة نسخة Cloud SQL"
  type        = string
  default     = "db-custom-2-7680"
}

variable "cloudsql_availability_type" {
  description = "REGIONAL يعطي نسخة احتياطية ساخنة في منطقة فرعية أخرى، بضعف التكلفة."
  type        = string
  default     = "REGIONAL"

  validation {
    condition     = contains(["ZONAL", "REGIONAL"], var.cloudsql_availability_type)
    error_message = "cloudsql_availability_type must be ZONAL or REGIONAL."
  }
}

variable "cloudsql_disk_size_gb" {
  type    = number
  default = 50
}

variable "cloudsql_backup_retention_days" {
  type    = number
  default = 7
}

variable "cloudsql_enable_read_replica" {
  description = "نسخة قارئة لتحميل تقارير لوحة التحكم بعيدًا عن مسار الشراء"
  type        = bool
  default     = true
}

variable "cloudsql_deletion_protection" {
  type    = bool
  default = true
}

variable "redis_shard_count" {
  description = "عدد الأجزاء في Memorystore for Redis Cluster"
  type        = number
  default     = 3
}

variable "redis_replica_count" {
  description = "نسخ قارئة لكل جزء"
  type        = number
  default     = 1
}

variable "mongodb_atlas_service_attachments" {
  description = <<-EOT
    مرفقات خدمة Private Service Connect التي تعطيها MongoDB Atlas عند إنشاء
    نقطة اتصال خاصة. تُترك فارغة حتى يُنشأ عنقود Atlas — انظر
    docs/06-deployment-gke.md. السبب في ADR 0003: لا تقدّم Google خدمة
    MongoDB مُدارة، والانتقال إلى Firestore يعني إعادة كتابة catalog-service.
  EOT
  type        = list(string)
  default     = []
}

# --------------------------------------------------------------------- kafka

variable "kafka_vcpu_count" {
  description = "إجمالي vCPU لعنقود Managed Service for Apache Kafka (٣ كحد أدنى)"
  type        = number
  default     = 3
}

variable "kafka_memory_gb" {
  description = "الذاكرة بالجيجابايت — بين ١ و ٨ أضعاف عدد vCPU"
  type        = number
  default     = 12
}

variable "kafka_partitions" {
  description = "عدد الأقسام لكل موضوع. القسم وحدة التوازي — لا يمكن تقليصه لاحقًا."
  type        = number
  default     = 6
}

variable "kafka_replication_factor" {
  type    = number
  default = 3
}

# ---------------------------------------------------------------- opensearch

variable "opensearch_node_count" {
  description = <<-EOT
    عدد عقد OpenSearch على GKE. لا تقدّم Google خدمة OpenSearch مُدارة، فنشغّله
    كـ StatefulSet. الرقم هنا يُمرَّر للـ overlay ويظهر في المخرجات.
  EOT
  type        = number
  default     = 3
}

variable "opensearch_disk_size_gb" {
  type    = number
  default = 100
}

# ------------------------------------------------------------------- frontend

variable "domain_name" {
  description = "النطاق الرئيسي. اتركه فارغًا لتخطي Cloud DNS والشهادة المُدارة."
  type        = string
  default     = ""
}

variable "enable_cloud_armor" {
  description = "سياسة Cloud Armor: حماية من DDoS وقواعد OWASP الجاهزة"
  type        = bool
  default     = true
}

variable "enable_retail_ai" {
  description = "موارد Vertex AI Search for commerce (مكلفة — أطفئها في dev)"
  type        = bool
  default     = false
}

variable "cdn_default_ttl" {
  description = "مدة بقاء الاستجابة في Cloud CDN بالثواني"
  type        = number
  default     = 3600
}

# -------------------------------------------------------------- خط النشر

variable "github_owner" {
  description = "مالك المستودع على GitHub — يقيّد اتحاد الهوية به"
  type        = string
  default     = "ahmedselimmansor-ctrl"
}

variable "github_repository" {
  description = "المستودع بصيغة owner/repo. أي فرع خارجه لا يستطيع انتحال هوية النشر."
  type        = string
  default     = "ahmedselimmansor-ctrl/ecomerce-microservices"
}
