#!/usr/bin/env bash
# Runs one chaos drill (spec 009, ADR-0025) against services already started with
#   docker compose -f compose.yaml -f chaos/compose.chaos.yaml up -d
# Usage (from team-ops/): chaos/drill.sh <smtp-temp|smtp-perm|relay-stop|relay-kill|api-down> <out-dir>
# It needs an empty environment (no notices, no outbox, no relay deliveries), and empties Mailpit.
# It writes what it did to <out-dir>/timeline.txt and the facts the report checks to <out-dir>/drill.env;
# chaos/report.py counts the result. The map of test addresses goes to <out-dir>-private/, which is
# not uploaded.
set -euo pipefail

SCENARIO=${1:?scenario}
OUT=${2:?out dir}
PRIVATE="$OUT-private"
TEAMS=${TEAMS:-100}
DEADLINE_MIN=${DEADLINE_MIN:-25}
COMPOSE=(docker compose -f compose.yaml -f chaos/compose.chaos.yaml)
MAILPIT=http://127.0.0.1:8025
LARAVEL_LOG=../team-ops-api/storage/logs/laravel.log
mkdir -p "$OUT" "$PRIVATE"
: > "$OUT/timeline.txt"
: > "$OUT/drill.env"

log() { # what happened, with the time (UTC)
  local line
  line="$(date -u +%H:%M:%S) $*"
  echo "$line" | tee -a "$OUT/timeline.txt"
}
fact() { echo "$1=$2" >> "$OUT/drill.env"; } # a fact for report.py
sql() { "${COMPOSE[@]}" exec -T mysql mysql -uroot -proot -N -B -e "$1" 2> >(grep -v 'Using a password' >&2); }
mails() { curl -fsS "$MAILPIT/api/v1/messages?limit=1" | python3 -c 'import json,sys;print(json.load(sys.stdin)["total"])'; }
chaos() { curl -fsS -X PUT "$MAILPIT/api/v1/chaos" -H 'Content-Type: application/json' -d "$1" > /dev/null; }
wait_until() { # epoch seconds
  local now; now=$(date +%s)
  [ "$1" -gt "$now" ] && sleep $(( $1 - now ))
  return 0
}
wait_mails() { # until Mailpit holds at least $1 mails, for up to 5 minutes
  local until=$(( $(date +%s) + 300 ))
  until [ "$(mails)" -ge "$1" ]; do
    [ "$(date +%s)" -lt "$until" ] || { log "no progress: Mailpit holds $(mails) mails, waited for $1"; return 1; }
    sleep 1
  done
}
relay_sending() { sql "select count(*) from notify_relay.delivery_recipients where status='sending'"; }
pending_results() { sql "select count(*) from team_ops.notice_recipients where delivery_status='pending'"; }
unsent_outbox() { sql "select count(*) from team_ops.outbox_messages where status<>'sent'"; }
unfinished() { # API recipients without a result, relay recipients not final, outbox not sent
  sql "select (select count(*) from team_ops.notice_recipients where delivery_status='pending')
            + (select count(*) from notify_relay.delivery_recipients where status in ('pending','sending'))
            + (select count(*) from team_ops.outbox_messages where status<>'sent')"
}

case "$SCENARIO" in smtp-temp|smtp-perm|relay-stop|relay-kill|api-down) ;; *) echo "Unknown drill: $SCENARIO" >&2; exit 2 ;; esac

# The counts cover the whole database and Mailpit: start from nothing
left=$(sql "select (select count(*) from team_ops.notices) + (select count(*) from team_ops.outbox_messages) + (select count(*) from notify_relay.deliveries)")
if [ "$left" != "0" ]; then
  echo "The environment already holds notices, outbox messages or deliveries ($left rows). Start from empty volumes (docker compose down -v)." >&2
  exit 2
fi
curl -fsS -X DELETE "$MAILPIT/api/v1/messages" > /dev/null
chaos '{}'
# report.py counts only the Laravel log written after this point
fact laravel_log_offset "$( [ -f "$LARAVEL_LOG" ] && wc -c < "$LARAVEL_LOG" || echo 0 )"

expected=$(( TEAMS * 30 ))
# The notices go out at the start of a minute at least a minute and a half from now (the scheduler
# publishes every minute)
at_epoch=$(( ($(date +%s) + 90) / 60 * 60 + 60 ))
at=$(date -u -d "@$at_epoch" +%Y-%m-%dT%H:%M:%SZ)
"${COMPOSE[@]}" exec -T api php artisan loadtest:seed --teams="$TEAMS" --at="$at" --recipients-out=/tmp/recipients.json > "$OUT/seed.txt"
"${COMPOSE[@]}" cp api:/tmp/recipients.json "$PRIVATE/recipients.json"
fact scenario "$SCENARIO"; fact teams "$TEAMS"; fact expected "$expected"; fact scheduled_at "$at"
log "seed: $TEAMS teams, $expected recipients, notices scheduled at $at"

fault_on() { fact fault_on "$(date +%s)"; log "fault on: $*"; }
fault_off() { fact fault_off "$(date +%s)"; log "fault off: $*"; }

