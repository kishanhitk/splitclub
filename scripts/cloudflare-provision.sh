#!/usr/bin/env bash
set -euo pipefail

worker_name="${SPLITCLUB_WORKER_NAME:-splitclub-api}"
d1_name="${SPLITCLUB_D1_NAME:-splitclub}"
r2_bucket="${SPLITCLUB_R2_BUCKET:-splitclub-receipts}"
queue_name="${SPLITCLUB_QUEUE_NAME:-splitclub-sync}"
api_base="${SPLITCLUB_API_URL:-}"

required_commands=(bun wrangler)
for command_name in "${required_commands[@]}"; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Missing required command: $command_name" >&2
    exit 1
  fi
done

echo "Provisioning SplitClub Cloudflare resources"
echo "Worker: $worker_name"
echo "D1: $d1_name"
echo "R2: $r2_bucket"
echo "Queue: $queue_name"
echo

echo "1. Create or confirm D1 database"
if ! wrangler d1 list | grep -E "\"name\": \"$d1_name\"|[[:space:]]$d1_name[[:space:]]" >/dev/null 2>&1; then
  wrangler d1 create "$d1_name"
else
  echo "D1 database already exists: $d1_name"
fi

echo
echo "2. Create or confirm R2 bucket"
if ! wrangler r2 bucket list | grep -E "\"name\": \"$r2_bucket\"|[[:space:]]$r2_bucket[[:space:]]" >/dev/null 2>&1; then
  wrangler r2 bucket create "$r2_bucket"
else
  echo "R2 bucket already exists: $r2_bucket"
fi

echo
echo "3. Create or confirm Queue"
if ! wrangler queues list | grep -E "\"queue_name\": \"$queue_name\"|\"name\": \"$queue_name\"|[[:space:]]$queue_name[[:space:]]" >/dev/null 2>&1; then
  wrangler queues create "$queue_name"
else
  echo "Queue already exists: $queue_name"
fi

echo
echo "4. Validate wrangler.toml resource IDs"
if grep -q "replace-with-cloudflare-d1-id" wrangler.toml; then
  echo "wrangler.toml still contains the D1 database_id placeholder." >&2
  echo "Run 'wrangler d1 list', copy the $d1_name database id, and update wrangler.toml before deploying." >&2
  exit 1
fi

echo
echo "5. Install dependencies and validate app"
bun install --frozen-lockfile
bunx expo install --check
bun run typecheck
bun test

echo
echo "6. Apply remote D1 migrations"
wrangler d1 migrations apply "$d1_name" --remote

echo
echo "7. Configure Worker OIDC secrets"
echo "Paste each value when prompted. Wrangler stores them as Worker secrets and does not echo values."
for secret_name in AUTH_JWT_ISSUER AUTH_JWT_AUDIENCE AUTH_JWKS_URL; do
  wrangler secret put "$secret_name" --name "$worker_name"
done

echo
echo "8. Deploy Worker"
wrangler deploy --name "$worker_name"

if [[ -n "$api_base" ]]; then
  echo
  echo "9. Smoke check $api_base"
  curl --fail --silent --show-error "$api_base/api/health" >/dev/null
  curl --fail --silent --show-error "$api_base/api/features" >/dev/null
  curl --fail --silent --show-error "$api_base/api/auth/config" >/dev/null
  echo "Cloudflare smoke checks passed"
else
  echo
  echo "Set SPLITCLUB_API_URL=https://$worker_name.<account-subdomain>.workers.dev to run smoke checks."
fi
