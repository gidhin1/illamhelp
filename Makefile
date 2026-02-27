SHELL := /bin/bash

COMPOSE_FILE := infra/docker-compose.yml
ENV_FILE := .env
COMPOSE_PROJECT ?= illamhelp
WEB_PORT ?= 3001
COMPOSE := docker compose --project-name $(COMPOSE_PROJECT) --env-file $(ENV_FILE) -f $(COMPOSE_FILE)

VOLUME_BASENAMES := postgres_data redis_data minio_data nats_data opensearch_data clamav_data
KNOWN_VOLUME_PREFIXES := $(COMPOSE_PROJECT) infra illamhelp claude_proj
KNOWN_CONTAINERS := \
	illamhelp-postgres \
	illamhelp-redis \
	illamhelp-minio \
	illamhelp-minio-init \
	illamhelp-nats \
	illamhelp-opensearch \
	illamhelp-keycloak \
	illamhelp-opa \
	illamhelp-clamav

.PHONY: init-env doctor preflight deps up up-core up-auth up-full keycloak-bootstrap down reset-backend logs
.PHONY: api-dev api-build api-start migrate bruno-cli-install bruno-e2e
.PHONY: dev dev-web dev-mobile dev-mobile-clear dev-mobile-reset dev-mobile-android dev-mobile-ios dev-mobile-web health
.PHONY: backend backend-start
.PHONY: mobile-native-init ui-install ui-test-web ui-test-mobile ui-test-mobile-ios ui-test-mobile-android ui-test
.PHONY: clean clean-build

init-env:
	@if [[ -f "$(ENV_FILE)" ]]; then \
		echo "$(ENV_FILE) already exists"; \
	else \
		cp .env.example "$(ENV_FILE)"; \
		echo "Created $(ENV_FILE) from .env.example"; \
	fi

doctor:
	./scripts/doctor.sh

preflight:
	./scripts/preflight.sh

deps:
	pnpm install

up: up-full

up-full:
	$(COMPOSE) up -d
	bash ./scripts/keycloak-dev-bootstrap.sh

up-core:
	$(COMPOSE) up -d postgres redis minio minio-init nats opa keycloak
	bash ./scripts/keycloak-dev-bootstrap.sh

up-auth:
	$(COMPOSE) up -d --force-recreate keycloak
	bash ./scripts/keycloak-dev-bootstrap.sh

keycloak-bootstrap:
	bash ./scripts/keycloak-dev-bootstrap.sh

down:
	$(COMPOSE) down -v --remove-orphans

reset-backend:
	@echo "Stopping stack and removing backend volumes/containers..."
	-$(COMPOSE) down -v --remove-orphans
	-for c in $(KNOWN_CONTAINERS); do docker rm -f "$$c" >/dev/null 2>&1 || true; done
	-for p in $(KNOWN_VOLUME_PREFIXES); do \
		for b in $(VOLUME_BASENAMES); do \
			docker volume rm -f "$${p}_$${b}" >/dev/null 2>&1 || true; \
		done; \
	done
	@echo "Backend reset complete."

logs:
	$(COMPOSE) logs -f --tail=200

api-dev:
	CORS_ORIGINS="$${CORS_ORIGINS:-http://localhost:3000,http://127.0.0.1:3000,http://localhost:3001,http://127.0.0.1:3001}" pnpm --filter @illamhelp/api dev

api-build:
	pnpm --filter @illamhelp/api build

api-start:
	pnpm --filter @illamhelp/api start

backend: backend-start

backend-start: preflight up-core migrate api-dev

dev: preflight
	bash ./scripts/dev.sh

dev-web:
	@LOCK_FILE="$(CURDIR)/web/.next/dev/lock"; \
	if [[ -f "$$LOCK_FILE" ]]; then \
		LOCK_HOLDERS="$$(lsof -t "$$LOCK_FILE" 2>/dev/null | tr '\n' ' ' | xargs || true)"; \
		if [[ -n "$$LOCK_HOLDERS" ]]; then \
			echo "Next dev lock is held by PID(s): $$LOCK_HOLDERS"; \
			echo "Stop existing web dev process(es) and retry: kill $$LOCK_HOLDERS"; \
			exit 1; \
		fi; \
		echo "Removing stale Next lock: $$LOCK_FILE"; \
		rm -f "$$LOCK_FILE"; \
	fi; \
	PORT="$(WEB_PORT)"; \
	while lsof -iTCP:"$$PORT" -sTCP:LISTEN -n -P >/dev/null 2>&1; do \
		PORT=$$((PORT + 1)); \
	done; \
	if [[ "$$PORT" != "$(WEB_PORT)" ]]; then \
		echo "Port $(WEB_PORT) is busy; using $$PORT for web dev server."; \
	fi; \
	PORT="$$PORT" pnpm --filter @illamhelp/web dev

