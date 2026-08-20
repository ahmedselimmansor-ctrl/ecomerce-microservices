# ============================================================================
#  الشبكة
#
#  الفرق البنيوي عن AWS: في Google Cloud الشبكة عالمية والشبكات الفرعية إقليمية،
#  فلا نُنشئ subnet لكل نطاق توفر. شبكة فرعية واحدة تغطي المنطقة كلها، وGKE
#  يوزّع العقد على النطاقات الفرعية داخلها. هذا يلغي فئة كاملة من أخطاء
#  «نسيت subnet في az-c» التي كانت شائعة في تصميم AWS.
# ============================================================================

resource "google_compute_network" "vpc" {
  name                    = local.name
  auto_create_subnetworks = false
  routing_mode            = "REGIONAL"

  description = "شبكة ${local.name} — شبكات فرعية مخصّصة لا تلقائية"
}

/*
 * النطاقات الثانوية هي جوهر شبكات GKE الأصلية (VPC-native): الـ Pod يأخذ عنوانًا
 * حقيقيًا من الشبكة لا عنوانًا مُخفى خلف overlay. النتيجة أن موازن الحمل يصل
 * للـ Pod مباشرة بلا قفزة إضافية، وأن سياسات الجدار الناري تراه.
 */
resource "google_compute_subnetwork" "gke" {
  name                     = "${local.name}-gke"
  ip_cidr_range            = var.subnet_cidr
  region                   = var.region
  network                  = google_compute_network.vpc.id
  private_ip_google_access = true

  secondary_ip_range {
    range_name    = "${local.name}-pods"
    ip_cidr_range = var.pods_cidr
  }

  secondary_ip_range {
    range_name    = "${local.name}-services"
    ip_cidr_range = var.services_cidr
  }

  log_config {
    aggregation_interval = "INTERVAL_10_MIN"
    flow_sampling        = 0.5
    metadata             = "INCLUDE_ALL_METADATA"
  }
}

# --------------------------------------------------------------- الخروج للإنترنت

/*
 * العقد بلا عناوين عامة، فتحتاج Cloud NAT للوصول لـ Artifact Registry وحزم npm
 * وغيرها. تخصيص المنافذ تلقائي: التخصيص الثابت ينفد صامتًا تحت الحمل ويظهر
 * كأخطاء اتصال عشوائية يصعب تشخيصها.
 */
resource "google_compute_router" "router" {
  name    = "${local.name}-router"
  region  = var.region
  network = google_compute_network.vpc.id
}

resource "google_compute_router_nat" "nat" {
  name   = "${local.name}-nat"
  router = google_compute_router.router.name
  region = var.region

  nat_ip_allocate_option             = "AUTO_ONLY"
  source_subnetwork_ip_ranges_to_nat = "ALL_SUBNETWORKS_ALL_IP_RANGES"

  enable_dynamic_port_allocation = true
  min_ports_per_vm               = 64
  max_ports_per_vm               = 2048

  log_config {
    enable = true
    filter = "ERRORS_ONLY"
  }
}

# ------------------------------------------------- الوصول الخاص للخدمات المُدارة

/*
 * Private Service Access: نحجز نطاقًا من عناويننا ونُهديه لشبكة Google، فتضع
 * فيها Cloud SQL و Memorystore. النتيجة أن قواعد البيانات لا تملك عنوانًا عامًا
 * إطلاقًا — لا جدار ناري نعتمد عليه، بل غياب المسار أصلًا.
 */
resource "google_compute_global_address" "psa" {
  name          = "${local.name}-psa"
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = 16
  network       = google_compute_network.vpc.id
}

resource "google_service_networking_connection" "psa" {
  network                 = google_compute_network.vpc.id
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.psa.name]

  # بدونه يبقى النطاق محجوزًا بعد الهدم ويمنع إعادة الإنشاء
  deletion_policy = "ABANDON"
}

# ----------------------------------------------- MongoDB Atlas عبر PSC

/*
 * Atlas ليست خدمة Google، فلا يصلها Private Service Access. نصل إليها عبر
 * Private Service Connect: نقطة اتصال في شبكتنا تُوجَّه إلى مرفق خدمة تعطينا
 * إياه Atlas. حتى تُنشئ عنقود Atlas تبقى القائمة فارغة ولا يُنشأ شيء.
 */
resource "google_compute_address" "mongodb_psc" {
  count = length(var.mongodb_atlas_service_attachments)

  name         = "${local.name}-mongodb-psc-${count.index}"
  subnetwork   = google_compute_subnetwork.gke.id
  address_type = "INTERNAL"
  region       = var.region
}

resource "google_compute_forwarding_rule" "mongodb_psc" {
  count = length(var.mongodb_atlas_service_attachments)

  name                  = "${local.name}-mongodb-psc-${count.index}"
  region                = var.region
  network               = google_compute_network.vpc.id
  subnetwork            = google_compute_subnetwork.gke.id
  ip_address            = google_compute_address.mongodb_psc[count.index].id
  target                = var.mongodb_atlas_service_attachments[count.index]
  load_balancing_scheme = ""
}

# ------------------------------------------------------------- الجدار الناري

/*
 * GKE يُنشئ قواعده الخاصة تلقائيًا. ما نضيفه هنا هو ما لا يُنشئه:
 * فحوص الصحة من موازن الحمل، ومنفذ webhook الذي يحتاجه مستوى التحكّم.
 */
resource "google_compute_firewall" "health_checks" {
  name    = "${local.name}-allow-health-checks"
  network = google_compute_network.vpc.name

  description = "نطاقات فاحصي الصحة في Google — ثابتة وموثّقة"

  allow {
    protocol = "tcp"
  }

  source_ranges = ["35.191.0.0/16", "130.211.0.0/22"]
  target_tags   = ["${local.name}-node"]
}

resource "google_compute_firewall" "master_webhooks" {
  name    = "${local.name}-allow-master-webhooks"
  network = google_compute_network.vpc.name

  description = <<-EOT
    مستوى التحكّم يفتح افتراضيًا 443 و10250 فقط. أي admission webhook يستمع
    على منفذ آخر (مثل 8443 و9443 في cert-manager و External Secrets) يفشل
    بمهلة غامضة بلا هذه القاعدة.
  EOT

  allow {
    protocol = "tcp"
    ports    = ["8443", "9443", "15017"]
  }

  source_ranges = [var.master_cidr]
  target_tags   = ["${local.name}-node"]
}

resource "google_compute_firewall" "deny_egress_metadata" {
  name      = "${local.name}-deny-legacy-metadata"
  network   = google_compute_network.vpc.name
  direction = "EGRESS"
  priority  = 900

  description = "خادم البيانات الوصفية القديم يسرّب رموز حساب الخدمة بلا ترويسة"

  deny {
    protocol = "tcp"
    ports    = ["80"]
  }

  destination_ranges = ["169.254.169.254/32"]
  target_tags        = ["${local.name}-node"]
}
