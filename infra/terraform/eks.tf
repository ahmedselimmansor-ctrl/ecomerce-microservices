# ============================================================================
#  Amazon EKS — عنقود الخدمات المصغّرة
# ============================================================================

module "eks" {
  source  = "terraform-aws-modules/eks/aws"
  version = "~> 20.31"

  cluster_name    = local.name
  cluster_version = var.kubernetes_version

  vpc_id     = aws_vpc.main.id
  subnet_ids = aws_subnet.private[*].id

  # عام لتسهيل الوصول الإداري؛ في الإنتاج قيّده بـ CIDR الشركة أو أغلقه
  # واستخدم SSM Session Manager
  cluster_endpoint_public_access       = true
  cluster_endpoint_public_access_cidrs = var.environment == "prod" ? [] : ["0.0.0.0/0"]
  cluster_endpoint_private_access      = true

  # تشفير الأسرار داخل etcd بمفتاح نديره نحن
  cluster_encryption_config = {
    provider_key_arn = aws_kms_key.eks.arn
    resources        = ["secrets"]
  }

  cluster_enabled_log_types = ["api", "audit", "authenticator"]

  # الوصول عبر IAM access entries — بديل aws-auth ConfigMap القديم
  authentication_mode                      = "API_AND_CONFIG_MAP"
  enable_cluster_creator_admin_permissions = true

  cluster_addons = {
    coredns = {
      most_recent = true
      configuration_values = jsonencode({
        # نسختان على الأقل: CoreDNS نقطة فشل حرجة لكل الخدمات
        replicaCount = 2
      })
    }
    kube-proxy = { most_recent = true }
    vpc-cni = {
      most_recent    = true
      before_compute = true
      configuration_values = jsonencode({
        env = {
          # تعيين مسبق لواجهات الشبكة: يقلّل زمن إقلاع الـ pod بشكل ملموس
          ENABLE_PREFIX_DELEGATION = "true"
          WARM_PREFIX_TARGET       = "1"
        }
      })
    }
    aws-ebs-csi-driver = {
      most_recent              = true
      service_account_role_arn = module.ebs_csi_irsa.iam_role_arn
    }
    eks-pod-identity-agent = { most_recent = true }
  }

  eks_managed_node_group_defaults = {
    ami_type       = "AL2023_ARM_64_STANDARD"
    instance_types = var.node_instance_types

    iam_role_additional_policies = {
      AmazonSSMManagedInstanceCore = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
    }

    block_device_mappings = {
      xvda = {
        device_name = "/dev/xvda"
        ebs = {
          volume_size           = 60
          volume_type           = "gp3"
          encrypted             = true
          delete_on_termination = true
        }
      }
    }
  }

  eks_managed_node_groups = {
    # مجموعة النظام: On-Demand فقط — لا نريد سحب Spot لـ CoreDNS أو Karpenter
    system = {
      name           = "system"
      instance_types = ["m7g.large"]
      capacity_type  = "ON_DEMAND"
      min_size       = 2
      max_size       = 4
      desired_size   = 2

      labels = { workload = "system" }

      taints = [{
        key    = "CriticalAddonsOnly"
        value  = "true"
        effect = "NO_SCHEDULE"
      }]
    }

    # أحمال التطبيق: يوسّعها Karpenter لاحقًا حسب الطلب
    apps = {
      name          = "apps"
      capacity_type = "ON_DEMAND"
      min_size      = var.node_min_size
      max_size      = var.node_max_size
      desired_size  = var.node_desired_size

      labels = { workload = "apps" }
    }
  }

  node_security_group_tags = {
    "karpenter.sh/discovery" = local.name
  }

  tags = { Name = local.name }
}

resource "aws_kms_key" "eks" {
  description             = "EKS secrets envelope encryption for ${local.name}"
  deletion_window_in_days = var.environment == "prod" ? 30 : 7
  enable_key_rotation     = true

  tags = { Name = "${local.name}-eks-kms" }
}

resource "aws_kms_alias" "eks" {
  name          = "alias/${local.name}-eks"
  target_key_id = aws_kms_key.eks.key_id
}

# ---------------------------------------------------------------- IRSA roles

# IRSA: كل ServiceAccount يحصل على دور IAM محدد الصلاحيات.
# لا مفاتيح وصول ثابتة داخل أي حاوية — وهذا أهم قرار أمني في المنصة.

