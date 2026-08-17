#!/bin/bash
# ============================================================================
#  تهيئة موارد AWS المحاكاة في LocalStack.
#  نفس الموارد تُنشأ في AWS الحقيقية عبر Terraform (infra/terraform).
# ============================================================================
set -euo pipefail

REGION="${AWS_REGION:-me-south-1}"
BUCKET="${S3_MEDIA_BUCKET:-topchoice-media-local}"

echo "==> creating S3 bucket ${BUCKET}"
awslocal s3api create-bucket \
  --bucket "${BUCKET}" \
  --region "${REGION}" \
  --create-bucket-configuration LocationConstraint="${REGION}" 2>/dev/null || true

# وصول عام للقراءة يحاكي التوزيع عبر CloudFront
awslocal s3api put-bucket-policy --bucket "${BUCKET}" --policy "{
  \"Version\": \"2012-10-17\",
  \"Statement\": [{
    \"Sid\": \"PublicReadForCdn\",
    \"Effect\": \"Allow\",
    \"Principal\": \"*\",
    \"Action\": \"s3:GetObject\",
    \"Resource\": \"arn:aws:s3:::${BUCKET}/*\"
  }]
}" 2>/dev/null || true

echo "==> creating SNS topic"
awslocal sns create-topic --name topchoice-notifications --region "${REGION}" >/dev/null

echo "==> creating SQS queues (with DLQs)"
for q in topchoice-notifications topchoice-order-events topchoice-analytics; do
  awslocal sqs create-queue --queue-name "${q}-dlq" --region "${REGION}" >/dev/null
  awslocal sqs create-queue --queue-name "${q}" --region "${REGION}" >/dev/null
done

echo "==> creating DynamoDB tables"
awslocal dynamodb create-table \
  --table-name topchoice-idempotency \
  --attribute-definitions AttributeName=key,AttributeType=S \
  --key-schema AttributeName=key,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --region "${REGION}" >/dev/null 2>&1 || true

awslocal dynamodb create-table \
  --table-name topchoice-sessions \
  --attribute-definitions AttributeName=sid,AttributeType=S \
  --key-schema AttributeName=sid,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --region "${REGION}" >/dev/null 2>&1 || true

echo "==> creating secrets"
awslocal secretsmanager create-secret \
  --name topchoice/local/jwt \
  --secret-string '{"secret":"local-dev-only-change-me-9f2b7c1d4e6a8b0c2d4e6f8a0b2c4d6e"}' \
  --region "${REGION}" >/dev/null 2>&1 || true

echo "localstack resources ready"
