#!/usr/bin/env bash
# Creates the three settings files for the demo server with new random secrets (ADR-0022):
#   .env        Compose: domain, image tags, MySQL passwords, Grafana Cloud
#   .env.api    team-ops-api
#   .env.relay  notify-relay
# Run once on the server. An existing file is never overwritten. The files stay on the server
# only (mode 600) and are ignored by Git.
set -euo pipefail
cd "$(dirname "$0")"
umask 077

if [ -e .env ] || [ -e .env.api ] || [ -e .env.relay ]; then
  echo "A settings file already exists (.env, .env.api or .env.relay). Nothing was changed." >&2
  exit 1
fi

domain=${1:-demo.freie.jp}
b64() { openssl rand -base64 32; }
hex() { openssl rand -hex 24; } # letters and digits only, safe inside SQL and DSNs

team_ops_db=$(hex)
relay_db=$(hex)
relay_key=$(b64)

cat > .env <<EOF
# Compose settings for the demo server (ADR-0022). Secrets: keep this file on the server only.
DOMAIN=${domain}
# Let's Encrypt sends notices about the certificate here
ACME_EMAIL=info@freie.jp

# Image tags (commit hashes, 40 characters). Set by deploy.sh: ./deploy.sh api=<hash> web=<hash> relay=<hash>
API_TAG=
WEB_TAG=
RELAY_TAG=

MYSQL_ROOT_PASSWORD=$(hex)
TEAM_OPS_DB_PASSWORD=${team_ops_db}
RELAY_DB_PASSWORD=${relay_db}

# Grafana Cloud (docs/runbook/monitoring.md). Fill in from the stack's "Details" page.
# Set to monitoring once the values below are filled in; it starts Alloy, which sends logs and the
# server's resources there. Empty means no monitoring
COMPOSE_PROFILES=
GRAFANA_LOKI_URL=https://logs-prod-XXX.grafana.net/loki/api/v1/push
GRAFANA_LOKI_USER=000000
GRAFANA_PROM_URL=https://prometheus-prod-XX-prod-XX.grafana.net/api/prom/push
GRAFANA_PROM_USER=000000
GRAFANA_CLOUD_TOKEN=glc_replace_me
EOF

cat > .env.api <<EOF
# team-ops-api on the demo server (ADR-0022). Secrets: keep this file on the server only.
APP_NAME=team-ops-api
APP_ENV=production
APP_DEBUG=false
APP_KEY=base64:$(b64)
APP_URL=https://${domain}
WEB_URL=https://${domain}
APP_LOCALE=ja
LOG_CHANNEL=stderr
LOG_LEVEL=info

DB_CONNECTION=mysql
DB_HOST=mysql
DB_PORT=3306
DB_DATABASE=team_ops
DB_USERNAME=team_ops
DB_PASSWORD=${team_ops_db}

QUEUE_CONNECTION=database
CACHE_STORE=database
SESSION_DRIVER=database
SESSION_LIFETIME=43200
SESSION_ENCRYPT=true
SESSION_SECURE_COOKIE=true
SANCTUM_STATEFUL_DOMAINS=${domain}
# The web container (nginx) in front of the API, at its fixed address (compose.prod.yaml)
TRUSTED_PROXIES=172.30.0.10

BLIND_INDEX_KEY=base64:$(b64)

NOTIFY_RELAY_URL=http://notify-relay:8080
NOTIFY_RELAY_KEY_ID=demo1
NOTIFY_RELAY_SECRET=${relay_key}

# The public demo (spec 007): demo login only, mail only to .invalid, caught by Mailpit
DEMO_MODE=true
RECIPIENTS_INVALID_ONLY=true
MAILPIT_URL=http://mailpit:8025
EOF

cat > .env.relay <<EOF
# notify-relay on the demo server (ADR-0022). Secrets: keep this file on the server only.
DB_DSN=notify_relay:${relay_db}@tcp(mysql:3306)/notify_relay?parseTime=true
# Same key as NOTIFY_RELAY_SECRET in .env.api
RELAY_SIGNING_KEYS=demo1:${relay_key}
EMAIL_REF_KEY=$(b64)
SMTP_FROM=no-reply@team-ops.invalid
SMTP_FROM_NAME=チーム運営
DEMO_MODE=true
RECIPIENTS_INVALID_ONLY=true
EOF

chmod 600 .env .env.api .env.relay
echo "Created .env, .env.api and .env.relay for ${domain}."
echo "Next: check ACME_EMAIL in .env, then run ./deploy.sh api=<hash> web=<hash> relay=<hash>"
echo "Monitoring (Grafana Cloud) can be added later: docs/runbook/monitoring.md"
