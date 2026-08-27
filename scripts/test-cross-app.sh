#!/usr/bin/env bash
# The seam none of the per-app suites cover.
#
# main-local's e2e stubs global.fetch for /licenses/refresh, and admin-saas's
# suite calls claimSeat() directly rather than the HTTP routes — so the wire
# between App A and App B was never exercised. The till's SQLite code was
# tested against hand-written events, never against a feed App B really
# served. This boots App A (Next) and App B (Express) against throwaway
# databases with a freshly generated licence keypair, and drives both joins
# for real: activation, seat limits, refresh, revocation and lock-out; then
# the change feed, the offline outbox and bill idempotency.
#
#   ./scripts/test-cross-app.sh      (needs Postgres and psql on PATH)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export XAPP_ROOT="$ROOT"
SCRATCH="$(cd "$(dirname "$0")/.." && pwd)/.test-cross-app"
mkdir -p "$SCRATCH"
PG_USER=postgres
SAAS_DB=cashlio_x_saas
LOCAL_DB=cashlio_x_local
SAAS_PORT=3111
LOCAL_PORT=52997

export SAAS_DATABASE_URL="postgresql://$PG_USER:postgres@localhost:5432/$SAAS_DB?schema=public"
export LOCAL_DATABASE_URL="postgresql://$PG_USER:postgres@localhost:5432/$LOCAL_DB?schema=public"

cleanup() {
  lsof -ti :$SAAS_PORT 2>/dev/null | xargs -r kill -9 2>/dev/null || true
  lsof -ti :$LOCAL_PORT 2>/dev/null | xargs -r kill -9 2>/dev/null || true
  sleep 1
  psql -U $PG_USER -q -c "DROP DATABASE IF EXISTS $SAAS_DB WITH (FORCE);" -c "DROP DATABASE IF EXISTS $LOCAL_DB WITH (FORCE);" 2>/dev/null || true
}
trap cleanup EXIT

echo "▸ generating a licence keypair for this run"
KEYS=$(node $ROOT/admin-saas/scripts/gen-license-keys.js)
export LICENSE_PRIVATE_KEY=$(echo "$KEYS" | grep '^LICENSE_PRIVATE_KEY=' | cut -d= -f2-)
export LICENSE_PUBLIC_KEY=$(echo "$KEYS" | grep '^LICENSE_PUBLIC_KEY=' | cut -d= -f2-)

echo "▸ recreating scratch databases"
psql -U $PG_USER -q -c "DROP DATABASE IF EXISTS $SAAS_DB WITH (FORCE);" -c "CREATE DATABASE $SAAS_DB;"
psql -U $PG_USER -q -c "DROP DATABASE IF EXISTS $LOCAL_DB WITH (FORCE);" -c "CREATE DATABASE $LOCAL_DB;"

echo "▸ applying migrations"
(cd $ROOT/admin-saas && DATABASE_URL="$SAAS_DATABASE_URL" npx prisma migrate deploy >/dev/null)
(cd $ROOT/main-local && DATABASE_URL="$LOCAL_DATABASE_URL" npx prisma migrate deploy >/dev/null)

echo "▸ bundling the branch server"
(cd $ROOT/main-local && mkdir -p .test-build && npx esbuild src/main/server.ts src/main/licenseGuard.ts \
  --bundle --platform=node --format=cjs --outdir=.test-build --out-extension:.js=.cjs \
  --external:@prisma/client --external:bcryptjs --external:jsonwebtoken \
  --external:express --external:cors --external:jose --log-level=error)

if [[ ! -d "$ROOT/admin-saas/.next" ]]; then
  echo "▸ building App A (no .next yet)"
  (cd $ROOT/admin-saas && npx next build >/dev/null)
fi

echo "▸ starting App A (admin-saas) on $SAAS_PORT"
(cd $ROOT/admin-saas && DATABASE_URL="$SAAS_DATABASE_URL" LICENSE_PRIVATE_KEY="$LICENSE_PRIVATE_KEY" \
  BETTER_AUTH_SECRET=xapp-test BETTER_AUTH_URL=http://localhost:$SAAS_PORT \
  JWT_SECRET=xapp-test NEXT_PUBLIC_APP_URL=http://localhost:$SAAS_PORT \
  npx next start -p $SAAS_PORT > $SCRATCH/saas.log 2>&1) &
SAAS_PID=$!

echo "▸ starting App B (main-local Express) on $LOCAL_PORT"
(cd $ROOT/main-local && DATABASE_URL="$LOCAL_DATABASE_URL" JWT_SECRET=xapp-test \
  LICENSE_PUBLIC_KEY="$LICENSE_PUBLIC_KEY" SAAS_API_URL="http://localhost:$SAAS_PORT" \
  LOCAL_SERVER_PORT=$LOCAL_PORT \
  node -e "require('./.test-build/server.cjs').startExpressServer($LOCAL_PORT)" > $SCRATCH/local.log 2>&1) &
LOCAL_PID=$!

echo "▸ waiting for both to answer"
ready=0
for i in $(seq 1 90); do
  a=$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' -d '{}'         http://localhost:$SAAS_PORT/api/v1/licenses/activate 2>/dev/null) || a=000
  b=$(curl -s -o /dev/null -w '%{http_code}' http://localhost:$LOCAL_PORT/api/v1/system/status 2>/dev/null) || b=000
  if [[ "$a" =~ ^[2-5][0-9][0-9]$ && "$b" =~ ^[2-5][0-9][0-9]$ ]]; then ready=1; break; fi
  sleep 1
done
echo "  App A -> ${a:-none}   App B -> ${b:-none}"
if [[ $ready -ne 1 ]]; then
  echo "!! one of them never came up"; echo "--- saas.log ---"; tail -30 $SCRATCH/saas.log
  echo "--- local.log ---"; tail -30 $SCRATCH/local.log; exit 1
fi

echo "▸ running the cross-app licence suite"
XAPP_SAAS_URL="http://localhost:$SAAS_PORT" XAPP_LOCAL_URL="http://localhost:$LOCAL_PORT" \
  SAAS_DATABASE_URL="$SAAS_DATABASE_URL" node $ROOT/test/licence-chain.test.cjs && LIC_RC=0 || LIC_RC=$?

echo
echo "▸ re-seeding a healthy shop for the till suite"
# The licence leg deliberately ends with the shop revoked; give the sync leg a
# working licence rather than have it fail on a 402 it is not testing.
XAPP_LOCAL_URL="http://localhost:$LOCAL_PORT" SAAS_DATABASE_URL="$SAAS_DATABASE_URL" \
  XAPP_TOKEN_FILE="$SCRATCH/.token" node $ROOT/test/reseed.cjs
TOKEN=$(cat $SCRATCH/.token)

echo "▸ running the till sync suite"
XAPP_LOCAL_URL="http://localhost:$LOCAL_PORT" XAPP_TOKEN="$TOKEN" node $ROOT/test/till-sync.test.cjs && SYNC_RC=0 || SYNC_RC=$?

echo
if [[ ${LIC_RC:-1} -eq 0 && ${SYNC_RC:-1} -eq 0 ]]; then
  echo "▸ both legs passed"
  exit 0
fi
echo "▸ FAILED — licence leg rc=${LIC_RC:-?}, till leg rc=${SYNC_RC:-?}"
exit 1
