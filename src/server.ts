import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import { roomRoutes } from './routes/rooms.js';
import { db } from './services/db.js';

const app = Fastify({ logger: true });

// ─── Plugins ──────────────────────────────────────────────────
await app.register(cors, {
  origin: '*',
  methods: ['GET', 'POST', 'DELETE'],
});

await app.register(jwt, {
  secret: process.env.JWT_SECRET!,
});

// ─── Routes ───────────────────────────────────────────────────
await app.register(roomRoutes, { prefix: '/api' });

// Deep link redirect: /join/<roomId> → motovoice://join?room=<roomId>
app.get<{ Params: { id: string } }>('/join/:id', async (req, reply) => {
  const { id } = req.params;
  return reply.redirect(`motovoice://join?room=${id}`, 302);
});

app.get('/health', async () => ({
  status: 'ok',
  timestamp: new Date().toISOString(),
}));

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
const port = Number(process.env.PORT) || 3000;
await app.listen({ port, host: '0.0.0.0' });
app.log.info(`MotoVoice server running on port ${port}`);