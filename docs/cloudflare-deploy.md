# Cloudflare Deployment

KIS-61 is the live infrastructure step for SplitClub. Wrangler is installed, but this workstation currently is not authenticated with Cloudflare. Set `CLOUDFLARE_API_TOKEN` before running remote commands.

## Required Token Scopes

Create a Cloudflare API token with access to:

- Workers Scripts: edit.
- D1: edit.
- R2 Storage: edit.
- Queues: edit.
- Workers AI: read/edit if OCR is enabled.

## Provision Resources

Run:

```sh
export CLOUDFLARE_API_TOKEN=...
bun run cloudflare:check
bun run cloudflare:provision
```

The D1 create command prints a `database_id`. Replace `replace-with-cloudflare-d1-id` in `wrangler.toml` with that real id.

## Configure Auth

Set production auth secrets/vars:

```sh
bunx wrangler secret put AUTH_JWT_ISSUER
bunx wrangler secret put AUTH_JWT_AUDIENCE
bunx wrangler secret put AUTH_JWKS_URL
```

The app also needs:

```sh
EXPO_PUBLIC_SPLITCLUB_API_URL=https://splitclub-api.<account>.workers.dev
EXPO_PUBLIC_SPLITCLUB_AUTH_PROVIDER=clerk
EXPO_PUBLIC_SPLITCLUB_AUTH_ISSUER=https://your-clerk-domain
EXPO_PUBLIC_SPLITCLUB_AUTH_CLIENT_ID=your-oidc-client-id
EXPO_PUBLIC_SPLITCLUB_AUTH_AUDIENCE=splitclub-api
```

## Migrate And Deploy

```sh
bun run db:migrate:local
bun run db:migrate:remote
bun run worker:deploy
```

## Smoke Test

Health and feature metadata are public:

```sh
bun run worker:smoke -- https://splitclub-api.<account>.workers.dev
```

Ledger endpoints require a real bearer token:

```sh
SPLITCLUB_TEST_TOKEN=... bun run worker:smoke -- https://splitclub-api.<account>.workers.dev
```

The smoke script checks health, features, session, groups, expenses, search, balances, and sync.
