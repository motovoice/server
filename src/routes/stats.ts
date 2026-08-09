import { timingSafeEqual } from 'crypto';
import type { FastifyPluginAsync } from 'fastify';
import { db } from '../services/db.js';

interface StatsQuery {
  days?: number;
}

const daysQuerystring = {
  type: 'object',
  properties: {
    days: {
      type: 'integer',
      minimum: 1,
      maximum: 365,
      default: 30,
      description: 'How many days to look back',
    },
  },
} as const;

const dailySeriesResponse = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      day: { type: 'string', format: 'date' },
      count: { type: 'integer' },
    },
  },
} as const;

async function dailyEventCount(eventType: string, days: number) {
  const result = await db.query<{ day: string; count: string }>(
    `SELECT date_trunc('day', occurred_at)::date AS day, COUNT(*) AS count
     FROM room_events
     WHERE event_type = $1 AND occurred_at >= NOW() - ($2::int * INTERVAL '1 day')
     GROUP BY day
     ORDER BY day`,
    [eventType, days]
  );
  return result.rows.map((r) => ({ day: r.day, count: Number(r.count) }));
}

async function dailyActiveDevices(days: number) {
  const result = await db.query<{ day: string; count: string }>(
    `SELECT date_trunc('day', occurred_at)::date AS day, COUNT(DISTINCT device_id_hash) AS count
     FROM room_events
     WHERE device_id_hash IS NOT NULL AND occurred_at >= NOW() - ($1::int * INTERVAL '1 day')
     GROUP BY day
     ORDER BY day`,
    [days]
  );
  return result.rows.map((r) => ({ day: r.day, count: Number(r.count) }));
}

// Private stats API for dashboards (e.g. Grafana via the JSON API / Infinity
// plugin). Independent from SERVER_PASSWORD — gated by its own STATS_TOKEN
// so app clients and dashboard access stay separate concerns. Disabled
// entirely (routes not registered) unless STATS_TOKEN is set, so it can
// never end up unauthenticated by accident.
export const statsRoutes: FastifyPluginAsync = async (app) => {
  const token = process.env.STATS_TOKEN;
  if (!token) {
    app.log.warn('STATS_TOKEN not set — /api/stats endpoints are disabled');
    return;
  }
  const expected = Buffer.from(token);

  app.addHook('onRequest', async (req, reply) => {
    const provided = req.headers['x-stats-token'];
    const providedBuf = Buffer.from(typeof provided === 'string' ? provided : '');

    const valid =
      providedBuf.length === expected.length && timingSafeEqual(providedBuf, expected);

    if (!valid) {
      return reply.status(401).send({ error: 'Invalid or missing stats token' });
    }
  });

  app.get<{ Querystring: StatsQuery }>('/stats/rooms-created', {
    schema: {
      tags: ['Stats'],
      summary: 'Rooms created per day',
      security: [{ statsToken: [] }],
      querystring: daysQuerystring,
      response: { 200: dailySeriesResponse },
    },
  }, async (req) => dailyEventCount('created', req.query.days ?? 30));

  app.get<{ Querystring: StatsQuery }>('/stats/joins', {
    schema: {
      tags: ['Stats'],
      summary: 'Room joins per day',
      security: [{ statsToken: [] }],
      querystring: daysQuerystring,
      response: { 200: dailySeriesResponse },
    },
  }, async (req) => dailyEventCount('joined', req.query.days ?? 30));

  app.get<{ Querystring: StatsQuery }>('/stats/active-devices', {
    schema: {
      tags: ['Stats'],
      summary: 'Distinct anonymous devices per day',
      security: [{ statsToken: [] }],
      querystring: daysQuerystring,
      response: { 200: dailySeriesResponse },
    },
  }, async (req) => dailyActiveDevices(req.query.days ?? 30));
};
