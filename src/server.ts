import 'dotenv/config';
import { buildApp } from './app.js';
import { db } from './services/db.js';
import { runMigrations } from './services/migrate.js';

const app = await buildApp();

// ─── Cleanup Job: delete expired rooms ──────────────
setInterval(async () => {
  try {
    const result = await db.query('SELECT deactivate_expired_rooms()');
    const count = result.rows[0]?.deactivate_expired_rooms ?? 0;
    if (count > 0) app.log.info(`Cleanup: ${count} expired rooms deleted`);
  } catch (err: any) {
    app.log.error('Cleanup-Job error:', err);
  }
}, 60 * 60 * 1000); // hourly

// ─── Start ────────────────────────────────────────────────────
await runMigrations();

const port = Number(process.env.PORT) || 3000;
await app.listen({ port, host: '0.0.0.0' });
app.log.info(`MotoVoice server running on port ${port}`);