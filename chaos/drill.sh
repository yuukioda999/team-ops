#!/usr/bin/env bash
# Runs one chaos drill (spec 009, ADR-0025) against services already started with
#   docker compose -f compose.yaml -f chaos/compose.chaos.yaml up -d
# Usage (from team-ops/): chaos/drill.sh <smtp-temp|smtp-perm|relay-stop|relay-kill|api-down> <out-dir>
# It writes the timeline of what it did to <out-dir>/timeline.txt; chaos/report.py counts the result.
set -euo pipefail

SCENARIO=${1:?scenario}
OUT=${2:?out dir}
TEAMS=${TEAMS:-100}
DEADLINE_MIN=${DEADLINE_MIN:-25}
COMPOSE=(docker compose -f compose.yaml -f chaos/compose.chaos.yaml)
MAILPIT=http://127.0.0.1:8025
mkdir -p "$OUT"
: > "$OUT/timeline.txt"

log() { # what happened, with the time (UTC)
  local line
  line="$(date -u +%H:%M:%S) $*"
  echo "$line" | tee -a "$OUT/timeline.txt"
}
sql() { "${COMPOSE[@]}" exec -T mysql mysql -uroot -proot -N -B -e "$1" 2>/dev/null; }
mails() { curl -fsS "$MAILPIT/api/v1/messages?limit=1" | python3 -c 'import json,sys;print(json.load(sys.stdin)["total"])'; }
chaos() { curl -fsS -X PUT "$MAILPIT/api/v1/chaos" -H 'Content-Type: application/json' -d "$1" > /dev/null; }
wait_until() { # epoch seconds
  local now; now=$(date +%s)
  [ "$1" -gt "$now" ] && sleep $(( $1 - now ))
  return 0
}
wait_mails() { # until Mailpit holds at least $1 mails
  until [ "$(mails)" -ge "$1" ]; do sleep 1; done
}
relay_sending() { sql "select count(*) from notify_relay.delivery_recipients where status='sending'"; }
unfinished() { # API recipients without a result, relay recipients not final, outbox not sent
  sql "select (select count(*) from team_ops.notice_recipients where delivery_status='pending')
            + (select count(*) from notify_relay.delivery_recipients where status in ('pending','sending'))
            + (select count(*) from team_ops.outbox_messages where status<>'sent')"
}

case "$SCENARIO" in smtp-temp|smtp-perm|relay-stop|relay-kill|api-down) ;; *) echo "Unknown drill: $SCENARIO" >&2; exit 2 ;; esac

chaos '{}'
expected=$(( TEAMS * 30 ))
# The notices go out at the start of a minute at least a minute and a half from now (the scheduler
# publishes every minute)
at_epoch=$(( ($(date +%s) + 90) / 60 * 60 + 60 ))
at=$(date -u -d "@$at_epoch" +%Y-%m-%dT%H:%M:%SZ)
"${COMPOSE[@]}" exec -T api php artisan loadtest:seed --teams="$TEAMS" --at="$at" > "$OUT/seed.txt"
printf 'scenario=%s\nteams=%s\nexpected=%s\nscheduled_at=%s\n' "$SCENARIO" "$TEAMS" "$expected" "$at" > "$OUT/drill.env"
log "seed: $TEAMS teams, $expected recipients, notices scheduled at $at"

case "$SCENARIO" in
  smtp-temp)
    # AC-009-03: 451 for 30% of mail for 2 minutes from the start, then nothing
    wait_until $(( at_epoch - 5 ))
    chaos '{"Sender":{"ErrorCode":451,"Probability":30}}'
    log "fault on: Mailpit answers 451 to 30% of mail"
    wait_until $(( at_epoch + 120 ))
    chaos '{}'
    log "fault off: Mailpit accepts every mail"
    ;;
  smtp-perm)
    # AC-009-04: 550 for 10% of the recipients, until the end of the drill
    wait_until $(( at_epoch - 5 ))
    chaos '{"Recipient":{"ErrorCode":550,"Probability":10}}'
    log "fault on: Mailpit answers 550 to 10% of the recipients"
    ;;
  relay-stop)
    # AC-009-05: notify-relay is down when the notices go out, and comes back 3 minutes later
    wait_until $(( at_epoch - 30 ))
    "${COMPOSE[@]}" stop notify-relay > /dev/null 2>&1
    log "fault on: notify-relay stopped"
    wait_until $(( at_epoch + 180 ))
    log "outbox before the start: $(sql "select count(*) from team_ops.outbox_messages where status<>'sent'") messages not sent"
    "${COMPOSE[@]}" start notify-relay > /dev/null 2>&1
    log "fault off: notify-relay started"
    ;;
  relay-kill)
    # AC-009-06: SIGKILL while sending (after 10% of the mail), started again 10 seconds later
    wait_mails $(( expected / 10 ))
    before=$(relay_sending)
    "${COMPOSE[@]}" kill -s SIGKILL notify-relay > /dev/null 2>&1
    log "fault on: notify-relay killed (SIGKILL) at $(mails) mails; recipients marked sending just before: $before, after: $(relay_sending)"
    sleep 10
    "${COMPOSE[@]}" start notify-relay > /dev/null 2>&1
    log "fault off: notify-relay started"
    ;;
  api-down)
    # AC-009-07: the API (which receives the result webhooks) stops while sending, for 2 minutes
    wait_mails $(( expected / 10 ))
    "${COMPOSE[@]}" stop api > /dev/null 2>&1
    log "fault on: API stopped at $(mails) mails"
    sleep 120
    "${COMPOSE[@]}" start api > /dev/null 2>&1
    until curl -fsS http://127.0.0.1:8000/api/health > /dev/null 2>&1; do sleep 2; done
    log "fault off: API started and healthy"
    ;;
esac

# Wait until every recipient has a final state everywhere (or the deadline)
deadline=$(( at_epoch + DEADLINE_MIN * 60 ))
while :; do
  left=$(unfinished)
  if [ "$left" = "0" ]; then log "every recipient final (API, notify-relay and the outbox)"; break; fi
  if [ "$(date +%s)" -ge "$deadline" ]; then log "deadline: $left still unfinished after $DEADLINE_MIN minutes"; break; fi
  sleep 5
done
[ "$SCENARIO" = smtp-perm ] && { chaos '{}'; log "fault off: Mailpit accepts every mail"; }
# A little longer, so that mail sent twice would also be counted
sleep 20
log "end: Mailpit holds $(mails) mails"
