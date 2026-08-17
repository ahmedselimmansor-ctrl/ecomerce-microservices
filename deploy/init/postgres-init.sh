#!/bin/bash
# ============================================================================
#  قاعدة منفصلة لكل خدمة — database-per-service.
#
#  محليًا نستخدم نسخة PostgreSQL واحدة توفيرًا للموارد، لكن الفصل المنطقي
#  محفوظ: لا خدمة تستطيع الوصول لجداول خدمة أخرى. في الإنتاج على AWS كل
#  قاعدة تصبح عنقود Aurora مستقلًا بصلاحيات IAM خاصة به.
# ============================================================================
set -euo pipefail

for db in topchoice_identity topchoice_order topchoice_payment topchoice_inventory; do
  echo "creating database ${db}"
  psql -v ON_ERROR_STOP=1 --username "${POSTGRES_USER}" --dbname postgres <<-EOSQL
    SELECT 'CREATE DATABASE ${db}'
    WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '${db}')\gexec
EOSQL

  # الامتدادات تُنشأ داخل كل قاعدة على حدة
  psql -v ON_ERROR_STOP=1 --username "${POSTGRES_USER}" --dbname "${db}" <<-EOSQL
    CREATE EXTENSION IF NOT EXISTS "pgcrypto";
    CREATE EXTENSION IF NOT EXISTS "citext";
EOSQL
done

echo "all service databases ready"
