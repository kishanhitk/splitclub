#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-${SPLITCLUB_API_URL:-}}"
if [[ -z "$BASE_URL" ]]; then
  echo "Usage: bun run worker:smoke -- https://splitclub-api.<account>.workers.dev" >&2
  exit 1
fi

curl --fail --silent "$BASE_URL/api/health" > /dev/null
curl --fail --silent "$BASE_URL/api/features" > /dev/null

if [[ -z "${SPLITCLUB_TEST_TOKEN:-}" ]]; then
  echo "Public smoke passed. Set SPLITCLUB_TEST_TOKEN to smoke authenticated ledger routes."
  exit 0
fi

auth_header="Authorization: Bearer ${SPLITCLUB_TEST_TOKEN}"
curl --fail --silent -H "$auth_header" "$BASE_URL/api/auth/session" > /dev/null
curl --fail --silent -H "$auth_header" "$BASE_URL/api/groups" > /dev/null
curl --fail --silent -H "$auth_header" "$BASE_URL/api/expenses" > /dev/null
curl --fail --silent -H "$auth_header" "$BASE_URL/api/receipts" > /dev/null
curl --fail --silent -H "$auth_header" "$BASE_URL/api/search?q=rent" > /dev/null
curl --fail --silent -H "$auth_header" "$BASE_URL/api/groups/non-group/balances" > /dev/null
curl --fail --silent -H "$auth_header" "$BASE_URL/api/sync" > /dev/null

echo "Authenticated smoke passed."
