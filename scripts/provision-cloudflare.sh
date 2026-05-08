#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${CLOUDFLARE_API_TOKEN:-}" ]]; then
  echo "CLOUDFLARE_API_TOKEN is required for non-interactive Wrangler provisioning." >&2
  exit 1
fi

bunx wrangler whoami
bunx wrangler d1 create splitclub
bunx wrangler r2 bucket create splitclub-receipts
bunx wrangler queues create splitclub-sync

cat <<'EOF'

Provisioning commands completed.

Next steps:
1. Copy the D1 database_id printed above into wrangler.toml.
2. Run: bun run db:migrate:remote
3. Set auth secrets with wrangler secret put.
4. Run: bun run worker:deploy
EOF
