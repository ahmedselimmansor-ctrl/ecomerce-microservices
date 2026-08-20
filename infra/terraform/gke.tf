# ============================================================================
#  GKE — عنقود Kubernetes
#
#  لماذا Standard لا Autopilot: نشغّل OpenSearch كـ StatefulSet بـ DaemonSet
#  لضبط vm.max_map_count، وAutopilot يمنع الحاويات المميّزة. التفصيل في
#  docs/adr/0005-gke-over-alternatives.md.
# ============================================================================

resource "google_service_account" "gke_nodes" {
  account_id   = "${local.name}-gke-nodes"
  display_name = "عقد ${local.name}"
  description  = "هوية عقد GKE — أقل صلاحية ممكنة، والأحمال تستخدم Workload Identity"
}

/*
 * حساب العقدة يحتاج الكتابة في السجلات والمقاييس وسحب الصور — لا أكثر.
 * الصلاحيات الافتراضية لحساب Compute Engine واسعة جدًا، ولهذا نُنشئ حسابًا
 * مخصّصًا بدل استخدامه.
 */
resource "google_project_iam_member" "gke_nodes" {
  for_each = toset([
    "roles/logging.logWriter",
    "roles/monitoring.metricWriter",
    "roles/monitoring.viewer",
    "roles/stackdriver.resourceMetadata.writer",
    "roles/artifactregistry.reader",
  ])

  project = var.project_id
  role    = each.value
  member  = "serviceAccount:${google_service_account.gke_nodes.email}"
}

resource "google_container_cluster" "main" {
  name     = local.name
  location = var.region

  network    = google_compute_network.vpc.id
  subnetwork = google_compute_subnetwork.gke.id

  /*
   * نحذف المجمّع الافتراضي فورًا وندير مجمّعاتنا بمورد منفصل. المجمّع المُنشأ
   * ضمن العنقود لا يمكن تعديله دون إعادة إنشاء العنقود كله.
   */
  remove_default_node_pool = true
  initial_node_count       = 1

  deletion_protection = var.environment == "prod"

  release_channel {
    channel = var.gke_release_channel
  }

  ip_allocation_policy {
    cluster_secondary_range_name  = "${local.name}-pods"
    services_secondary_range_name = "${local.name}-services"
  }

  private_cluster_config {
    enable_private_nodes    = true
    enable_private_endpoint = false
    master_ipv4_cidr_block  = var.master_cidr

    master_global_access_config {
      enabled = false
    }
  }

  dynamic "master_authorized_networks_config" {
    for_each = length(var.authorized_networks) > 0 ? [1] : []
    content {
      dynamic "cidr_blocks" {
        for_each = var.authorized_networks
        content {
          cidr_block   = cidr_blocks.value.cidr_block
          display_name = cidr_blocks.value.display_name
        }
      }
    }
  }

  /*
   * Workload Identity: بديل IRSA. الـ Pod يحمل حساب خدمة Kubernetes مربوطًا
   * بحساب خدمة Google، فيحصل على رمز قصير العمر تلقائيًا. لا مفتاح JSON
   * يُخزَّن ولا يُدوَّر ولا يُسرَّب.
   */
  workload_identity_config {
    workload_pool = "${var.project_id}.svc.id.goog"
  }

  # يمنع الـ Pod من انتحال هوية العقدة عبر خادم البيانات الوصفية
  node_config {
    workload_metadata_config {
      mode = "GKE_METADATA"
    }
  }

  network_policy {
    enabled  = true
    provider = "CALICO"
  }

  addons_config {
    http_load_balancing {
      disabled = false
    }
    horizontal_pod_autoscaling {
      disabled = false
    }
    gcs_fuse_csi_driver_config {
      enabled = true
    }
    gce_persistent_disk_csi_driver_config {
      enabled = true
    }
  }

  database_encryption {
    state    = "ENCRYPTED"
    key_name = google_kms_crypto_key.gke_etcd.id
  }

  /*
   * التوفير التلقائي للعقد — بديل Karpenter. بدلًا من حصر أنفسنا في شكل آلة
   * واحد اخترناه مسبقًا، يُنشئ GKE مجمّعًا بالشكل المناسب للـ Pod المعلّق.
   */
  dynamic "cluster_autoscaling" {
    for_each = var.enable_node_auto_provisioning ? [1] : []
    content {
      enabled = true

      resource_limits {
        resource_type = "cpu"
        minimum       = 1
        maximum       = var.nap_max_cpu
      }

      resource_limits {
        resource_type = "memory"
        minimum       = 1
        maximum       = var.nap_max_memory_gb
      }

      auto_provisioning_defaults {
        service_account = google_service_account.gke_nodes.email
        disk_size       = var.node_disk_size_gb
        disk_type       = "pd-balanced"

        oauth_scopes = ["https://www.googleapis.com/auth/cloud-platform"]

        management {
          auto_repair  = true
          auto_upgrade = true
        }

        shielded_instance_config {
          enable_secure_boot          = true
          enable_integrity_monitoring = true
        }
      }
    }
  }

  maintenance_policy {
    recurring_window {
      # نافذة صيانة بعد منتصف الليل بتوقيت مصر — أهدأ ساعات المتجر
      start_time = "2026-01-01T22:00:00Z"
      end_time   = "2026-01-02T04:00:00Z"
      recurrence = "FREQ=WEEKLY;BYDAY=TU,WE,TH"
    }
  }

  logging_config {
    enable_components = ["SYSTEM_COMPONENTS", "WORKLOADS"]
  }

  monitoring_config {
    enable_components = ["SYSTEM_COMPONENTS"]

    managed_prometheus {
      enabled = true
    }
  }

  cost_management_config {
    enabled = true
  }

  lifecycle {
    ignore_changes = [node_config]
  }

  depends_on = [google_service_networking_connection.psa]
}

