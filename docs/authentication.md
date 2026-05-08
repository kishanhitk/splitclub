# Authentication

SplitClub uses a standard OIDC session boundary so the app can run on Android and web while the Cloudflare Worker verifies bearer tokens without vendor-specific SDK code.

## Provider Choice

Use Clerk as the first production provider. It supports Expo Android/web sign-in, OIDC-style discovery, and backend JWT verification through a JWKS URL. The Worker implementation stays provider-neutral, so another OIDC provider can be used by changing environment variables.

## Expo Configuration

Set these public variables for the app:

```sh
EXPO_PUBLIC_SPLITCLUB_AUTH_PROVIDER=clerk
EXPO_PUBLIC_SPLITCLUB_AUTH_ISSUER=https://your-clerk-domain
EXPO_PUBLIC_SPLITCLUB_AUTH_CLIENT_ID=your-oidc-client-id
EXPO_PUBLIC_SPLITCLUB_AUTH_AUDIENCE=splitclub-api
```

The app uses `expo-auth-session` with the `splitclub://` redirect scheme and stores the resulting session in cross-platform AsyncStorage. A local session fallback is available only when the public provider variables are absent, which keeps development usable before real credentials exist.

## Worker Configuration

Set these private Worker variables or secrets:

```sh
AUTH_JWT_ISSUER=https://your-clerk-domain
AUTH_JWT_AUDIENCE=splitclub-api
AUTH_JWKS_URL=https://your-clerk-domain/.well-known/jwks.json
AUTH_PROVIDER_NAME=clerk
```

The Worker requires `Authorization: Bearer <token>` on every ledger route except `/api/health`, `/api/features`, `/api/auth/config`, and public invite landing pages.

`GET /api/auth/config` returns a secret-safe readiness summary for the app Account screen and production operators. It reports whether issuer, audience, and JWKS bindings are present, the issuer host, required claims, and supported signing algorithms without returning the JWKS URL or signing material.

## Data Scoping

On each request, the Worker:

1. Verifies the JWT issuer, audience, lifetime, and signature.
2. Maps the provider subject to a SplitClub user through `auth_identities`.
3. Creates or links the local user record when needed, including `email`, `name`, `picture`, and `phone_number` claims.
4. Filters groups, expenses, balances, search, and sync payloads to the authenticated member.
5. Verifies invite acceptance against the authenticated member email or phone before creating group membership.

Run `migrations/0003_auth.sql` before enabling the production Worker.
