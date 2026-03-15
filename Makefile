SHELL := /bin/bash

COMPOSE_FILE := infra/docker-compose.yml
ENV_FILE := .env
COMPOSE_PROJECT ?= illamhelp
WEB_PORT ?= 3001
ACT_ARTIFACTS_DIR ?= .act-artifacts
ACT_EVENT_FILE ?= $(ACT_ARTIFACTS_DIR)/event.json
ACT_CONTAINER_ARCHITECTURE ?=
EXPO_HOST_MODE ?= localhost
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

.PHONY: init-env doctor preflight deps unit-test up up-core up-auth up-full keycloak-bootstrap down reset-backend logs
.PHONY: api-dev api-build api-start migrate bruno-cli-install bruno-e2e
.PHONY: dev dev-web dev-admin dev-mobile dev-mobile-clear dev-mobile-reset dev-mobile-android dev-mobile-ios dev-mobile-web health
.PHONY: backend backend-start
.PHONY: mobile-native-init ui-install ui-test-web ui-test-admin ui-test-mobile ui-test-mobile-ios ui-test-mobile-android ui-test
.PHONY: ui-test-mobile-ios-debug ui-test-mobile-android-debug
.PHONY: ci-local
.PHONY: e2e-admin-setup e2e-admin-cleanup
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
	CORS_ORIGINS="$${CORS_ORIGINS:-http://localhost:3000,http://127.0.0.1:3000,http://localhost:3001,http://127.0.0.1:3001,http://localhost:3002,http://127.0.0.1:3002,http://localhost:3003,http://127.0.0.1:3003}" pnpm --filter @illamhelp/api dev

api-build:
	pnpm --filter @illamhelp/api build

api-start:
	pnpm --filter @illamhelp/api start

backend: backend-start

backend-start: preflight up-core migrate api-dev

dev: preflight unit-test
	bash ./scripts/dev.sh

unit-test:
	@if [[ "$${SKIP_UNIT_TESTS:-0}" == "1" ]]; then \
		echo "Skipping unit tests (SKIP_UNIT_TESTS=1)."; \
	else \
		echo "Running unit tests before startup..."; \
		pnpm test; \
	fi

dev-web:
	@LOCK_FILE="$(CURDIR)/web/.next/dev/lock"; \
	if [[ -f "$$LOCK_FILE" ]]; then \
		LOCK_HOLDERS="$$(lsof -t "$$LOCK_FILE" 2>/dev/null | tr '\n' ' ' | xargs || true)"; \
		if [[ -n "$$LOCK_HOLDERS" ]]; then \
			echo "Next dev lock is held by PID(s): $$LOCK_HOLDERS"; \
			echo "Stopping existing web dev process(es)..."; \
			kill $$LOCK_HOLDERS >/dev/null 2>&1 || true; \
			sleep 1; \
			STILL_HOLDING="$$(lsof -t "$$LOCK_FILE" 2>/dev/null | tr '\n' ' ' | xargs || true)"; \
			if [[ -n "$$STILL_HOLDING" ]]; then \
				echo "Could not release Next dev lock. Force stop required: kill -9 $$STILL_HOLDING"; \
				exit 1; \
			fi; \
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

dev-admin:
	@LOCK_FILE="$(CURDIR)/admin/.next/dev/lock"; \
	if [[ -f "$$LOCK_FILE" ]]; then \
		LOCK_HOLDERS="$$(lsof -t "$$LOCK_FILE" 2>/dev/null | tr '\n' ' ' | xargs || true)"; \
		if [[ -n "$$LOCK_HOLDERS" ]]; then \
			echo "Next admin dev lock is held by PID(s): $$LOCK_HOLDERS"; \
			echo "Stopping existing admin dev process(es)..."; \
			kill $$LOCK_HOLDERS >/dev/null 2>&1 || true; \
			sleep 1; \
			STILL_HOLDING="$$(lsof -t "$$LOCK_FILE" 2>/dev/null | tr '\n' ' ' | xargs || true)"; \
			if [[ -n "$$STILL_HOLDING" ]]; then \
				echo "Could not release Next admin lock. Force stop required: kill -9 $$STILL_HOLDING"; \
				exit 1; \
			fi; \
		fi; \
		echo "Removing stale Next admin lock: $$LOCK_FILE"; \
		rm -f "$$LOCK_FILE"; \
	fi; \
	PORT="$${ADMIN_PORT:-3003}"; \
	while lsof -iTCP:"$$PORT" -sTCP:LISTEN -n -P >/dev/null 2>&1; do \
		PORT=$$((PORT + 1)); \
	done; \
	if [[ "$$PORT" != "$${ADMIN_PORT:-3003}" ]]; then \
		echo "Port $${ADMIN_PORT:-3003} is busy; using $$PORT for admin dev server."; \
	fi; \
	PORT="$$PORT" pnpm --filter @illamhelp/admin dev

