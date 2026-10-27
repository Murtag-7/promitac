#!/usr/bin/env bash
# Test the Supabase migrations on a throwaway local PostgreSQL:
#   1. initdb into a temp dir and start a private server (unix socket only, random port)
#   2. load supabase/tests/stub_supabase.sql (roles, auth.*, storage.* like on Supabase)
#   3. apply supabase/migrations/*.sql in order – twice, to prove they can be re-run
#   4. run supabase/tests/rls.sql (row level security + RPC checks)
# Exits non-zero on the first failure. Works as a normal user (GitHub Actions) and as root
# (initdb refuses root, so the server then runs as an unprivileged user).
#
# Env: PG_BIN=/path/to/postgres/bin (optional), PG_OS_USER=postgres (user for the server when root)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STUB="$ROOT/supabase/tests/stub_supabase.sql"
TESTS="$ROOT/supabase/tests/rls.sql"

find_pg_bin() {
  if [ -n "${PG_BIN:-}" ]; then echo "$PG_BIN"; return; fi
  local v
  for v in 17 16 15 14; do
    if [ -x "/usr/lib/postgresql/$v/bin/initdb" ]; then echo "/usr/lib/postgresql/$v/bin"; return; fi
  done
  if command -v pg_config >/dev/null 2>&1 && [ -x "$(pg_config --bindir)/initdb" ]; then
    pg_config --bindir
    return
  fi
  if command -v initdb >/dev/null 2>&1; then dirname "$(command -v initdb)"; return; fi
  echo ""
}

PG_BIN="$(find_pg_bin)"
if [ -z "$PG_BIN" ] || [ ! -x "$PG_BIN/initdb" ]; then
  echo "PostgreSQL server binaries not found (initdb). Install postgresql or set PG_BIN." >&2
  exit 1
fi
PSQL="$PG_BIN/psql"
[ -x "$PSQL" ] || PSQL="$(command -v psql)"

# Run server-side commands as an unprivileged user when we are root.
AS_SERVER=()
BASE_TMP="${TMPDIR:-/tmp}"
if [ "$(id -u)" = "0" ]; then
  SERVER_USER="${PG_OS_USER:-postgres}"
  if ! id "$SERVER_USER" >/dev/null 2>&1; then
    useradd --system --no-create-home --shell /usr/sbin/nologin "$SERVER_USER"
  fi
  if command -v runuser >/dev/null 2>&1; then
    AS_SERVER=(runuser -u "$SERVER_USER" --)
  else
    AS_SERVER=(sudo -u "$SERVER_USER")
  fi
  BASE_TMP=/tmp # must be reachable by the server user
fi

WORK="$(mktemp -d "$BASE_TMP/promitac-pg.XXXXXX")"
DATA="$WORK/data"
SOCK="$WORK/socket"
LOG="$WORK/postgres.log"
mkdir -p "$SOCK"
if [ "${#AS_SERVER[@]}" -gt 0 ]; then
  chmod 755 "$WORK"
  chown -R "$SERVER_USER" "$WORK"
fi

# No TCP listener at all (listen_addresses=''), so any port number is free; it only names the
# socket file inside our private socket directory.
PORT=$((20000 + RANDOM % 40000))

cleanup() {
  local code=$?
  if [ -f "$DATA/postmaster.pid" ]; then
    "${AS_SERVER[@]}" "$PG_BIN/pg_ctl" -D "$DATA" -m immediate -w stop >/dev/null 2>&1 || true
  fi
  if [ "$code" -ne 0 ] && [ -f "$LOG" ]; then
    echo "--- postgres log (last 30 lines) ---" >&2
    tail -n 30 "$LOG" >&2 || true
  fi
  rm -rf "$WORK"
  exit "$code"
}
trap cleanup EXIT

echo "PostgreSQL: $("$PG_BIN/postgres" --version)"
"${AS_SERVER[@]}" "$PG_BIN/initdb" -D "$DATA" -U postgres --auth=trust --encoding=UTF8 --locale=C >/dev/null
"${AS_SERVER[@]}" "$PG_BIN/pg_ctl" -D "$DATA" -l "$LOG" -w -t 60 \
  -o "-c listen_addresses= -c unix_socket_directories=$SOCK -p $PORT -c fsync=off -c full_page_writes=off" \
  start >/dev/null
echo "Server started (socket $SOCK, port $PORT)"

run_sql() {
  PGOPTIONS='-c client_min_messages=warning' "$PSQL" -X -q -v ON_ERROR_STOP=1 \
    -h "$SOCK" -p "$PORT" -U postgres -d postgres -o /dev/null -f "$1"
}

echo "== stub: ${STUB#"$ROOT"/}"
run_sql "$STUB"

shopt -s nullglob
MIGRATIONS=("$ROOT"/supabase/migrations/*.sql)
if [ "${#MIGRATIONS[@]}" -eq 0 ]; then
  echo "No migrations found in supabase/migrations" >&2
  exit 1
fi
for pass in 1 2; do
  for f in "${MIGRATIONS[@]}"; do
    echo "== migration (pass $pass): ${f#"$ROOT"/}"
    run_sql "$f"
  done
done

echo "== tests: ${TESTS#"$ROOT"/}"
run_sql "$TESTS"
echo "Migration tests passed."
