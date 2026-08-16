# ============================================================================
#  المراسلة والبحث: Amazon MSK · OpenSearch · SNS/SQS
# ============================================================================

resource "aws_security_group" "msk" {
  name        = "${local.name}-msk"
  description = "Kafka access from EKS nodes only"
  vpc_id      = aws_vpc.main.id

  ingress {
    description     = "Kafka TLS"
    from_port       = 9094
    to_port         = 9094
    protocol        = "tcp"
    security_groups = [module.eks.node_security_group_id]
  }

  ingress {
    description     = "Kafka IAM auth"
    from_port       = 9098
    to_port         = 9098
    protocol        = "tcp"
    security_groups = [module.eks.node_security_group_id]
  }

  tags = { Name = "${local.name}-msk-sg" }
}

resource "aws_cloudwatch_log_group" "msk" {
  name              = "/aws/msk/${local.name}"
  retention_in_days = var.environment == "prod" ? 30 : 7
}

resource "aws_msk_configuration" "main" {
  name           = "${local.name}-config"
  kafka_versions = ["3.6.0"]

  # الإعدادات هنا تحكم سلوك الأحداث في كل النظام
  server_properties = <<-PROPERTIES
    auto.create.topics.enable=false
    default.replication.factor=3
    min.insync.replicas=2
    num.partitions=6
    log.retention.hours=168
    unclean.leader.election.enable=false
    compression.type=producer
  PROPERTIES
}

/*
 * min.insync.replicas=2 مع acks=all في المنتجين يعني أن الحدث لا يُعتبر
 * منشورًا حتى تكتبه نسختان على الأقل — وهو ما يمنع فقدان أحداث الطلبات
 * عند سقوط broker. unclean.leader.election=false يمنع ترقية نسخة متأخرة
 * إلى قائد (وهو ما يعني فقدان بيانات صامتًا).
 */
resource "aws_msk_cluster" "main" {
  cluster_name           = local.name
  kafka_version          = "3.6.0"
  number_of_broker_nodes = var.msk_broker_count

  broker_node_group_info {
    instance_type   = var.msk_broker_instance_type
    client_subnets  = aws_subnet.data[*].id
    security_groups = [aws_security_group.msk.id]

    storage_info {
      ebs_storage_info {
        volume_size = var.msk_volume_size_gb

        provisioned_throughput {
          enabled           = var.environment == "prod"
          volume_throughput = var.environment == "prod" ? 250 : null
        }
      }
    }
  }

  configuration_info {
    arn      = aws_msk_configuration.main.arn
    revision = aws_msk_configuration.main.latest_revision
  }

  encryption_info {
    encryption_at_rest_kms_key_arn = aws_kms_key.app.arn

    encryption_in_transit {
      client_broker = "TLS"
      in_cluster    = true
    }
  }

  client_authentication {
    sasl {
      iam = true # مصادقة عبر IAM — لا كلمات مرور تُدار يدويًا
    }
  }

  open_monitoring {
    prometheus {
      jmx_exporter { enabled_in_broker = true }
      node_exporter { enabled_in_broker = true }
    }
  }

  logging_info {
    broker_logs {
      cloudwatch_logs {
        enabled   = true
        log_group = aws_cloudwatch_log_group.msk.name
      }
    }
  }

  tags = { Name = local.name }
}

# ------------------------------------------------------------- OpenSearch

resource "aws_security_group" "opensearch" {
  name        = "${local.name}-opensearch"
  description = "OpenSearch access from EKS nodes only"
  vpc_id      = aws_vpc.main.id

  ingress {
    description     = "HTTPS from EKS"
    from_port       = 443
    to_port         = 443
    protocol        = "tcp"
    security_groups = [module.eks.node_security_group_id]
  }

  tags = { Name = "${local.name}-opensearch-sg" }
}