dev-mobile:
	pnpm --filter @illamhelp/mobile start

dev-mobile-clear:
	pnpm --filter @illamhelp/mobile start -- --clear

dev-mobile-reset:
	rm -rf mobile/.expo
	pnpm --filter @illamhelp/mobile start -- --clear

dev-mobile-android:
	pnpm --filter @illamhelp/mobile android

dev-mobile-ios:
	pnpm --filter @illamhelp/mobile ios

dev-mobile-web:
	pnpm --filter @illamhelp/mobile web

mobile-native-init:
	pnpm --filter @illamhelp/mobile e2e:detox:init

health:
	curl -fsS http://localhost:4000/api/v1/health

bruno-cli-install:
	npm install -g @usebruno/cli

migrate:
	@if [[ "$$(docker inspect -f '{{.State.Running}}' illamhelp-postgres 2>/dev/null)" != "true" ]]; then \
		echo "illamhelp-postgres is not running. Start infra first: make up-core"; \
		exit 1; \
	fi; \
	POSTGRES_USER="$$(docker exec illamhelp-postgres printenv POSTGRES_USER 2>/dev/null)"; \
	POSTGRES_DB="$$(docker exec illamhelp-postgres printenv POSTGRES_DB 2>/dev/null)"; \
	if [[ -z "$$POSTGRES_USER" ]]; then POSTGRES_USER="postgres"; fi; \
	if [[ -z "$$POSTGRES_DB" ]]; then POSTGRES_DB="$$POSTGRES_USER"; fi; \
	if [[ -z "$$POSTGRES_USER" || -z "$$POSTGRES_DB" ]]; then \
		echo "Could not determine PostgreSQL user/database (set POSTGRES_USER and POSTGRES_DB in .env, then restart with make down && make up-core)"; \
		exit 1; \
	fi; \
	docker exec -i illamhelp-postgres psql -U "$$POSTGRES_USER" -d "$$POSTGRES_DB" -tAc "SELECT to_regclass('public.users') IS NOT NULL" | grep -q t || docker exec -i illamhelp-postgres psql -U "$$POSTGRES_USER" -d "$$POSTGRES_DB" < infra/db/migrations/0001_init.sql; \
	docker exec -i illamhelp-postgres psql -U "$$POSTGRES_USER" -d "$$POSTGRES_DB" < infra/db/migrations/0002_add_access_request_id_to_consent_grants.sql; \
	docker exec -i illamhelp-postgres psql -U "$$POSTGRES_USER" -d "$$POSTGRES_DB" < infra/db/migrations/0003_scale_indexes_and_constraints.sql; \
	docker exec -i illamhelp-postgres psql -U "$$POSTGRES_USER" -d "$$POSTGRES_DB" < infra/db/migrations/0004_internal_event_outbox.sql; \
	docker exec -i illamhelp-postgres psql -U "$$POSTGRES_USER" -d "$$POSTGRES_DB" < infra/db/migrations/0005_user_role_default_both.sql

bruno-e2e:
	bash ./scripts/run-bruno-e2e.sh

ui-install:
	pnpm run test:ui:install

ui-test-web: preflight up-core migrate
	pnpm run test:ui:web

ui-test-mobile: preflight up-core migrate
	pnpm run test:ui:mobile

ui-test-mobile-ios: preflight up-core migrate
	pnpm run test:ui:mobile:ios

ui-test-mobile-android: preflight up-core migrate
	pnpm run test:ui:mobile:android

ui-test: preflight up-core migrate
	pnpm run test:ui

clean: clean-build

clean-build:
	@echo "Removing generated build/test artifacts..."
	@rm -rf \
		api/dist \
		dist \
		test-results \
		tests/playwright/reports \
		web/.next \
		mobile/.expo \
		mobile/artifacts \
		mobile/android/build \
		mobile/ios/build \
		api/tsconfig.tsbuildinfo \
		web/tsconfig.tsbuildinfo \
		mobile/tsconfig.tsbuildinfo
	@echo "Clean complete."
