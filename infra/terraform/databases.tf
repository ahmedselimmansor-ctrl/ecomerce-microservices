# ============================================================================
#  طبقة البيانات: Aurora PostgreSQL · DocumentDB · ElastiCache · DynamoDB
#  كلها في الشبكات المعزولة (data subnets) بلا مسار خروج للإنترنت.
# ============================================================================

resource "aws_db_subnet_group" "main" {
  name       = "${local.name}-db"
  subnet_ids = aws_subnet.data[*].id
  tags       = { Name = "${local.name}-db-subnets" }
}

# ------------------------------------------------------------ security groups

resource "aws_security_group" "aurora" {
  name        = "${local.name}-aurora"
  description = "PostgreSQL access from EKS nodes only"
  vpc_id      = aws_vpc.main.id

  ingress {
    description     = "PostgreSQL from EKS"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [module.eks.node_security_group_id]
  }

  tags = { Name = "${local.name}-aurora-sg" }
}

resource "aws_security_group" "documentdb" {
  name        = "${local.name}-documentdb"
  description = "DocumentDB access from EKS nodes only"
  vpc_id      = aws_vpc.main.id

  ingress {
    description     = "MongoDB wire protocol from EKS"
    from_port       = 27017
    to_port         = 27017
    protocol        = "tcp"
    security_groups = [module.eks.node_security_group_id]
  }

  tags = { Name = "${local.name}-docdb-sg" }
}

resource "aws_security_group" "redis" {
  name        = "${local.name}-redis"
  description = "Redis access from EKS nodes only"
  vpc_id      = aws_vpc.main.id

  ingress {
    description     = "Redis from EKS"
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [module.eks.node_security_group_id]
  }

  tags = { Name = "${local.name}-redis-sg" }
}

# --------------------------------------------------- Aurora PostgreSQL

resource "random_password" "aurora" {
  length  = 32
  special = true
  # هذه المحارف تكسر سلاسل الاتصال أو ترفضها RDS
  override_special = "!#$%&*()-_=+[]{}<>:?"
}

resource "aws_secretsmanager_secret" "aurora" {
  name       = "${local.name}/aurora/master"
  kms_key_id = aws_kms_key.app.arn

  # في dev نسمح بالحذف الفوري لتفادي تعارض الأسماء عند إعادة الإنشاء
  recovery_window_in_days = var.environment == "prod" ? 30 : 0
}

resource "aws_secretsmanager_secret_version" "aurora" {
  secret_id = aws_secretsmanager_secret.aurora.id

  secret_string = jsonencode({
    username = "topchoice_admin"
    password = random_password.aurora.result
    engine   = "postgres"
    host     = aws_rds_cluster.main.endpoint
    reader   = aws_rds_cluster.main.reader_endpoint
    port     = 5432
  })
}

resource "aws_rds_cluster" "main" {
  cluster_identifier = "${local.name}-aurora"
  engine             = "aurora-postgresql"
  engine_version     = "16.4"
  engine_mode        = "provisioned"

  database_name   = "topchoice"
  master_username = "topchoice_admin"
  master_password = random_password.aurora.result

  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.aurora.id]

  storage_encrypted = true
  kms_key_id        = aws_kms_key.app.arn

  backup_retention_period      = var.aurora_backup_retention_days
  preferred_backup_window      = "02:00-03:00"
  preferred_maintenance_window = "sat:03:30-sat:04:30"
  copy_tags_to_snapshot        = true

  # حماية من الحذف العرضي في الإنتاج
  deletion_protection       = var.environment == "prod"
  skip_final_snapshot       = var.environment != "prod"
  final_snapshot_identifier = var.environment == "prod" ? "${local.name}-final-${formatdate("YYYYMMDDhhmm", timestamp())}" : null

  enabled_cloudwatch_logs_exports = ["postgresql"]

  lifecycle {
    ignore_changes = [final_snapshot_identifier, master_password]
  }

  tags = { Name = "${local.name}-aurora" }
}

resource "aws_rds_cluster_instance" "main" {
  # الكاتب + النسخ القارئة
  count = 1 + var.aurora_replica_count

  identifier         = "${local.name}-aurora-${count.index}"
  cluster_identifier = aws_rds_cluster.main.id
  instance_class     = var.aurora_instance_class
  engine             = aws_rds_cluster.main.engine
  engine_version     = aws_rds_cluster.main.engine_version

  performance_insights_enabled = true
  monitoring_interval          = 30
  monitoring_role_arn          = aws_iam_role.rds_monitoring.arn

  # الترقية أولًا للقارئات ثم الكاتب: يقلّل زمن التحويل عند الترقية
  promotion_tier = count.index

  tags = { Name = "${local.name}-aurora-${count.index}" }
}

