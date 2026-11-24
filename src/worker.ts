import { app } from './app.ts'
import { withRequestDb } from './core/database.ts'

// Cloudflare Workers entry (wrangler.jsonc). Local/Node uses src/index.ts.
export default {
  fetch(req: Request, env: { HYPERDRIVE?: { connectionString: string } }, ctx: { waitUntil(p: Promise<unknown>): void; passThroughOnException(): void }) {
    // Hyperdrive (when bound in wrangler.jsonc) keeps warm pooled connections; without it every request pays a full handshake.
    return withRequestDb(() => Promise.resolve(app.fetch(req, env as never, ctx as never)), (p) => ctx.waitUntil(p), env.HYPERDRIVE?.connectionString)
  },
}