dev-mobile:
	pnpm --filter @illamhelp/mobile start -- --$(EXPO_HOST_MODE)

dev-mobile-clear:
	pnpm --filter @illamhelp/mobile start -- --clear --$(EXPO_HOST_MODE)

dev-mobile-reset:
	rm -rf mobile/.expo
	pnpm --filter @illamhelp/mobile start -- --clear --$(EXPO_HOST_MODE)

dev-mobile-android:
	pnpm --filter @illamhelp/mobile android

dev-mobile-ios:
	pnpm --filter @illamhelp/mobile ios

dev-mobile-web:
	pnpm --filter @illamhelp/mobile web

mobile-native-init:
	pnpm --filter @illamhelp/mobile e2e:maestro:init

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
	docker exec -i illamhelp-postgres psql -U "$$POSTGRES_USER" -d "$$POSTGRES_DB" < infra/db/migrations/0005_user_role_default_both.sql; \
	docker exec -i illamhelp-postgres psql -U "$$POSTGRES_USER" -d "$$POSTGRES_DB" < infra/db/migrations/0006_job_applications_and_booking_lifecycle.sql; \
	docker exec -i illamhelp-postgres psql -U "$$POSTGRES_USER" -d "$$POSTGRES_DB" < infra/db/migrations/0007_jobs_geo_search_fields.sql; \
	docker exec -i illamhelp-postgres psql -U "$$POSTGRES_USER" -d "$$POSTGRES_DB" < infra/db/migrations/0008_users_public_user_id.sql; \
	docker exec -i illamhelp-postgres psql -U "$$POSTGRES_USER" -d "$$POSTGRES_DB" < infra/db/migrations/0009_add_verified_column.sql; \
	docker exec -i illamhelp-postgres psql -U "$$POSTGRES_USER" -d "$$POSTGRES_DB" < infra/db/migrations/0010_jobs_visibility_and_extended_lifecycle.sql; \
	docker exec -i illamhelp-postgres psql -U "$$POSTGRES_USER" -d "$$POSTGRES_DB" < infra/db/migrations/0011_verification_requests.sql; \
	docker exec -i illamhelp-postgres psql -U "$$POSTGRES_USER" -d "$$POSTGRES_DB" < infra/db/migrations/0012_notifications.sql; \
	docker exec -i illamhelp-postgres psql -U "$$POSTGRES_USER" -d "$$POSTGRES_DB" < infra/db/migrations/0013_profile_avatar_skills_and_media_context.sql

bruno-e2e: preflight up-core migrate
	bash ./scripts/run-with-e2e-admin-env.sh bash ./scripts/run-bruno-e2e.sh

e2e-admin-setup:
	bash ./scripts/e2e-admin-setup.sh

e2e-admin-cleanup:
	bash ./scripts/e2e-admin-cleanup.sh

ui-install:
	pnpm run test:ui:install

ui-test-web:
	PW_REUSE_EXISTING_SERVERS="$${PW_REUSE_EXISTING_SERVERS:-true}" PW_AUTH_RATE_LIMIT_MAX="$${PW_AUTH_RATE_LIMIT_MAX:-2000}" pnpm run test:ui:web

ui-test-admin:
	PW_REUSE_EXISTING_SERVERS="$${PW_REUSE_EXISTING_SERVERS:-true}" PW_AUTH_RATE_LIMIT_MAX="$${PW_AUTH_RATE_LIMIT_MAX:-2000}" pnpm run test:ui:admin

ui-test-mobile: preflight up-core migrate
	pnpm run test:ui:mobile

