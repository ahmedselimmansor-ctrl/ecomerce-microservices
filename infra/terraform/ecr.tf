# ============================================================================
#  مستودعات صور الحاويات
# ============================================================================

locals {
  services = [
    "api-gateway",
    "identity-service",
    "catalog-service",
    "inventory-service",
    "order-service",
    "payment-service",
    "cart-service",
    "notification-service",
    "search-service",
    "recommendation-service",
    "web",
  ]
}

resource "aws_ecr_repository" "services" {
  for_each = toset(local.services)

  name = "${var.project}/${each.value}"

  # وسوم غير قابلة للتعديل: لا يمكن دفع صورة مختلفة بنفس الوسم.
  # بدون هذا يصبح "v1.2.3" غير معناه ويستحيل تتبّع ما يعمل فعلًا في الإنتاج.
  image_tag_mutability = "IMMUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  encryption_configuration {
    encryption_type = "KMS"
    kms_key         = aws_kms_key.app.arn
  }

  tags = { Name = "${var.project}/${each.value}" }
}

resource "aws_ecr_lifecycle_policy" "services" {
  for_each = aws_ecr_repository.services

  repository = each.value.name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Keep the last 30 release images"
        selection = {
          tagStatus     = "tagged"
          tagPrefixList = ["v", "release-"]
          countType     = "imageCountMoreThan"
          countNumber   = 30
        }
        action = { type = "expire" }
      },
      {
        rulePriority = 2
        description  = "Expire untagged images after 7 days"
        selection = {
          tagStatus   = "untagged"
          countType   = "sinceImagePushed"
          countUnit   = "days"
          countNumber = 7
        }
        action = { type = "expire" }
      },
      {
        rulePriority = 3
        description  = "Keep only 10 recent dev/PR images"
        selection = {
          tagStatus     = "tagged"
          tagPrefixList = ["dev-", "pr-"]
          countType     = "imageCountMoreThan"
          countNumber   = 10
        }
        action = { type = "expire" }
      },
    ]
  })
}
