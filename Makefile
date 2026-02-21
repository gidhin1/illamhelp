SHELL := /bin/bash

COMPOSE_FILE := infra/docker-compose.yml
ENV_FILE := .env
COMPOSE_PROJECT ?= illamhelp
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

.PHONY: doctor up up-core up-auth up-full keycloak-bootstrap down reset-backend logs api-dev migrate bruno-e2e

doctor:
	./scripts/doctor.sh

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
	pnpm --filter @illamhelp/api dev

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
	docker exec -i illamhelp-postgres psql -U "$$POSTGRES_USER" -d "$$POSTGRES_DB" < infra/db/migrations/0003_scale_indexes_and_constraints.sql

bruno-e2e:
	bash ./scripts/run-bruno-e2e.sh