case "$SCENARIO" in
  smtp-temp)
    # AC-009-03: 451 for 30% of mail for 2 minutes from the start, then nothing
    wait_until $(( at_epoch - 5 ))
    chaos '{"Sender":{"ErrorCode":451,"Probability":30}}'
    fault_on "Mailpit answers 451 to 30% of mail"
    wait_until $(( at_epoch + 120 ))
    chaos '{}'
    fault_off "Mailpit accepts every mail"
    ;;
  smtp-perm)
    # AC-009-04: 550 for 10% of the recipients, until the end of the drill
    wait_until $(( at_epoch - 5 ))
    chaos '{"Recipient":{"ErrorCode":550,"Probability":10}}'
    fault_on "Mailpit answers 550 to 10% of the recipients"
    ;;
  relay-stop)
    # AC-009-05: notify-relay is down when the notices go out. It comes back a little after 3 minutes
    # (not on the minute, when the scheduler resends the outbox), and the operator then resends the
    # outbox at once, as the runbook says (AC-009-12)
    wait_until $(( at_epoch - 30 ))
    "${COMPOSE[@]}" stop notify-relay > /dev/null 2>&1
    fault_on "notify-relay stopped"
    wait_until $(( at_epoch + 190 ))
    unsent=$(unsent_outbox)
    fact unsent_outbox_while_down "$unsent"; fact mails_while_down "$(mails)"
    log "outbox while notify-relay was down: $unsent messages not sent, $(mails) mails arrived"
    "${COMPOSE[@]}" start notify-relay > /dev/null 2>&1
    until curl -fsS http://127.0.0.1:8080/healthz > /dev/null 2>&1; do sleep 1; done
    fault_off "notify-relay started and healthy"
    "${COMPOSE[@]}" exec -T api php artisan outbox:redispatch --now > "$OUT/redispatch.txt"
    log "operator: php artisan outbox:redispatch --now ($(tr '\n' ' ' < "$OUT/redispatch.txt"))"
    ;;
  relay-kill)
    # AC-009-06: SIGKILL while sending (after 10% of the mail; it polls, so it is a little later),
    # started again 10 seconds later
    wait_mails $(( expected / 10 ))
    "${COMPOSE[@]}" kill -s SIGKILL notify-relay > /dev/null 2>&1
    fact fault_on "$(date +%s)"
    at_kill=$(mails)
    left_sending=$(relay_sending)
    fact mails_at_kill "$at_kill"; fact left_sending "$left_sending"
    # "sending" covers the claimed recipients (up to 500 at a time), sent or not; those not sent go
    # back to pending at the start and are sent once. Only mail sent but not yet recorded can arrive
    # twice, at most as many as are sent at the same time (SEND_CONCURRENCY, 50)
    log "fault on: notify-relay killed (SIGKILL) at $at_kill mails; recipients left sending: $left_sending"
    sleep 10
    "${COMPOSE[@]}" start notify-relay > /dev/null 2>&1
    fault_off "notify-relay started"
    ;;
  api-down)
    # AC-009-07: the API (which receives the result webhooks) is down from just before the notices go
    # out until 2 minutes after. The scheduler and the worker keep running, so the notices are still
    # published and sent; only the results cannot come back. It stops 30 seconds early, because
    # stopping takes a few seconds and 3,000 mails go out in about 10 seconds.
    wait_until $(( at_epoch - 30 ))
    "${COMPOSE[@]}" stop api > /dev/null 2>&1
    fault_on "API stopped"
    wait_until $(( at_epoch + 120 ))
    pending=$(pending_results)
    fact mails_while_down "$(mails)"; fact pending_while_down "$pending"
    log "while the API was down: $(mails) mails arrived; API results still pending: $pending"
    "${COMPOSE[@]}" start api > /dev/null 2>&1
    until curl -fsS http://127.0.0.1:8000/api/health > /dev/null 2>&1; do sleep 1; done
    fault_off "API started and healthy"
    ;;
esac

# Wait until every notice is published (before that, nothing is left to wait for), then until every
# recipient has a final state everywhere (or the deadline)
deadline=$(( at_epoch + DEADLINE_MIN * 60 ))
wait_until "$at_epoch"
until [ "$(sql "select count(*) from team_ops.notices where status='published'")" -ge "$TEAMS" ] || [ "$(date +%s)" -ge "$deadline" ]; do sleep 2; done
while :; do
  left=$(unfinished)
  if [ "$left" = "0" ]; then fact all_final "$(date +%s)"; log "every recipient final (API, notify-relay and the outbox)"; break; fi
  if [ "$(date +%s)" -ge "$deadline" ]; then log "deadline: $left still unfinished after $DEADLINE_MIN minutes"; break; fi
  sleep 2
done
if [ "$SCENARIO" = smtp-perm ]; then chaos '{}'; fault_off "Mailpit accepts every mail"; fi
# A little longer, so that mail sent twice would also be counted
sleep 20
log "end: Mailpit holds $(mails) mails"
