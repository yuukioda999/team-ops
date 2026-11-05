-- Two schemas on one MySQL server, each with its own user (ADR-0004).
-- notify-relay cannot read team_ops, and team-ops-api cannot read notify_relay.

CREATE DATABASE IF NOT EXISTS team_ops CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE DATABASE IF NOT EXISTS notify_relay CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

CREATE USER IF NOT EXISTS 'team_ops'@'%' IDENTIFIED BY 'team_ops';
CREATE USER IF NOT EXISTS 'notify_relay'@'%' IDENTIFIED BY 'notify_relay';

GRANT ALL PRIVILEGES ON team_ops.* TO 'team_ops'@'%';
GRANT ALL PRIVILEGES ON notify_relay.* TO 'notify_relay'@'%';

-- Test databases used by each service's automated tests.
CREATE DATABASE IF NOT EXISTS team_ops_test CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
GRANT ALL PRIVILEGES ON team_ops_test.* TO 'team_ops'@'%';

FLUSH PRIVILEGES;