resource "aws_iam_role" "rds_monitoring" {
  name = "${local.name}-rds-monitoring"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "monitoring.rds.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "rds_monitoring" {
  role       = aws_iam_role.rds_monitoring.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonRDSEnhancedMonitoringRole"
}

/*
 * RDS Proxy ضروري لا اختياري هنا: كل pod يفتح connection pool خاصًا به،
 * فمع 40 pod × 20 اتصالًا نتجاوز حد Aurora بسهولة. الـ Proxy يوحّد التجميع
 * ويتحمّل تحويل الكاتب دون قطع اتصالات التطبيق.
 */
resource "aws_db_proxy" "main" {
  name                   = "${local.name}-proxy"
  engine_family          = "POSTGRESQL"
  role_arn               = aws_iam_role.rds_proxy.arn
  vpc_subnet_ids         = aws_subnet.data[*].id
  vpc_security_group_ids = [aws_security_group.aurora.id]
  require_tls            = true
  idle_client_timeout    = 1800

  auth {
    auth_scheme = "SECRETS"
    iam_auth    = "DISABLED"
    secret_arn  = aws_secretsmanager_secret.aurora.arn
  }

  tags = { Name = "${local.name}-rds-proxy" }
}

resource "aws_db_proxy_default_target_group" "main" {
  db_proxy_name = aws_db_proxy.main.name

  connection_pool_config {
    max_connections_percent      = 90
    max_idle_connections_percent = 50
    connection_borrow_timeout    = 120
  }
}

resource "aws_db_proxy_target" "main" {
  db_cluster_identifier = aws_rds_cluster.main.id
  db_proxy_name         = aws_db_proxy.main.name
  target_group_name     = aws_db_proxy_default_target_group.main.name
}

resource "aws_iam_role" "rds_proxy" {
  name = "${local.name}-rds-proxy"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "rds.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "rds_proxy" {
  name = "${local.name}-rds-proxy"
  role = aws_iam_role.rds_proxy.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["secretsmanager:GetSecretValue"]
        Resource = aws_secretsmanager_secret.aurora.arn
      },
      {
        Effect   = "Allow"
        Action   = ["kms:Decrypt"]
        Resource = aws_kms_key.app.arn
        Condition = {
          StringEquals = { "kms:ViaService" = "secretsmanager.${var.aws_region}.amazonaws.com" }
        }
      },
    ]
  })
}

# ------------------------------------------------------------- DocumentDB

resource "random_password" "documentdb" {
  length           = 32
  special          = true
  override_special = "!#%*()-_=+[]{}<>:?"
}

resource "aws_secretsmanager_secret" "documentdb" {
  name                    = "${local.name}/documentdb/master"
  kms_key_id              = aws_kms_key.app.arn
  recovery_window_in_days = var.environment == "prod" ? 30 : 0
}

resource "aws_secretsmanager_secret_version" "documentdb" {
  secret_id = aws_secretsmanager_secret.documentdb.id

  secret_string = jsonencode({
    username = "topchoice_admin"
    password = random_password.documentdb.result
    host     = aws_docdb_cluster.main.endpoint
    reader   = aws_docdb_cluster.main.reader_endpoint
    port     = 27017
  })
}

resource "aws_docdb_subnet_group" "main" {
  name       = "${local.name}-docdb"
  subnet_ids = aws_subnet.data[*].id
}

resource "aws_docdb_cluster_parameter_group" "main" {
  family = "docdb5.0"
  name   = "${local.name}-docdb-params"

  # TLS إجباري — لا اتصال بلا تشفير حتى داخل الشبكة الخاصة
  parameter {
    name  = "tls"
    value = "enabled"
  }

  parameter {
    name  = "audit_logs"
    value = "enabled"
  }
}

