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
- Settle up: record cash payments and support payment integrations as metadata for UPI, bank, PayPal, Venmo, or future providers.
- Recurring expenses: weekly, monthly, yearly bills and reminder offsets.
- Offline and sync: local-first ledger, cloud sync, conflict-safe future API mutations.
- Currencies: default currency, 100+ currency design target, group conversion workflow using current rates.
- Search and filters: locate old expenses by description, notes, category, currency, attachment, group, member, or date.
- Charts and graphs: category totals, trends over time, group spending summaries.
- Receipt scanning and itemization: scan receipt attachments, extract items, assign items to participants.
- Export: spreadsheet-ready transaction history.
- Free product stance: no ads, no artificial expense limit, all splitting features available.

## Current Foundation Coverage

- React Native app targets Android and web through Expo.
- Mobile-first UI includes groups, friends, expenses, split mode controls, balances, simplified settlements, search, category totals, recurring/receipt/export affordances, currency conversion controls, and offline persistence.
- Domain logic is isolated in `src/domain/split.ts` and covered by Bun tests.
- Cloudflare Worker API contract is started in `worker/index.ts` with Hono, D1/R2/Queue bindings in `wrangler.toml`.
- The app has a Cloud sync workspace that can pull `/api/sync` data into local storage and merge remote records with local-only records.

## Next Tickets

- Authentication, invites, and friend permissions.
- Push-side sync conflict handling and live Cloudflare deployment.
- Real receipt OCR pipeline and R2 uploads.
- Full recurring bill scheduler and notifications.
- Android build verification and installable preview.
