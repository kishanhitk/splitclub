# SplitClub

SplitClub is a free, mobile-first expense splitting app built with React Native for Android and web. It is designed to cover the full Splitwise-style workflow: groups, friends, non-group expenses, flexible split methods, balances, simplified settlements, recurring bills, currencies, receipts, search, charts, export, offline use, and future cloud sync.

## Stack

- React Native and Expo for Android and web.
- Tamagui v2 for the cross-platform UI system.
- Bun for installs, scripts, and tests.
- Shared TypeScript domain logic in `src/domain`.
- Hono Worker API in `worker/index.ts`.
- Cloudflare-oriented storage with D1 for relational data, R2 for receipts, and Queues for sync events.

## Commands

```sh
bun install
bun run web
bun run android
bun test
bun run typecheck
bun run db:migrate:local
bun run worker:dev
```

## Current Scope

The first foundation includes a working seeded app surface with dedicated Activity, Groups, Add, Balances, and Settings screens. It supports expense creation, equal/exact/percent/share/adjustment split controls, settlement suggestions, search, spending totals, currency switching, offline persistence, CSV export preparation, and documented feature parity targets.

See `docs/splitwise-feature-map.md` for the Splitwise research map and follow-up implementation tickets.
