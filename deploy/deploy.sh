#!/usr/bin/env bash
# Updates the demo server to the given image tags (ADR-0022). Tags are commit hashes (40 characters).
#   ./deploy.sh api=<hash> web=<hash> relay=<hash>   change some of the tags in .env, then deploy
#   ./deploy.sh                                    deploy the tags in .env as they are
#   ./deploy.sh --rollback                         go back to the last version that deployed well
#
# deploys.log has one line per deploy that passed the final check:
#   <time> <deploy|rollback> API_TAG=<hash> WEB_TAG=<hash> RELAY_TAG=<hash>
# If a deploy fails, the tags in .env are put back and the previous version is started again.
set -Eeuo pipefail
cd "$(dirname "$0")"

compose() { docker compose -f compose.prod.yaml "$@"; }
value_of() { grep -E "^$1=" .env | cut -d= -f2-; }
tags_now() { echo "API_TAG=$(value_of API_TAG) WEB_TAG=$(value_of WEB_TAG) RELAY_TAG=$(value_of RELAY_TAG)"; }
tags_of_line() { echo "$1" | grep -oE '(API|WEB|RELAY)_TAG=[^ ]*' | tr '\n' ' ' | sed 's/ $//'; }

# CI builds the images itself and tags them latest (.github/workflows/deploy-check.yml).
# On the server only commit hashes are allowed, so that every version can be gone back to.
ci=${DEPLOY_SKIP_PULL:-}
check_tag() {
  if [[ "$2" =~ ^[0-9a-f]{40}$ ]] || { [ "$ci" = "1" ] && [ "$2" = "latest" ]; }; then return 0; fi
  echo "$1 is not a commit hash: '${2}' (give the full 40-character hash, e.g. ./deploy.sh api=<hash>)" >&2
  exit 1
}
set_tags() { # "API_TAG=x WEB_TAG=y RELAY_TAG=z"
  for pair in $1; do
    check_tag "${pair%%=*}" "${pair#*=}"
    sed -i "s/^${pair%%=*}=.*/${pair}/" .env
  done
}

[ -f .env ] && [ -f .env.api ] && [ -f .env.relay ] || { echo "Run ./init-env.sh first." >&2; exit 1; }

before=$(tags_now)
kind=deploy
if [ "${1:-}" = "--rollback" ]; then
  kind=rollback
  last=$(tail -n 1 deploys.log 2>/dev/null || true)
  [ -n "$last" ] || { echo "Nothing in deploys.log to go back to." >&2; exit 1; }
  # If .env still has the last good tags, go back one more; otherwise (a failed or unfinished
  # deploy left other tags) go back to the last good ones
  if [ "$(tags_of_line "$last")" = "$before" ]; then
    target=$(tail -n 2 deploys.log | head -n 1)
    [ "$(wc -l < deploys.log)" -ge 2 ] || { echo "Only one deploy in deploys.log: nothing older to go back to." >&2; exit 1; }
  else
    target=$last
  fi
  echo "Going back to: $(tags_of_line "$target")"
  set_tags "$(tags_of_line "$target")"
else
  for arg in "$@"; do
    case "$arg" in
      api=*) set_tags "API_TAG=${arg#api=}" ;;
      web=*) set_tags "WEB_TAG=${arg#web=}" ;;
      relay=*) set_tags "RELAY_TAG=${arg#relay=}" ;;
      *) echo "Unknown argument: $arg" >&2; exit 1 ;;
    esac
  done
fi
for pair in $(tags_now); do check_tag "${pair%%=*}" "${pair#*=}"; done

# On any failure from here on, put the previous tags back and start that version again
failed() {
  trap - ERR
  echo "" >&2
  echo "The deploy failed. Putting back the previous tags (${before}) and starting that version again." >&2
  for pair in $before; do sed -i "s/^${pair%%=*}=.*/${pair}/" .env; done
  if [[ "$before" =~ =( |$) ]]; then
    echo "This was the first deploy, so there is no previous version to start." >&2
  else
    compose up -d --remove-orphans || true
  fi
  echo "Check: docker compose -f compose.prod.yaml ps / logs. Nothing was written to deploys.log." >&2
  exit 1
}
trap failed ERR

if [ "$ci" != "1" ]; then
  echo "== Pulling the images"
  compose pull --quiet
fi

echo "== Starting MySQL and Mailpit"
compose up -d --wait mysql mailpit

# Migrations add tables and columns only (CLAUDE.md), so the running version keeps working meanwhile
echo "== Running the API's migrations"
compose run --rm --no-deps api php artisan migrate --force

# A changed Caddyfile or config.alloy is not picked up by a running container (the bind mount keeps
# the old file after git pull replaces it), so those two are recreated when their files change
recreate=()
hashes=$(sha256sum Caddyfile config.alloy)
if [ "$hashes" != "$(cat .config-hashes 2>/dev/null || true)" ]; then
  recreate=(--force-recreate caddy)
  [[ " $(compose config --services | tr '\n' ' ') " == *" alloy "* ]] && recreate+=(alloy)
  echo "== Caddyfile or config.alloy changed: recreating ${recreate[*]:1}"
  compose up -d "${recreate[@]}"
fi

echo "== Starting or updating everything"
compose up -d --wait --remove-orphans

echo "== Checking that nothing is restarting"
sleep 10
bad=$(compose ps --all --format '{{.Service}} {{.State}}' | grep -vE ' running$' || true)
[ -z "$bad" ] || { echo "Not running: ${bad}" >&2; false; }

echo "== Checking that notify-relay is ready"
compose exec -T api php -r "exit(@file_get_contents('http://notify-relay:8080/readyz') === false ? 1 : 0);"

domain=$(value_of DOMAIN)
# From outside through Caddy (HTTPS). The CI check uses localhost, whose certificate is Caddy's own
url="https://${domain}/api/health"
curl_opts=(-fsS)
[ "$domain" = "localhost" ] && curl_opts+=(--insecure)
echo "== Checking ${url}"
ok=
for i in $(seq 1 30); do
  if curl "${curl_opts[@]}" "$url" > /dev/null; then ok=1; break; fi
  sleep 5
done
[ -n "$ok" ] || { echo "The demo does not answer at ${url}." >&2; false; }

trap - ERR
echo "$hashes" > .config-hashes
echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) ${kind} $(tags_now)" >> deploys.log
echo "Deployed: $(tags_now)"
