import 'dotenv/config';
import { timingSafeEqual } from 'crypto';
import Fastify from 'fastify';
import { createRequire } from 'module';
const { version } = createRequire(import.meta.url)('../package.json');
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { roomRoutes } from './routes/rooms.js';
import { statsRoutes } from './routes/stats.js';
import { db } from './services/db.js';
import { runMigrations } from './services/migrate.js';

const app = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || 'info',
  },
});

// ─── Plugins ──────────────────────────────────────────────────
await app.register(cors, {
  origin: '*',
  methods: ['GET', 'POST', 'DELETE'],
});

await app.register(jwt, {
  secret: process.env.JWT_SECRET!,
});

await app.register(swagger, {
  openapi: {
    info: {
      title: 'MotoVoice API',
      description: 'Backend API for MotoVoice',
      version: version,
    },
    components: {
      securitySchemes: {
        deleteSecret: {
          type: 'http',
          scheme: 'bearer',
          description: 'Room delete secret returned by POST /api/rooms',
        },
        serverPassword: {
          type: 'apiKey',
          in: 'header',
          name: 'X-Server-Password',
          description: 'Server access password. Only required if SERVER_PASSWORD is set on the server.',
        },
        statsToken: {
          type: 'apiKey',
          in: 'header',
          name: 'X-Stats-Token',
          description: 'Private token for the stats API. Endpoints are disabled unless STATS_TOKEN is set on the server.',
        },
      },
    },
  },
});

await app.register(swaggerUi, {
  routePrefix: '/docs',
  uiConfig: { docExpansion: 'list' },
});

// ─── Optional server password ──────────────────────────────────
// If SERVER_PASSWORD is set, all /api requests must send it via the
// X-Server-Password header. Leave unset to disable this check.
const serverPassword = process.env.SERVER_PASSWORD;
if (serverPassword) {
  const expected = Buffer.from(serverPassword);
  app.addHook('onRequest', async (req, reply) => {
    // /api/stats has its own, independent STATS_TOKEN check.
    if (!req.url.startsWith('/api') || req.url.startsWith('/api/stats')) return;

    const provided = req.headers['x-server-password'];
    const providedBuf = Buffer.from(typeof provided === 'string' ? provided : '');

    const valid =
      providedBuf.length === expected.length &&
      timingSafeEqual(providedBuf, expected);

    if (!valid) {
      return reply.status(401).send({ error: 'Invalid or missing server password' });
    }
  });
  app.log.info('Server password protection enabled for /api');
}

// ─── Routes ───────────────────────────────────────────────────
await app.register(roomRoutes, { prefix: '/api' });
await app.register(statsRoutes, { prefix: '/api' });

// Deep link redirect: /join/<roomId> → motovoice://join?room=<roomId>
app.get<{ Params: { id: string } }>('/join/:id', async (req, reply) => {
  const { id } = req.params;
  return reply.redirect(`motovoice://join?room=${id}`, 302);
});

app.get('/health', async () => ({
  status: 'ok',
  version,
  authRequired: !!serverPassword,
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
await runMigrations();

const port = Number(process.env.PORT) || 3000;
await app.listen({ port, host: '0.0.0.0' });
app.log.info(`MotoVoice server running on port ${port}`);