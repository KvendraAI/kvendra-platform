#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-only
# kvendra-platform — container entrypoint.
#
# Responsibilities:
#   1. Wait until PostgreSQL is reachable (pg_isready loop with 30s timeout).
#   2. Bootstrap auth token at $AUTH_TOKEN_FILE if missing (openssl rand -hex 32, 0600).
#   3. Log the token location + Claude Code config hint to stdout.
#   4. Hand off to `node dist/index.js` (migrations are applied by the node process at boot).

set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"
: "${AUTH_TOKEN_FILE:=/data/auth.token}"

log() { printf '[entrypoint] %s\n' "$*" >&2; }

# -- 1) Wait for Postgres ------------------------------------------------------
# Parse host/port from DATABASE_URL — fall back to env vars if available.
parse_url_part() {
  # $1 = url, $2 = part name (host|port|user|dbname)
  node -e "const u = new URL(process.argv[1]); const m = { host: u.hostname, port: u.port || '5432', user: u.username, dbname: u.pathname.replace(/^\//, '') }; process.stdout.write(m[process.argv[2]] || '');" "$1" "$2"
}

PGHOST="$(parse_url_part "$DATABASE_URL" host)"
PGPORT="$(parse_url_part "$DATABASE_URL" port)"
PGUSER="$(parse_url_part "$DATABASE_URL" user)"
PGDB="$(parse_url_part "$DATABASE_URL" dbname)"

log "Waiting for PostgreSQL at ${PGHOST}:${PGPORT} (db=${PGDB}, user=${PGUSER})..."
DEADLINE=$(( $(date +%s) + 30 ))
until pg_isready -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDB" -q; do
  if [ "$(date +%s)" -ge "$DEADLINE" ]; then
    log "ERROR: PostgreSQL not ready after 30s. Exiting."
    exit 1
  fi
  sleep 1
done
log "PostgreSQL is ready."

# -- 2) Bootstrap auth token ---------------------------------------------------
mkdir -p "$(dirname "$AUTH_TOKEN_FILE")"
if [ ! -s "$AUTH_TOKEN_FILE" ]; then
  log "Generating auth token at ${AUTH_TOKEN_FILE}..."
  openssl rand -hex 32 > "$AUTH_TOKEN_FILE"
  chmod 0600 "$AUTH_TOKEN_FILE" || true
  log "Auth token generated."
else
  log "Auth token already present at ${AUTH_TOKEN_FILE}."
fi

TOKEN="$(cat "$AUTH_TOKEN_FILE")"
log ""
log "=============================================================="
log " kvendra-platform ready."
log " Auth token: ${AUTH_TOKEN_FILE}"
log " Configure Claude Code:"
log "   { \"mcpServers\": { \"kvendra-platform\": {"
log "       \"type\": \"http\","
log "       \"url\":  \"http://localhost:7777/mcp\","
log "       \"headers\": { \"Authorization\": \"Bearer ${TOKEN}\" }"
log "   } } }"
log "=============================================================="
log ""

# -- 3) Hand off to the platform process ---------------------------------------
exec node dist/index.js
