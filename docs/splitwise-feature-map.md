# Splitwise Feature Map For SplitClub

Research date: 2026-05-08

Primary sources:

- Splitwise homepage: https://www.splitwise.com/index
- Splitwise help overview: https://feedback.splitwise.com/knowledgebase/articles/1088920-how-do-i-use-splitwise
- Splitwise Pro page: https://www.splitwise.com/subscriptions/new
- Splitwise help index: https://feedback.splitwise.com/knowledgebase/articles/all
- Percentage splits: https://feedback.splitwise.com/knowledgebase/articles/77463-can-i-split-an-expense-by-percentages
- Currency conversion: https://feedback.splitwise.com/knowledgebase/articles/301146-can-splitwise-do-currency-conversion-between-multi
- Recurring bills: https://feedback.splitwise.com/knowledgebase/articles/238785-how-do-i-create-a-recurring-bill
- Debt simplification: https://feedback.splitwise.com/knowledgebase/articles/107220-what-does-the-simplify-debts-setting-do

## Feature Inventory

SplitClub should cover the following Splitwise-style capabilities:

- Account and profile basics: friends, names, emails or phones, privacy-aware expense visibility.
- Groups: trips, apartments, couples, friends, family, group settings, group invite and membership management.
- Non-group expenses: one-off bills between arbitrary friends without creating a permanent group.
- Expense creation: description, amount, payer, date, category, notes, attachment, receipt image.
- Split modes: equal, exact amounts, percentages, relative shares, adjustments, refunds, reimbursements, and recorded debts.
- Balances: per-friend and per-group balances, dashboard totals, spending totals, separate currency balances.
- Debt simplification: minimize total settlement payments without changing anyone's net balance.
- Settle up: record cash payments and provide payment handoff links or instructions for UPI, Paytm, bank, PayPal, Venmo, or future providers.
- Recurring expenses: weekly, monthly, yearly bills and reminder offsets.
- Offline and sync: local-first ledger, cloud sync, conflict-safe future API mutations.
- Currencies: default currency, 100+ currency catalog, group conversion workflow using current rates.
- Search and filters: locate old expenses by description, notes, category, currency, attachment, group, member, or date.
- Charts and graphs: category totals, trends over time, group spending summaries.
- Receipt scanning and itemization: scan receipt attachments, extract items, assign items to participants.
- Transaction import: paste or import card/bank statement rows, preview purchases, and turn them into split expenses.
- Export: spreadsheet-ready transaction history.
- Free product stance: no ads, no artificial expense limit, all splitting features available.

## Current Foundation Coverage

- React Native app targets Android and web through Expo.
- Mobile-first UI includes a production app shell with a focused Home workspace, activity, groups, add-expense flow, balances, and tools; web/tablet layouts gain a persistent monochrome navigation rail while Android keeps a tight five-item bottom tab bar.
- The app shell is split into production modules for shared route constants, mobile/web screen surfaces, navigation, and reusable UI primitives instead of keeping every workspace inside `App.jsx`.
- The visual system follows a clean monochrome Tamagui v2 surface language aligned with shadcn-style hierarchy, using Expo-compatible latest dependency ranges instead of unsupported React Native peer versions.
- Focused workspaces cover groups, friends, invites/roles, stepped expense creation, split mode controls, balances, simplified settlements, search, category totals, recurring/receipt/export affordances, transaction import, a 100+ code currency catalog with conversion controls, and offline persistence.
- Domain logic is isolated in `src/domain/split.ts` and covered by Bun tests.
- Cloudflare Worker API contract is started in `worker/index.ts` with Hono, D1/R2/Queue bindings in `wrangler.toml`.
- Cloudflare production deployment is scripted through GitHub Actions with verified Wrangler action pins, remote D1 migrations, and Worker deploy steps.
- The app has a Cloud sync workspace that can pull `/api/sync` data into local storage and merge remote records with local-only records.
- Cloud pull sync reports remote additions, local preserved records, and same-id merge conflicts while preserving deterministic remote-wins behavior.
- Cloud sync conflicts keep local and remote record details so users can resolve each conflict by keeping the cloud copy or restoring the local copy.
- Expense edit/delete/restore pushes include base revisions and the Worker returns actionable 409 conflicts when the cloud copy changed first.
- Group defaults/delete/restore pushes also include base revisions and get actionable 409 conflicts for stale cloud writes.
- Core expense and settlement mutations can push to the Worker when API/auth are configured, while preserving local-first behavior offline.
- Collaboration mutations now share the same local-first push path for friends, group invites, role changes, member removals, group defaults, and group delete/restore actions.
- Friend profiles can be edited or removed from the mobile UI, with Worker routes returning member conflicts when the cloud copy changed first.
- Group invites can now be accepted into memberships locally and through the Worker invite-token route.
- Group invite delivery includes shareable invite links, web clipboard handoff, native sharing, and a public Worker invite landing page.
- Android/web invite links can now open the app shell, prefill the invite token, and accept through cloud or local invite state.
- Invite acceptance is verified against the authenticated member email or phone before membership is created.
- Group invite creation, invite acceptance with known group context, member role changes, and member removals now send base revisions and receive actionable cloud conflicts when group collaboration state changed first.
- Account controls can link/update display name, email, phone, and preferred payment method locally and through the Worker account route so invite matching uses current identity data.
- Account controls now show production OIDC readiness from the Worker, including app client readiness, Worker issuer/audience/JWKS readiness, issuer host, and required claims without exposing signing key URLs.
- Production OIDC tokens can carry `phone_number` into newly linked member records so phone-based invite matching works when members first sign in.
- Account updates now carry member base revisions and receive actionable member conflicts when cloud identity data changed first.
- Expense lifecycle changes now push edits, comments, deletes, and restores to the Worker while remaining non-destructive offline.
- Group settlement pushes now carry group base revisions and receive actionable conflicts when the cloud group changed first.
- Receipt uploads can be stored in R2, opened from the cloud receipt library or a saved expense detail, listed with OCR review history, retried through Worker OCR, explicitly marked reviewed before saving, attached to saved expenses, and reused in expense creation with extracted line items.
- GitHub CI verifies web/domain checks and Android debug APK builds for pull requests, then publishes installable debug APK artifacts.
- A manual Android release workflow can build, zipalign, sign, verify, and upload signed APK artifacts for direct testing plus signed AAB artifacts for Play App Signing release tracks when release keystore secrets are configured.
- Recurring bills can be scheduled for reminders, loaded from the Worker, posted or skipped with server-visible history, advanced to their next due date, scanned by a daily Cloudflare scheduled handler, delivered from Queue into scoped cloud notifications, and sent to registered Expo push tokens for visible members.
- Production Cloudflare setup has a repeatable provisioning script for D1/R2/Queue/OIDC secrets, remote migrations, deploy, and smoke checks, plus deploy workflow preflight guardrails for required secrets and Wrangler resource placeholders.

## Next Tickets
