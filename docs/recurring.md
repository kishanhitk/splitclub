# Recurring Bills

SplitClub recurring bills are modeled as normal expenses with `recurrence` and optional `reminderDays`.

## Worker Routes

- `GET /api/recurring` lists recurring schedules visible to the authenticated member, including next due date, reminder date, and posted/skipped history.
- `GET /api/recurring?asOf=YYYY-MM-DD` filters schedules to those due on or before that date.
- `POST /api/recurring/:id/post` posts the next occurrence as a one-off expense, advances the source schedule date, records a `posted` occurrence event, and queues `recurring.posted`.
- `POST /api/recurring/:id/skip` advances the source schedule date without creating an expense, records a `skipped` occurrence event, and queues `recurring.skipped`.
- The Cloudflare Worker scheduled handler runs daily from `wrangler.toml` and queues `recurring.due` messages with deterministic `notificationId` values for schedules whose reminder date or due date has arrived.
- The Worker queue consumer handles those messages idempotently, writes audit-backed recurring due notifications, and exposes them through `/api/notifications` for members who can see the source expense.

Recurring occurrence history is stored in `migrations/0009_recurring_occurrences.sql`.

## App Flow

The Recurring workspace keeps local notification scheduling and adds a compact cloud schedule section. Users can load cloud schedules, post the next server occurrence, or skip it without leaving the recurring workspace.
