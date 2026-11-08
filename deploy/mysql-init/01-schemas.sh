#!/bin/sh
# Runs once, when the MySQL volume is empty. Two schemas, each with its own user (ADR-0004):
# notify-relay cannot read team_ops, and team-ops-api cannot read notify_relay.
# The passwords come from .env (TEAM_OPS_DB_PASSWORD, RELAY_DB_PASSWORD); no test databases here.
set -eu
mysql -uroot -p"$MYSQL_ROOT_PASSWORD" <<SQL
CREATE DATABASE IF NOT EXISTS team_ops CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE DATABASE IF NOT EXISTS notify_relay CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE USER IF NOT EXISTS 'team_ops'@'%' IDENTIFIED BY '${TEAM_OPS_DB_PASSWORD}';
CREATE USER IF NOT EXISTS 'notify_relay'@'%' IDENTIFIED BY '${RELAY_DB_PASSWORD}';
GRANT ALL PRIVILEGES ON team_ops.* TO 'team_ops'@'%';
GRANT ALL PRIVILEGES ON notify_relay.* TO 'notify_relay'@'%';
FLUSH PRIVILEGES;
SQL