ui-test-mobile-ios: preflight up-core migrate
	pnpm run test:ui:mobile:ios

ui-test-mobile-android: preflight up-core migrate
	pnpm run test:ui:mobile:android

ui-test-mobile-ios-debug: preflight up-core migrate
	MAESTRO_FLOW="$${MAESTRO_FLOW:-.maestro/flows/suite-ios.yaml}" MAESTRO_ARTIFACTS_DIR="$${MAESTRO_ARTIFACTS_DIR:-artifacts/maestro/debug-ios}" pnpm --filter @illamhelp/mobile e2e:maestro:test:ios:debug

ui-test-mobile-android-debug: preflight up-core migrate
	MAESTRO_FLOW="$${MAESTRO_FLOW:-.maestro/flows/suite-android.yaml}" MAESTRO_ARTIFACTS_DIR="$${MAESTRO_ARTIFACTS_DIR:-artifacts/maestro/debug-android}" pnpm --filter @illamhelp/mobile e2e:maestro:test:android:debug

ui-test: preflight up-core migrate
	pnpm run test:ui

ci-local:
	@command -v act >/dev/null 2>&1 || { \
		echo "'act' is required. Install it first (https://github.com/nektos/act)."; \
		exit 1; \
	}
	@docker ps -aq --filter "name=act-" | xargs -r docker rm -f >/dev/null 2>&1 || true
	@mkdir -p "$(ACT_ARTIFACTS_DIR)"
	@TOKEN="$${ACT_GITHUB_TOKEN:-$${GITHUB_TOKEN:-$$(gh auth token 2>/dev/null || true)}}"; \
	OWNER="$${ACT_GITHUB_OWNER:-$${GITHUB_REPOSITORY_OWNER:-$${USER:-local}}}"; \
	if [[ -z "$$TOKEN" ]]; then \
		echo "'ci-local' needs a GitHub token for actions invoked through act."; \
		echo "Set GITHUB_TOKEN or ACT_GITHUB_TOKEN, or login with 'gh auth login'."; \
		exit 1; \
	fi; \
	printf '%s\n' '{' \
	'  "ref": "refs/heads/local-ci",' \
	'  "before": "0000000000000000000000000000000000000000",' \
	'  "after": "local-ci",' \
	'  "repository": {' \
	'    "name": "illamhelp",' \
	"    \"full_name\": \"$$OWNER/illamhelp\"," \
	"    \"owner\": { \"login\": \"$$OWNER\", \"type\": \"User\" }" \
	'  },' \
	"  \"sender\": { \"login\": \"$$OWNER\", \"type\": \"User\" }," \
	'  "commits": [],' \
	'  "head_commit": { "id": "local-ci" }' \
	'}' > "$(ACT_EVENT_FILE)"; \
	ARCH_ARGS=(); \
	if [[ -n "$(ACT_CONTAINER_ARCHITECTURE)" ]]; then \
		ARCH_ARGS=(--container-architecture "$(ACT_CONTAINER_ARCHITECTURE)"); \
	elif [[ "$$(uname -s)" == "Darwin" && "$$(uname -m)" == "arm64" ]]; then \
		ARCH_ARGS=(--container-architecture "linux/amd64"); \
	fi; \
	act push -W .github/workflows/ci.yml --artifact-server-path "$(ACT_ARTIFACTS_DIR)" -e "$(ACT_EVENT_FILE)" -s GITHUB_TOKEN="$$TOKEN" "$${ARCH_ARGS[@]}" --rm
	@echo "Local CI artifacts saved in: $(ACT_ARTIFACTS_DIR)"

clean: clean-build

clean-build:
	@echo "Removing generated build/test artifacts..."
	@rm -rf \
		api/dist \
		dist \
		test-results \
		tests/playwright/reports \
		.act-artifacts \
		admin/.next \
		web/.next \
		mobile/.expo \
		mobile/artifacts \
		mobile/android/build \
		mobile/ios/build \
		api/tsconfig.tsbuildinfo \
		admin/tsconfig.tsbuildinfo \
		web/tsconfig.tsbuildinfo \
		mobile/tsconfig.tsbuildinfo
	@echo "Clean complete."
