#!/usr/bin/env bash
# Keeps the code that must be identical in main-local and billing-client in step.
#
# The two Electron apps are separate git submodules, so they cannot share an npm
# workspace. `main-local` is the source of truth; this script copies its shared
# modules into `billing-client`.
#
#   ./scripts/sync-shared.sh          copy main-local -> billing-client
#   ./scripts/sync-shared.sh --check  exit 1 if they have drifted (for CI)
#
# If you change any file listed below, run this script before committing.
set -euo pipefail

cd "$(dirname "$0")/.."

FILES=(
  "src/shared/validation.ts"
  "src/shared/money.ts"
  "src/shared/units.ts"
  "src/shared/credit.ts"
  "src/shared/procurement.ts"
  "src/renderer/src/lib/receipt.ts"
)

MODE="${1:-sync}"
drift=0

for f in "${FILES[@]}"; do
  src="main-local/$f"
  dst="billing-client/$f"
  if [ ! -f "$src" ]; then
    echo "missing source: $src" >&2
    exit 1
  fi
  if [ "$MODE" = "--check" ]; then
    if ! cmp -s "$src" "$dst"; then
      echo "DRIFT: $f differs between main-local and billing-client"
      drift=1
    fi
  else
    mkdir -p "$(dirname "$dst")"
    cp "$src" "$dst"
    echo "synced $f"
  fi
done

if [ "$MODE" = "--check" ]; then
  if [ "$drift" -eq 0 ]; then
    echo "shared files are in sync"
  else
    echo "" >&2
    echo "Run ./scripts/sync-shared.sh to copy main-local's versions across." >&2
    exit 1
  fi
fi
