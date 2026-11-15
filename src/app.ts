import Fastify, { type FastifyServerOptions } from 'fastify';
import { createRequire } from 'module';
const { version } = createRequire(import.meta.url)('../package.json');
import cors from '@fastify/cors';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { roomRoutes } from './routes/rooms.js';
import { statsRoutes } from './routes/stats.js';
import { buildInviteUri, getPublicBaseUrl } from './services/invite.js';
import { isAuthRequired } from './services/serverPassword.js';

// Builds the Fastify instance with all plugins and routes, without starting
// to listen or running background jobs, so tests can drive it via inject().
export async function buildApp(options: { logger?: FastifyServerOptions['logger'] } = {}) {
  const app = Fastify({
    // Behind a reverse proxy: honour X-Forwarded-Proto/Host so invite links
    // carry the public URL. The port is only bound to localhost.
    trustProxy: true,
    logger: options.logger ?? {
      level: process.env.LOG_LEVEL || 'info',
    },
  });

  // ─── Plugins ──────────────────────────────────────────────────
  await app.register(cors, {
    origin: '*',
    methods: ['GET', 'POST', 'DELETE'],
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
            description: 'Server password for creating rooms. Only required if SERVER_PASSWORD is set on the server.',
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

  // ─── Routes ───────────────────────────────────────────────────
  await app.register(roomRoutes, { prefix: '/api' });
  await app.register(statsRoutes, { prefix: '/api' });

  // Deep link redirect: /join/<roomId> → motovoice://join?room=<roomId>&server=<public URL>
  app.get<{ Params: { id: string } }>('/join/:id', {
    schema: {
      hide: true,
      params: {
        type: 'object',
        properties: { id: { type: 'string', format: 'uuid' } },
        required: ['id'],
      },
    },
  }, async (req, reply) => {
    const { id } = req.params;
    return reply.redirect(buildInviteUri(id, getPublicBaseUrl(req)), 302);
  });

  app.get('/health', async () => ({
    status: 'ok',
    version,
    authRequired: isAuthRequired(),
    timestamp: new Date().toISOString(),
  }));

  return app;
}
