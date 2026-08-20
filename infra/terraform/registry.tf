# ============================================================================
#  Artifact Registry — مستودع الصور
#
#  مستودع واحد لكل الخدمات لا مستودع لكل خدمة: الصلاحيات هنا تُدار على مستوى
#  المستودع، وعشرة مستودعات تعني عشرة أضعاف قواعد IAM لفائدة معدومة — كلها
#  تُسحب بنفس حساب العقد وتُدفع بنفس هوية خط النشر.
# ============================================================================

resource "google_project_service" "artifactregistry" {
  service            = "artifactregistry.googleapis.com"
  disable_on_destroy = false
}

resource "google_artifact_registry_repository" "docker" {
  location      = var.region
  repository_id = var.project_name
  description   = "صور خدمات ${var.project_name}"
  format        = "DOCKER"

  docker_config {
    # الوسم غير القابل للتغيير يمنع إعادة دفع :v1.2.3 بمحتوى مختلف —
    # وهي أسرع طريقة لجعل «نفس الإصدار» يعني شيئين مختلفين في بيئتين
    immutable_tags = var.environment == "prod"
  }

  /*
   * سياسات التنظيف تُطبَّق بالترتيب: نُبقي آخر عشرة إصدارات موسومة دائمًا،
   * ونحذف غير الموسوم بعد أسبوع. بدونها ينمو المستودع بلا سقف — كل بناء في
   * كل فرع يترك طبقات وراءه.
   */
  cleanup_policies {
    id     = "keep-recent-tagged"
    action = "KEEP"

    most_recent_versions {
      keep_count = 10
    }
  }

  cleanup_policies {
    id     = "delete-untagged"
    action = "DELETE"

    condition {
      tag_state  = "UNTAGGED"
      older_than = "604800s"
    }
  }

  labels = local.labels

  depends_on = [google_project_service.artifactregistry]
}

# عقد GKE تسحب الصور
resource "google_artifact_registry_repository_iam_member" "node_puller" {
  location   = google_artifact_registry_repository.docker.location
  repository = google_artifact_registry_repository.docker.name
  role       = "roles/artifactregistry.reader"
  member     = "serviceAccount:${google_service_account.gke_nodes.email}"
}

# ------------------------------------------------- هوية خط النشر في GitHub

/*
 * اتحاد الهوية بدل مفتاح JSON. المفتاح الثابت يُنسخ ولا ينتهي ويظهر في سجلات
 * البناء؛ الاتحاد يبادل رمز OIDC من GitHub برمز Google صالح لدقائق، ومربوطًا
 * بمستودع بعينه فلا ينفع من فرع في مستودع آخر.
 */
resource "google_iam_workload_identity_pool" "github" {
  workload_identity_pool_id = "${local.name}-github"
  display_name              = "GitHub Actions"
  description               = "اتحاد هوية خط النشر — بلا مفاتيح ثابتة"
}

resource "google_iam_workload_identity_pool_provider" "github" {
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = "github"
  display_name                       = "GitHub OIDC"

  attribute_mapping = {
    "google.subject"       = "assertion.sub"
    "attribute.repository" = "assertion.repository"
    "attribute.ref"        = "assertion.ref"
  }

  # بدون هذا الشرط يستطيع أي مستودع على GitHub انتحال الهوية
  attribute_condition = "assertion.repository_owner == '${var.github_owner}'"

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

resource "google_service_account" "deployer" {
  account_id   = "${var.project_name}-deployer"
  display_name = "خط النشر"
  description  = "يدفع الصور ويطبّق تعريفات Kubernetes"
}

resource "google_service_account_iam_member" "deployer_wif" {
  service_account_id = google_service_account.deployer.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/attribute.repository/${var.github_repository}"
}

resource "google_artifact_registry_repository_iam_member" "deployer_writer" {
  location   = google_artifact_registry_repository.docker.location
  repository = google_artifact_registry_repository.docker.name
  role       = "roles/artifactregistry.writer"
  member     = "serviceAccount:${google_service_account.deployer.email}"
}

resource "google_project_iam_member" "deployer_gke" {
  project = var.project_id
  role    = "roles/container.developer"
  member  = "serviceAccount:${google_service_account.deployer.email}"
}
