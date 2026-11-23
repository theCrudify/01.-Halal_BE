import { app } from './app.ts'
import { withRequestDb } from './core/database.ts'

// Cloudflare Workers entry (wrangler.jsonc). Local/Node uses src/index.ts.
export default {
  fetch(req: Request, env: unknown, ctx: { waitUntil(p: Promise<unknown>): void; passThroughOnException(): void }) {
    return withRequestDb(() => Promise.resolve(app.fetch(req, env as never, ctx as never)), (p) => ctx.waitUntil(p))
  },
}
