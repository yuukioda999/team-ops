# team-ops local development. Run from this directory.
SIBLINGS := team-ops-api team-ops-web notify-relay
GITHUB   := https://github.com/yuukioda999
COMPOSE  := docker compose

.PHONY: help setup up down restart logs ps test test-api test-web test-relay demo-reset \
        chaos-smtp chaos-smtp-off chaos-relay-down chaos-relay-up config

help: ## Show available commands
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*## "}; {printf "  %-18s %s\n", $$1, $$2}'

setup: ## Clone the three service repositories next to this one
	@for repo in $(SIBLINGS); do \
		if [ -d ../$$repo ]; then echo "../$$repo already exists"; \
		else git clone $(GITHUB)/$$repo.git ../$$repo; fi; \
	done

up: ## Start every service (API, worker, relay, web, MySQL, Mailpit, Grafana)
	$(COMPOSE) up -d --build
	@echo ""
	@echo "  Web      http://localhost:5173"
	@echo "  API      http://localhost:8000/api/health"
	@echo "  Relay    http://localhost:8080/healthz"
	@echo "  Mailpit  http://localhost:8025   (received mail)"
	@echo "  Grafana  http://localhost:3000   (traces, metrics, logs)"
	@echo ""
	@echo "  Log in: enter any address ending in .invalid (demo mode), then open the link in Mailpit"

down: ## Stop every service
	$(COMPOSE) down

restart: down up ## Restart every service

logs: ## Follow logs (make logs s=api to pick one service)
	$(COMPOSE) logs -f $(s)

ps: ## Show service status
	$(COMPOSE) ps

config: ## Validate compose.yaml
	$(COMPOSE) config --quiet && echo "compose.yaml is valid"

test: test-api test-web test-relay ## Run the tests of all three services

# The tests reset their database: point them at team_ops_test, never at the development data
test-api:
	$(COMPOSE) exec -e DB_DATABASE=team_ops_test api php artisan test

test-web:
	cd ../team-ops-web && npm test

test-relay:
	cd ../notify-relay && RELAY_TEST_DSN='notify_relay:notify_relay@tcp(127.0.0.1:3306)/notify_relay_test' go test -race ./...

demo-reset: ## Delete all demo teams and rebuild the template team (same as the nightly job)
	$(COMPOSE) exec api php artisan demo:reset

chaos-smtp: ## Make Mailpit reject 30% of mail with a temporary SMTP error (retry drill)
	curl -fsS -X PUT http://localhost:8025/api/v1/chaos \
		-H 'Content-Type: application/json' \
		-d '{"Sender":{"ErrorCode":451,"Probability":30}}' && echo " SMTP chaos on"

chaos-smtp-off: ## Turn Mailpit errors off again
	curl -fsS -X PUT http://localhost:8025/api/v1/chaos -H 'Content-Type: application/json' -d '{}' && echo " SMTP chaos off"

chaos-relay-down: ## Stop notify-relay: notices queue up in the API outbox
	$(COMPOSE) stop notify-relay

chaos-relay-up: ## Start notify-relay again: queued notices are delivered once
	$(COMPOSE) start notify-relay