module "ebs_csi_irsa" {
  source  = "terraform-aws-modules/iam/aws//modules/iam-role-for-service-accounts-eks"
  version = "~> 5.47"

  role_name             = "${local.name}-ebs-csi"
  attach_ebs_csi_policy = true

  oidc_providers = {
    main = {
      provider_arn               = module.eks.oidc_provider_arn
      namespace_service_accounts = ["kube-system:ebs-csi-controller-sa"]
    }
  }
}

module "lb_controller_irsa" {
  source  = "terraform-aws-modules/iam/aws//modules/iam-role-for-service-accounts-eks"
  version = "~> 5.47"

  role_name                              = "${local.name}-aws-lbc"
  attach_load_balancer_controller_policy = true

  oidc_providers = {
    main = {
      provider_arn               = module.eks.oidc_provider_arn
      namespace_service_accounts = ["kube-system:aws-load-balancer-controller"]
    }
  }
}

module "external_secrets_irsa" {
  source  = "terraform-aws-modules/iam/aws//modules/iam-role-for-service-accounts-eks"
  version = "~> 5.47"

  role_name                      = "${local.name}-external-secrets"
  attach_external_secrets_policy = true

  external_secrets_secrets_manager_arns = ["arn:aws:secretsmanager:${var.aws_region}:*:secret:${local.name}/*"]
  external_secrets_kms_key_arns         = [aws_kms_key.app.arn]

  oidc_providers = {
    main = {
      provider_arn               = module.eks.oidc_provider_arn
      namespace_service_accounts = ["external-secrets:external-secrets"]
    }
  }
}

# دور تطبيقي واحد لكل خدمة تحتاج AWS APIs
module "app_irsa" {
  source  = "terraform-aws-modules/iam/aws//modules/iam-role-for-service-accounts-eks"
  version = "~> 5.47"

  role_name = "${local.name}-app"

  role_policy_arns = {
    app = aws_iam_policy.app_runtime.arn
  }

  oidc_providers = {
    main = {
      provider_arn = module.eks.oidc_provider_arn
      namespace_service_accounts = [
        "noon:notification-service",
        "noon:recommendation-service",
        "noon:search-service",
        "noon:catalog-service",
      ]
    }
  }
}

resource "aws_iam_policy" "app_runtime" {
  name        = "${local.name}-app-runtime"
  description = "Least-privilege runtime permissions for noon services"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "MediaBucketAccess"
        Effect = "Allow"
        Action = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
        # الصلاحية على محتوى الـ bucket فقط، لا على الـ bucket نفسه
        Resource = "${aws_s3_bucket.media.arn}/*"
      },
      {
        Sid      = "MediaBucketList"
        Effect   = "Allow"
        Action   = ["s3:ListBucket"]
        Resource = aws_s3_bucket.media.arn
      },
      {
        Sid      = "Notifications"
        Effect   = "Allow"
        Action   = ["sns:Publish"]
        Resource = aws_sns_topic.notifications.arn
      },
      {
        Sid      = "TransactionalEmail"
        Effect   = "Allow"
        Action   = ["ses:SendEmail", "ses:SendRawEmail"]
        Resource = "*"
        Condition = {
          StringEquals = { "ses:FromAddress" = "noreply@${var.domain_name != "" ? var.domain_name : "example.com"}" }
        }
      },
      {
        Sid    = "PersonalizeInference"
        Effect = "Allow"
        Action = [
          "personalize:GetRecommendations",
          "personalize:GetPersonalizedRanking",
          "personalize:PutEvents",
        ]
        Resource = "*"
      },
      {
        Sid      = "IdempotencyAndSessions"
        Effect   = "Allow"
        Action   = ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem", "dynamodb:Query"]
        Resource = [aws_dynamodb_table.idempotency.arn, aws_dynamodb_table.sessions.arn]
      },
    ]
  })
}

resource "aws_kms_key" "app" {
  description             = "Application data encryption key for ${local.name}"
  deletion_window_in_days = var.environment == "prod" ? 30 : 7
  enable_key_rotation     = true

  tags = { Name = "${local.name}-app-kms" }
}

resource "aws_kms_alias" "app" {
  name          = "alias/${local.name}-app"
  target_key_id = aws_kms_key.app.key_id
}
