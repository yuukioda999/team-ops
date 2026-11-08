#!/usr/bin/env bash
# Updates the demo server to the images in .env, or to the tags given (ADR-0022).
#   ./deploy.sh                                  use API_TAG, WEB_TAG and RELAY_TAG as they are in .env
#   ./deploy.sh api=<hash> web=<hash> relay=<hash>   change some of them first (the others stay)
#   ./deploy.sh --rollback                       go back to the tags of the previous deploy
# Every deploy is recorded in deploys.log (time and the three tags), which --rollback reads.
set -euo pipefail
cd "$(dirname "$0")"

compose() { docker compose -f compose.prod.yaml "$@"; }
tag_of() { grep -E "^$1=" .env | cut -d= -f2-; }
set_tag() {
  if ! [[ "$2" =~ ^[0-9a-f]{40}$|^latest$ ]]; then
    echo "Not a commit hash: $2 (use the full 40-character hash, or latest)" >&2
    exit 1
  fi
  sed -i "s/^$1=.*/$1=$2/" .env
}

[ -f .env ] && [ -f .env.api ] && [ -f .env.relay ] || { echo "Run ./init-env.sh first." >&2; exit 1; }

if [ "${1:-}" = "--rollback" ]; then
  previous=$(tail -n 2 deploys.log 2>/dev/null | head -n 1)
  [ "$(wc -l < deploys.log 2>/dev/null || echo 0)" -ge 2 ] || { echo "No previous deploy in deploys.log." >&2; exit 1; }
  echo "Rolling back to: ${previous}"
  for pair in $previous; do
    case "$pair" in
      API_TAG=*|WEB_TAG=*|RELAY_TAG=*) set_tag "${pair%%=*}" "${pair#*=}" ;;
    esac
  done
else
  for arg in "$@"; do
    case "$arg" in
      api=*) set_tag API_TAG "${arg#api=}" ;;
      web=*) set_tag WEB_TAG "${arg#web=}" ;;
      relay=*) set_tag RELAY_TAG "${arg#relay=}" ;;
      *) echo "Unknown argument: $arg" >&2; exit 1 ;;
    esac
  done
fi

# DEPLOY_SKIP_PULL=1 only for the CI check, which builds the images itself (.github/workflows/deploy-check.yml)
if [ "${DEPLOY_SKIP_PULL:-}" != "1" ]; then
  echo "== Pulling the images"
  compose pull --quiet
fi

echo "== Starting MySQL and Mailpit"
compose up -d --wait mysql mailpit

# Migrations add tables and columns only (CLAUDE.md), so the running version keeps working meanwhile
echo "== Running the API's migrations"
compose run --rm --no-deps api php artisan migrate --force

echo "== Starting or updating everything"
compose up -d --wait --remove-orphans

domain=$(tag_of DOMAIN)
# From outside through Caddy (HTTPS). The CI check uses localhost, whose certificate is Caddy's own
url="https://${domain}/api/health"
curl_opts=(-fsS)
[ "$domain" = "localhost" ] && curl_opts+=(--insecure)
echo "== Checking ${url}"
for i in $(seq 1 30); do
  if curl "${curl_opts[@]}" "$url" > /dev/null; then
    echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) API_TAG=$(tag_of API_TAG) WEB_TAG=$(tag_of WEB_TAG) RELAY_TAG=$(tag_of RELAY_TAG)" >> deploys.log
    echo "Deployed: API_TAG=$(tag_of API_TAG) WEB_TAG=$(tag_of WEB_TAG) RELAY_TAG=$(tag_of RELAY_TAG)"
    exit 0
  fi
  sleep 5
done
echo "The demo does not answer. Check: docker compose -f compose.prod.yaml ps / logs. To go back: ./deploy.sh --rollback" >&2
exit 1