resource "aws_opensearch_domain" "main" {
  domain_name    = local.name
  engine_version = "OpenSearch_2.17"

  cluster_config {
    instance_type  = var.opensearch_instance_type
    instance_count = var.opensearch_instance_count

    zone_awareness_enabled = var.opensearch_instance_count > 1

    dynamic "zone_awareness_config" {
      for_each = var.opensearch_instance_count > 1 ? [1] : []
      content {
        availability_zone_count = min(var.az_count, 3)
      }
    }

    # عُقد master مخصصة في الإنتاج: تفصل إدارة العنقود عن حمل الاستعلامات
    dedicated_master_enabled = var.environment == "prod"
    dedicated_master_type    = var.environment == "prod" ? "m6g.large.search" : null
    dedicated_master_count   = var.environment == "prod" ? 3 : null
  }

  ebs_options {
    ebs_enabled = true
    volume_type = "gp3"
    volume_size = 100
  }

  vpc_options {
    subnet_ids         = slice(aws_subnet.data[*].id, 0, min(var.opensearch_instance_count, var.az_count))
    security_group_ids = [aws_security_group.opensearch.id]
  }

  encrypt_at_rest {
    enabled    = true
    kms_key_id = aws_kms_key.app.arn
  }

  node_to_node_encryption { enabled = true }

  domain_endpoint_options {
    enforce_https       = true
    tls_security_policy = "Policy-Min-TLS-1-2-2019-07"
  }

  advanced_security_options {
    enabled                        = true
    internal_user_database_enabled = false
    # المصادقة عبر IAM/IRSA لا عبر مستخدم داخلي
    master_user_options {
      master_user_arn = module.app_irsa.iam_role_arn
    }
  }

  log_publishing_options {
    cloudwatch_log_group_arn = aws_cloudwatch_log_group.opensearch.arn
    log_type                 = "ES_APPLICATION_LOGS"
  }

  # سياسة الوصول: الدور التطبيقي فقط
  access_policies = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { AWS = module.app_irsa.iam_role_arn }
      Action    = "es:*"
      Resource  = "arn:aws:es:${var.aws_region}:*:domain/${local.name}/*"
    }]
  })

  tags = { Name = local.name }
}

resource "aws_cloudwatch_log_group" "opensearch" {
  name              = "/aws/opensearch/${local.name}"
  retention_in_days = var.environment == "prod" ? 30 : 7
}

resource "aws_cloudwatch_log_resource_policy" "opensearch" {
  policy_name = "${local.name}-opensearch-logs"

  policy_document = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "es.amazonaws.com" }
      Action    = ["logs:PutLogEvents", "logs:CreateLogStream"]
      Resource  = "${aws_cloudwatch_log_group.opensearch.arn}:*"
    }]
  })
}

# ------------------------------------------------------------- SNS & SQS

resource "aws_sns_topic" "notifications" {
  name              = "${local.name}-notifications"
  kms_master_key_id = aws_kms_key.app.id

  tags = { Name = "${local.name}-notifications" }
}

# طابور رسائل ميتة لكل طابور: عزل الرسائل السامّة بدل حجب المعالجة
resource "aws_sqs_queue" "dlq" {
  for_each = toset(["notifications", "order-events", "analytics"])

  name                      = "${local.name}-${each.value}-dlq"
  message_retention_seconds = 1209600 # 14 يومًا — أقصى مدة تسمح بها SQS
  kms_master_key_id         = aws_kms_key.app.id

  tags = { Name = "${local.name}-${each.value}-dlq" }
}

resource "aws_sqs_queue" "main" {
  for_each = toset(["notifications", "order-events", "analytics"])

  name                       = "${local.name}-${each.value}"
  visibility_timeout_seconds = 60
  message_retention_seconds  = 345600 # 4 أيام
  kms_master_key_id          = aws_kms_key.app.id

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.dlq[each.value].arn
    maxReceiveCount     = 5
  })

  tags = { Name = "${local.name}-${each.value}" }
}
