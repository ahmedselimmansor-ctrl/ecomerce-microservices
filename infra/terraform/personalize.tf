# ============================================================================
#  Amazon Personalize — محرك التوصيات
#
#  ملاحظة مهمة: مزوّد AWS لا يغطي موارد Personalize بالكامل (dataset groups،
#  solutions، campaigns). ننشئ هنا ما يمكن إنشاؤه تصريحيًا — التخزين والأدوار
#  والتدفق — ونترك إنشاء الحملات لسكربت CLI مرفق، لأن التدريب عملية طويلة
#  (ساعات) ولا تناسب دورة حياة Terraform.
# ============================================================================

resource "aws_s3_bucket" "personalize" {
  count = var.enable_personalize ? 1 : 0

  bucket = "${local.name}-personalize-${data.aws_caller_identity.current.account_id}"
  tags   = { Name = "${local.name}-personalize" }
}

resource "aws_s3_bucket_public_access_block" "personalize" {
  count = var.enable_personalize ? 1 : 0

  bucket                  = aws_s3_bucket.personalize[0].id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "personalize" {
  count = var.enable_personalize ? 1 : 0

  bucket = aws_s3_bucket.personalize[0].id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.app.arn
    }
  }
}

# Personalize يحتاج قراءة بيانات التدريب من S3
resource "aws_iam_role" "personalize" {
  count = var.enable_personalize ? 1 : 0

  name = "${local.name}-personalize"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "personalize.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "personalize" {
  count = var.enable_personalize ? 1 : 0

  name = "${local.name}-personalize"
  role = aws_iam_role.personalize[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["s3:GetObject", "s3:ListBucket", "s3:PutObject"]
        Resource = [aws_s3_bucket.personalize[0].arn, "${aws_s3_bucket.personalize[0].arn}/*"]
      },
      {
        Effect   = "Allow"
        Action   = ["kms:Decrypt", "kms:GenerateDataKey"]
        Resource = aws_kms_key.app.arn
      },
    ]
  })
}

/*
 * Kinesis Firehose ينقل تدفق تفاعلات المستخدمين إلى S3 لإعادة تدريب النموذج.
 * التدريب لا يتم على البيانات اللحظية بل على تجميعة يومية، فالـ buffering هنا
 * مقصود: تقليل عدد الملفات الصغيرة يقلّل تكلفة التدريب وزمنه.
 */
resource "aws_kinesis_firehose_delivery_stream" "interactions" {
  count = var.enable_personalize ? 1 : 0

  name        = "${local.name}-interactions"
  destination = "extended_s3"

  extended_s3_configuration {
    role_arn            = aws_iam_role.firehose[0].arn
    bucket_arn          = aws_s3_bucket.personalize[0].arn
    prefix              = "interactions/dt=!{timestamp:yyyy-MM-dd}/"
    error_output_prefix = "errors/!{firehose:error-output-type}/dt=!{timestamp:yyyy-MM-dd}/"

    buffering_size     = 64
    buffering_interval = 300
    compression_format = "GZIP"

    cloudwatch_logging_options {
      enabled         = true
      log_group_name  = "/aws/firehose/${local.name}"
      log_stream_name = "s3-delivery"
    }
  }

  tags = { Name = "${local.name}-interactions" }
}

resource "aws_iam_role" "firehose" {
  count = var.enable_personalize ? 1 : 0

  name = "${local.name}-firehose"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "firehose.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "firehose" {
  count = var.enable_personalize ? 1 : 0

  name = "${local.name}-firehose"
  role = aws_iam_role.firehose[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:AbortMultipartUpload",
          "s3:GetBucketLocation",
          "s3:GetObject",
          "s3:ListBucket",
          "s3:ListBucketMultipartUploads",
          "s3:PutObject",
        ]
        Resource = [aws_s3_bucket.personalize[0].arn, "${aws_s3_bucket.personalize[0].arn}/*"]
      },
      {
        Effect   = "Allow"
        Action   = ["kms:GenerateDataKey", "kms:Decrypt"]
        Resource = aws_kms_key.app.arn
      },
      {
        Effect   = "Allow"
        Action   = ["logs:PutLogEvents"]
        Resource = "arn:aws:logs:${var.aws_region}:*:log-group:/aws/firehose/${local.name}:*"
      },
    ]
  })
}