# ------------------------------------------------------------ مجمّعات العقد

/*
 * مجمّعان مقصودان: الحالة الثابتة (OpenSearch، أي StatefulSet) لا تتحمّل
 * الإخلاء المفاجئ، والحالة العابرة تتحمّله مقابل خصم كبير.
 */
resource "google_container_node_pool" "general" {
  name     = "general"
  cluster  = google_container_cluster.main.id
  location = var.region

  initial_node_count = var.node_count

  autoscaling {
    min_node_count = var.node_min_count
    max_node_count = var.node_max_count
  }

  management {
    auto_repair  = true
    auto_upgrade = true
  }

  upgrade_settings {
    max_surge       = 1
    max_unavailable = 0
  }

  node_config {
    machine_type = var.node_machine_type
    disk_size_gb = var.node_disk_size_gb
    disk_type    = "pd-balanced"

    service_account = google_service_account.gke_nodes.email
    oauth_scopes    = ["https://www.googleapis.com/auth/cloud-platform"]

    tags   = ["${local.name}-node"]
    labels = merge(local.labels, { pool = "general" })

    workload_metadata_config {
      mode = "GKE_METADATA"
    }

    shielded_instance_config {
      enable_secure_boot          = true
      enable_integrity_monitoring = true
    }

    metadata = {
      disable-legacy-endpoints = "true"
    }
  }
}

resource "google_container_node_pool" "spot" {
  count = var.enable_spot ? 1 : 0

  name     = "spot"
  cluster  = google_container_cluster.main.id
  location = var.region

  initial_node_count = 0

  autoscaling {
    min_node_count = 0
    max_node_count = var.node_max_count
  }

  management {
    auto_repair  = true
    auto_upgrade = true
  }

  node_config {
    machine_type = var.node_machine_type
    disk_size_gb = var.node_disk_size_gb
    disk_type    = "pd-balanced"
    spot         = true

    service_account = google_service_account.gke_nodes.email
    oauth_scopes    = ["https://www.googleapis.com/auth/cloud-platform"]

    tags   = ["${local.name}-node"]
    labels = merge(local.labels, { pool = "spot" })

    /*
     * الوسم يجبر الأحمال على إعلان تحمّلها للإخلاء صراحةً. بدونه قد يهبط
     * StatefulSet هنا ويفقد بياناته عند أول إخلاء.
     */
    taint {
      key    = "cloud.google.com/gke-spot"
      value  = "true"
      effect = "NO_SCHEDULE"
    }

    workload_metadata_config {
      mode = "GKE_METADATA"
    }

    shielded_instance_config {
      enable_secure_boot          = true
      enable_integrity_monitoring = true
    }

    metadata = {
      disable-legacy-endpoints = "true"
    }
  }
}

# ------------------------------------------------------- ربط Workload Identity

/*
 * حساب خدمة Google لكل خدمة تحتاج الوصول لموارد سحابية، مربوط بحساب خدمة
 * Kubernetes في مساحة الأسماء topchoice.
 */
resource "google_service_account" "workload" {
  for_each = local.workload_identity_services

  account_id   = each.value
  display_name = "حمل ${each.key}"
  description  = "هوية ${each.key} — مربوطة بحساب خدمة Kubernetes بنفس الاسم"
}

/*
 * الربط في اتجاهين: هنا نسمح لحساب Kubernetes بانتحال حساب Google، وفي
 * infra/k8s/base/03-serviceaccounts.yaml يشير حساب Kubernetes إليه بتعليق
 * iam.gke.io/gcp-service-account. الطرفان يجب أن يتطابقا حرفيًا.
 */
resource "google_service_account_iam_member" "workload_identity" {
  for_each = local.workload_identity_services

  service_account_id = google_service_account.workload[each.key].name
  role               = "roles/iam.workloadIdentityUser"
  member             = "serviceAccount:${var.project_id}.svc.id.goog[${var.project_name}/${each.key}]"
}
