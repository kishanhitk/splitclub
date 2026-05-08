import { createApp, deliverQueueMessages, runRecurringScheduler, type Bindings } from './app'

const app = createApp()

export default {
  fetch: app.fetch,
  scheduled(event: ScheduledEvent, env: Bindings, ctx: ExecutionContext) {
    const asOf = new Date(event.scheduledTime).toISOString().slice(0, 10)
    ctx.waitUntil(runRecurringScheduler(env, asOf))
  },
  queue(batch: MessageBatch, env: Bindings, ctx: ExecutionContext) {
    ctx.waitUntil(deliverQueueMessages(env, batch.messages.map((message) => message.body)))
  },
}
