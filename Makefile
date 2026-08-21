SHELL := /bin/bash
COMPOSE := docker compose -f deploy/docker-compose.yml --env-file .env
TF := terraform -chdir=infra/terraform

.DEFAULT_GOAL := help

.PHONY: help
help: ## عرض الأوامر المتاحة
	@grep -hE '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

.env:
	@cp .env.example .env
	@# مفتاح عشوائي لكل بيئة محلية: نشر مفتاح في المستودع يعني أن كل من
	@# استنسخ المشروع يستطيع تزوير توكنات أي نشر نسي ضبط المتغيّر.
	@SECRET=$$(openssl rand -base64 48 2>/dev/null | tr -d '\n/+=' | head -c 64); \
	  if [ -z "$$SECRET" ]; then SECRET=$$(head -c 48 /dev/urandom | od -An -tx1 | tr -d ' \n'); fi; \
	  sed -i.bak "s|^JWT_SECRET=.*|JWT_SECRET=$$SECRET|" .env && rm -f .env.bak
	@echo "created .env from .env.example (JWT_SECRET generated)"

# ---------------------------------------------------------------- local dev

.PHONY: up
up: .env ## تشغيل المنصة كاملة محليًا
	$(COMPOSE) up -d --build
	@echo ""
	@echo "  Web            http://localhost:3000"
	@echo "  API Gateway    http://localhost:8080"
	@echo "  Kafka UI       http://localhost:8090"
	@echo "  OpenSearch     http://localhost:5601"
	@echo "  Mailpit        http://localhost:8025"

.PHONY: infra-up
infra-up: .env ## تشغيل البنية التحتية فقط (DBs, Kafka, Redis...)
	$(COMPOSE) up -d postgres mongo redis kafka opensearch \
		pubsub-emulator firestore-emulator fake-gcs gcp-init mailpit kafka-ui

.PHONY: down
down: ## إيقاف كل الحاويات
	$(COMPOSE) down

.PHONY: clean
clean: ## إيقاف وحذف كل البيانات (volumes)
	$(COMPOSE) down -v --remove-orphans

.PHONY: logs
logs: ## متابعة السجلات (make logs S=order-service)
	$(COMPOSE) logs -f $(S)

.PHONY: ps
ps: ## حالة الحاويات
	$(COMPOSE) ps

.PHONY: restart
restart: ## إعادة تشغيل خدمة (make restart S=catalog-service)
	$(COMPOSE) up -d --build --force-recreate $(S)

.PHONY: seed
seed: ## بذر بيانات تجريبية (منتجات، أقسام، مستخدم)
	./scripts/seed.sh

.PHONY: smoke
smoke: ## اختبار دخان سريع على الـ API
	./scripts/smoke-test.sh

.PHONY: admin-test
admin-test: ## اختبار لوحة التحكم (صلاحيات + CRUD)
	./scripts/admin-test.sh

# ---------------------------------------------------------------- build/test

.PHONY: build
build: ## بناء كل صور Docker
	$(COMPOSE) build

.PHONY: test
test: ## تشغيل اختبارات كل الخدمات
	./scripts/run-tests.sh

.PHONY: lint
lint: ## فحص الأكواد
	cd frontend/web && npm run lint

# ---------------------------------------------------------------- terraform

.PHONY: tf-init
tf-init: ## تهيئة Terraform
	$(TF) init

.PHONY: tf-plan
tf-plan: ## خطة Terraform
	$(TF) plan -var-file=environments/$(or $(ENV),dev).tfvars

.PHONY: tf-apply
tf-apply: ## تطبيق Terraform
	$(TF) apply -var-file=environments/$(or $(ENV),dev).tfvars

.PHONY: tf-destroy
tf-destroy: ## هدم البنية التحتية
	$(TF) destroy -var-file=environments/$(or $(ENV),dev).tfvars

# ---------------------------------------------------------------- kubernetes

# اسم العنقود لا يحمل اسم المشروع، وgcloud يرفض العمل بدونه. نقرأه من إعداد
# gcloud الحالي عند الإغفال (تُقيَّم عند الاستدعاء فقط، لا عند قراءة الملف).
GCLOUD_PROJECT = $(shell gcloud config get-value project 2>/dev/null)

.PHONY: kubeconfig
kubeconfig: ## ربط kubectl بعنقود GKE
	gcloud container clusters get-credentials $(or $(CLUSTER),topchoice-dev) \
		--region $(or $(REGION),me-central1) \
		--project $(or $(PROJECT),$(GOOGLE_CLOUD_PROJECT),$(GCLOUD_PROJECT))

.PHONY: deploy-gke
deploy-gke: ## نشر على GKE
	kubectl apply -k infra/k8s/overlays/$(or $(ENV),dev)

.PHONY: k8s-diff
k8s-diff: ## معاينة تغييرات Kubernetes
	kubectl diff -k infra/k8s/overlays/$(or $(ENV),dev) || true

.PHONY: images
images: ## بناء ورفع الصور إلى Artifact Registry
	./scripts/push-images.sh $(or $(REGISTRY),$(AR_REGISTRY)) $(or $(TAG),latest)
