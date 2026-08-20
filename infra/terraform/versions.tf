terraform {
  required_version = ">= 1.9.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.0"
    }
    google-beta = {
      source  = "hashicorp/google-beta"
      version = "~> 6.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }

  /*
   * الحالة في Cloud Storage لا على القرص المحلي: الحالة على جهاز مطوّر تعني أن
   * زميلًا يطبّق تغييرًا لا يرى ما فعله الآخر. دلو GCS يوفّر القفل تلقائيًا عبر
   * generation preconditions، فلا نحتاج جدول أقفال منفصلًا كما كان الحال مع
   * S3 + DynamoDB.
   *
   * القيم تُمرَّر عند التهيئة لأن backend لا يقبل متغيّرات:
   *   terraform init -backend-config="bucket=topchoice-tfstate-<project>"
   */
  backend "gcs" {
    prefix = "terraform/state"
  }
}

provider "google" {
  project = var.project_id
  region  = var.region

  default_labels = local.labels
}

provider "google-beta" {
  project = var.project_id
  region  = var.region

  default_labels = local.labels
}

# ----------------------------------------------------------------- معطيات عامة

data "google_project" "current" {}

data "google_client_config" "current" {}

locals {
  name = "${var.project_name}-${var.environment}"

  /*
   * labels في Google Cloud ليست tags في AWS: المفتاح والقيمة يقبلان الأحرف
   * الصغيرة والأرقام و«-» و«_» فقط. أي حرف كبير أو مسافة يرفضه المزوّد وقت
   * التطبيق لا وقت التحقق، فنلتزم بالتنميط هنا مرة واحدة.
   */
  labels = {
    app         = lower(var.project_name)
    environment = lower(var.environment)
    owner       = lower(var.owner)
    managed-by  = "terraform"
  }

  /*
   * الخدمات التي تحتاج هوية Google. المفتاح هو اسم حساب خدمة Kubernetes،
   * والقيمة معرّف حساب خدمة Google.
   *
   * المعرّفات مختصرة عمدًا لا مشتقّة من اسم الخدمة: سقف Google هو ٣٠ حرفًا،
   * و«topchoice-recommendation-service» يتجاوزه فيُبتر بصمت إلى اسم مشوّه لا
   * يطابق ما في تعريفات Kubernetes — والربط يفشل وقت التشغيل لا وقت التطبيق،
   * وهو أسوأ وقت لاكتشافه.
   */
  workload_identity_services = {
    api-gateway            = "tc-api-gateway"
    catalog-service        = "tc-catalog"
    order-service          = "tc-order"
    notification-service   = "tc-notification"
    recommendation-service = "tc-recommendation"
  }

  # قواعد بيانات PostgreSQL — واحدة لكل خدمة تملك بياناتها
  postgres_databases = ["identity", "order", "payment", "inventory"]

  kafka_topics = [
    "order.events.v1",
    "inventory.events.v1",
    "payment.events.v1",
    "catalog.product.v1",
    "notification.commands.v1",
  ]
}