resource "aws_docdb_cluster" "main" {
  cluster_identifier = "${local.name}-docdb"
  engine             = "docdb"
  engine_version     = "5.0.0"

  master_username = "topchoice_admin"
  master_password = random_password.documentdb.result

  db_subnet_group_name            = aws_docdb_subnet_group.main.name
  vpc_security_group_ids          = [aws_security_group.documentdb.id]
  db_cluster_parameter_group_name = aws_docdb_cluster_parameter_group.main.name

  storage_encrypted = true
  kms_key_id        = aws_kms_key.app.arn

  backup_retention_period      = var.aurora_backup_retention_days
  preferred_backup_window      = "02:00-03:00"
  preferred_maintenance_window = "sun:03:30-sun:04:30"

  deletion_protection = var.environment == "prod"
  skip_final_snapshot = var.environment != "prod"

  enabled_cloudwatch_logs_exports = ["audit", "profiler"]

  lifecycle {
    ignore_changes = [master_password]
  }

  tags = { Name = "${local.name}-docdb" }
}

resource "aws_docdb_cluster_instance" "main" {
  count = var.documentdb_instance_count

  identifier         = "${local.name}-docdb-${count.index}"
  cluster_identifier = aws_docdb_cluster.main.id
  instance_class     = var.documentdb_instance_class

  tags = { Name = "${local.name}-docdb-${count.index}" }
}

# --------------------------------------------------- ElastiCache for Redis

resource "aws_elasticache_subnet_group" "main" {
  name       = "${local.name}-redis"
  subnet_ids = aws_subnet.data[*].id
}

resource "random_password" "redis_auth" {
  length  = 48
  special = false # AUTH token في Redis لا يقبل كل المحارف الخاصة
}

resource "aws_secretsmanager_secret" "redis" {
  name                    = "${local.name}/redis/auth"
  kms_key_id              = aws_kms_key.app.arn
  recovery_window_in_days = var.environment == "prod" ? 30 : 0
}

resource "aws_secretsmanager_secret_version" "redis" {
  secret_id = aws_secretsmanager_secret.redis.id

  secret_string = jsonencode({
    auth_token = random_password.redis_auth.result
    host       = aws_elasticache_replication_group.main.configuration_endpoint_address
    port       = 6379
  })
}

resource "aws_elasticache_parameter_group" "main" {
  family = "redis7"
  name   = "${local.name}-redis-params"

  # الكاش يجب أن يطرد الأقدم لا أن يرفض الكتابة عند الامتلاء
  parameter {
    name  = "maxmemory-policy"
    value = "allkeys-lru"
  }
}

resource "aws_elasticache_replication_group" "main" {
  replication_group_id = "${local.name}-redis"
  description          = "Cart, sessions, cache and rate limiting for ${local.name}"

  engine         = "redis"
  engine_version = "7.1"
  node_type      = var.redis_node_type
  port           = 6379

  # cluster mode: التقسيم يسمح بالتوسع الأفقي بلا توقف
  num_node_groups         = var.redis_shards
  replicas_per_node_group = var.redis_replicas_per_shard

  automatic_failover_enabled = true
  multi_az_enabled           = true

  subnet_group_name    = aws_elasticache_subnet_group.main.name
  security_group_ids   = [aws_security_group.redis.id]
  parameter_group_name = aws_elasticache_parameter_group.main.name

  at_rest_encryption_enabled = true
  kms_key_id                 = aws_kms_key.app.arn
  transit_encryption_enabled = true
  auth_token                 = random_password.redis_auth.result

  snapshot_retention_limit = var.environment == "prod" ? 7 : 1
  snapshot_window          = "01:00-02:00"
  maintenance_window       = "sun:02:30-sun:03:30"

  apply_immediately = var.environment != "prod"

  lifecycle {
    ignore_changes = [auth_token]
  }

  tags = { Name = "${local.name}-redis" }
}

# ---------------------------------------------------------------- DynamoDB

resource "aws_dynamodb_table" "idempotency" {
  name         = "${local.name}-idempotency"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "key"

  attribute {
    name = "key"
    type = "S"
  }

  # الحذف التلقائي مجاني — لا نحتاج مهمة تنظيف
  ttl {
    attribute_name = "expiresAt"
    enabled        = true
  }

  server_side_encryption {
    enabled     = true
    kms_key_arn = aws_kms_key.app.arn
  }

  point_in_time_recovery {
    enabled = var.environment == "prod"
  }

  tags = { Name = "${local.name}-idempotency" }
}

resource "aws_dynamodb_table" "sessions" {
  name         = "${local.name}-sessions"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "sid"

  attribute {
    name = "sid"
    type = "S"
  }

  ttl {
    attribute_name = "expiresAt"
    enabled        = true
  }

  server_side_encryption {
    enabled     = true
    kms_key_arn = aws_kms_key.app.arn
  }

  tags = { Name = "${local.name}-sessions" }
}
