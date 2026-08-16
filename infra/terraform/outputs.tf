# ============================================================================
#  المخرجات — تُستهلك من CI/CD وسكربتات النشر
# ============================================================================

output "cluster_name" {
  description = "اسم عنقود EKS"
  value       = module.eks.cluster_name
}

output "cluster_endpoint" {
  value = module.eks.cluster_endpoint
}

output "kubeconfig_command" {
  description = "أمر ربط kubectl بالعنقود"
  value       = "aws eks update-kubeconfig --name ${module.eks.cluster_name} --region ${var.aws_region}"
}

output "ecr_registry" {
  description = "عنوان مسجّل ECR"
  value       = "${data.aws_caller_identity.current.account_id}.dkr.ecr.${var.aws_region}.amazonaws.com"
}

output "ecr_repositories" {
  value = { for k, v in aws_ecr_repository.services : k => v.repository_url }
}

# ------------------------------------------------------------------- data

output "aurora_writer_endpoint" {
  value = aws_rds_cluster.main.endpoint
}

output "aurora_reader_endpoint" {
  description = "استخدمه لكل الاستعلامات القرائية لتخفيف الحمل عن الكاتب"
  value       = aws_rds_cluster.main.reader_endpoint
}

output "rds_proxy_endpoint" {
  description = "نقطة الاتصال الموصى بها للتطبيقات (تجميع اتصالات + تحويل سلس)"
  value       = aws_db_proxy.main.endpoint
}

output "documentdb_endpoint" {
  value = aws_docdb_cluster.main.endpoint
}

output "redis_configuration_endpoint" {
  value = aws_elasticache_replication_group.main.configuration_endpoint_address
}

output "msk_bootstrap_brokers_iam" {
  description = "عناوين Kafka بمصادقة IAM (المستخدمة من الخدمات)"
  value       = aws_msk_cluster.main.bootstrap_brokers_sasl_iam
}

output "opensearch_endpoint" {
  value = aws_opensearch_domain.main.endpoint
}

# ------------------------------------------------------------------- edge

output "cloudfront_domain" {
  value = aws_cloudfront_distribution.main.domain_name
}

output "cloudfront_distribution_id" {
  description = "لازم لإبطال الكاش بعد النشر"
  value       = aws_cloudfront_distribution.main.id
}

output "media_bucket" {
  value = aws_s3_bucket.media.bucket
}

output "site_url" {
  value = var.domain_name != "" ? "https://${var.domain_name}" : "https://${aws_cloudfront_distribution.main.domain_name}"
}

# ------------------------------------------------------------------- iam

output "app_irsa_role_arn" {
  description = "يُشار إليه في annotation الخاص بالـ ServiceAccount"
  value       = module.app_irsa.iam_role_arn
}

output "external_secrets_role_arn" {
  value = module.external_secrets_irsa.iam_role_arn
}

output "lb_controller_role_arn" {
  value = module.lb_controller_irsa.iam_role_arn
}

output "secret_arns" {
  description = "أسرار قواعد البيانات — تُقرأ عبر External Secrets Operator"
  value = {
    aurora     = aws_secretsmanager_secret.aurora.arn
    documentdb = aws_secretsmanager_secret.documentdb.arn
    redis      = aws_secretsmanager_secret.redis.arn
  }
}

output "next_steps" {
  value = <<-EOT

    البنية التحتية جاهزة. الخطوات التالية:

      1) اربط kubectl:
         aws eks update-kubeconfig --name ${module.eks.cluster_name} --region ${var.aws_region}

      2) ثبّت مكوّنات العنقود (Load Balancer Controller، External Secrets، Karpenter):
         ./scripts/bootstrap-cluster.sh

      3) ابنِ الصور وارفعها:
         make images REGISTRY=${data.aws_caller_identity.current.account_id}.dkr.ecr.${var.aws_region}.amazonaws.com TAG=v1.0.0

      4) انشر:
         kubectl apply -k infra/k8s/overlays/${var.environment}

  EOT
}
