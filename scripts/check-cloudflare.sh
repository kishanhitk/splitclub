#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${CLOUDFLARE_API_TOKEN:-}" ]]; then
  echo "CLOUDFLARE_API_TOKEN is not set. Wrangler remote provisioning and deploy commands are blocked." >&2
  exit 1
fi

bunx wrangler whoami
