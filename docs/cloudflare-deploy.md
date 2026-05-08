# Cloudflare Deployment

SplitClub deploys the Hono Worker with Cloudflare D1, R2, Queue, and Workers AI bindings from `.github/workflows/cloudflare-deploy.yml`.

## Workflow

The deployment workflow runs on:

- Manual `workflow_dispatch`.
- Pushes to `main` that touch Worker, shared source, migrations, Wrangler config, package lockfiles, or the deploy workflow when the repository variable `CLOUDFLARE_DEPLOY_ENABLED` is set to `true`.

Before deployment it runs:

- `bun install --frozen-lockfile`
- `bunx expo install --check`
- `bun run typecheck`
- `bun test`
- `wrangler d1 migrations apply splitclub --remote`
- `wrangler deploy`

Action releases verified on May 8, 2026:

- `actions/checkout@v6.0.2`
- `actions/setup-node@v6.4.0`
- `oven-sh/setup-bun@v2.2.0`
- `cloudflare/wrangler-action@v3.15.0`

## Required GitHub Secrets

Set these repository or production-environment secrets before enabling production deploys:

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`

The API token needs permission to deploy Workers and apply D1 migrations for the `splitclub-api` Worker and `splitclub` database.

Set this repository variable when automatic deploys from `main` should run:

- `CLOUDFLARE_DEPLOY_ENABLED=true`

## Required Cloudflare Resources

Create or confirm these resources, then replace placeholders in `wrangler.toml`:

```sh
wrangler d1 create splitclub
wrangler r2 bucket create splitclub-receipts
wrangler queues create splitclub-sync
```

Update `database_id` under `[[d1_databases]]` with the real D1 id returned by Cloudflare.

For a guided production setup, run:

```sh
bun run cloudflare:provision
```

The script creates or confirms the D1 database, R2 receipt bucket, and Queue, refuses to deploy while `wrangler.toml` still contains the D1 placeholder, applies remote migrations, prompts for the required Worker OIDC secrets with `wrangler secret put`, deploys the Worker, and can smoke-check the deployed API when `SPLITCLUB_API_URL` is set.

Optional overrides:

```sh
SPLITCLUB_WORKER_NAME=splitclub-api
SPLITCLUB_D1_NAME=splitclub
SPLITCLUB_R2_BUCKET=splitclub-receipts
SPLITCLUB_QUEUE_NAME=splitclub-sync
SPLITCLUB_API_URL=https://splitclub-api.<account-subdomain>.workers.dev
```

The deploy workflow also validates production readiness before touching remote migrations:

- `CLOUDFLARE_ACCOUNT_ID` is present.
- `CLOUDFLARE_API_TOKEN` is present.
- `wrangler.toml` no longer contains `replace-with-cloudflare-d1-id`.

If any of those are missing, the workflow fails before deploying or migrating data.

## App Configuration

After deployment, set the app API URL to the Worker origin:

```sh
EXPO_PUBLIC_SPLITCLUB_API_URL=https://splitclub-api.<account-subdomain>.workers.dev
```

OIDC settings remain documented in `docs/authentication.md`.
