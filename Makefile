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
MAVEN := mvn -f api-java/pom.xml
PNPM := COREPACK_HOME=$(CURDIR)/.tools/corepack corepack pnpm

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

.PHONY: init-env doctor preflight backend-preflight deps unit-test up up-core up-auth up-full keycloak-bootstrap down reset-backend logs
.PHONY: api-dev api-build api-start bruno-cli-install bruno-e2e
.PHONY: dev dev-web dev-admin dev-mobile dev-mobile-clear dev-mobile-reset dev-mobile-android dev-mobile-ios dev-mobile-web health
.PHONY: backend backend-start
.PHONY: ui-install ui-test-web ui-test-admin ui-test-mobile ui-test
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

backend-preflight:
	PREFLIGHT_SCOPE=backend ./scripts/preflight.sh

deps:
	$(PNPM) install

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
	CORS_ORIGINS="$${CORS_ORIGINS:-http://localhost:3000,http://127.0.0.1:3000,http://localhost:3001,http://127.0.0.1:3001,http://localhost:3002,http://127.0.0.1:3002,http://localhost:3003,http://127.0.0.1:3003}" $(MAVEN) spring-boot:run

api-build:
	$(MAVEN) test package

api-start:
	java -jar api-java/target/api-0.1.0.jar

backend: backend-start

backend-start: backend-preflight up-core api-dev

dev: preflight unit-test
	bash ./scripts/dev.sh

unit-test:
	@if [[ "$${SKIP_UNIT_TESTS:-0}" == "1" ]]; then \
		echo "Skipping unit tests (SKIP_UNIT_TESTS=1)."; \
	else \
		echo "Running unit tests before startup..."; \
		$(MAVEN) test; \
		$(PNPM) -r test; \
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
	PORT="$$PORT" $(PNPM) --filter @illamhelp/web dev

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
	PORT="$$PORT" $(PNPM) --filter @illamhelp/admin dev

dev-mobile:
	$(PNPM) --filter @illamhelp/mobile start -- --$(EXPO_HOST_MODE)

dev-mobile-clear:
	$(PNPM) --filter @illamhelp/mobile start -- --clear --$(EXPO_HOST_MODE)

dev-mobile-reset:
	rm -rf mobile/.expo
	$(PNPM) --filter @illamhelp/mobile start -- --clear --$(EXPO_HOST_MODE)

dev-mobile-android:
	$(PNPM) --filter @illamhelp/mobile android

dev-mobile-ios:
	$(PNPM) --filter @illamhelp/mobile ios

dev-mobile-web:
	$(PNPM) --filter @illamhelp/mobile web

health:
	curl -fsS http://localhost:4000/api/v1/health

bruno-cli-install:
	npm install -g @usebruno/cli

bruno-e2e: backend-preflight up-core
	bash ./scripts/run-with-e2e-admin-env.sh bash ./scripts/run-bruno-e2e.sh

e2e-admin-setup:
	bash ./scripts/e2e-admin-setup.sh

e2e-admin-cleanup:
	bash ./scripts/e2e-admin-cleanup.sh

ui-install:
	$(PNPM) run test:ui:install

ui-test-web: preflight up-core
	PW_REUSE_EXISTING_SERVERS="$${PW_REUSE_EXISTING_SERVERS:-true}" PW_AUTH_RATE_LIMIT_MAX="$${PW_AUTH_RATE_LIMIT_MAX:-2000}" $(PNPM) run test:ui:web

ui-test-admin: preflight up-core
	PW_REUSE_EXISTING_SERVERS="$${PW_REUSE_EXISTING_SERVERS:-true}" PW_AUTH_RATE_LIMIT_MAX="$${PW_AUTH_RATE_LIMIT_MAX:-2000}" $(PNPM) run test:ui:admin

ui-test-mobile: preflight up-core
	PW_REUSE_EXISTING_SERVERS="$${PW_REUSE_EXISTING_SERVERS:-true}" PW_AUTH_RATE_LIMIT_MAX="$${PW_AUTH_RATE_LIMIT_MAX:-2000}" $(PNPM) run test:ui:mobile

ui-test: preflight up-core
	$(PNPM) run test:ui

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
		api-java/target \
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
		admin/tsconfig.tsbuildinfo \
		web/tsconfig.tsbuildinfo \
		mobile/tsconfig.tsbuildinfo
	@echo "Clean complete."
