import type { FastifyInstance } from 'fastify';
import { TokenVerifier } from 'livekit-server-sdk';
import { afterEach } from 'vitest';
import { buildApp } from '../../src/app.js';

export { db } from '../../src/services/db.js';

const openApps: FastifyInstance[] = [];

afterEach(async () => {
  await Promise.all(openApps.splice(0).map((app) => app.close()));
});

// Builds a fresh app per test so env stubs (SERVER_PASSWORD, STATS_TOKEN …)
// set before the call take effect. Closed automatically after the test.
export async function createTestApp(): Promise<FastifyInstance> {
  const app = await buildApp({ logger: false });
  await app.ready();
  openApps.push(app);
  return app;
}

export const tokenVerifier = new TokenVerifier(
  process.env.LIVEKIT_API_KEY!,
  process.env.LIVEKIT_API_SECRET!,
);

export interface CreatedRoom {
  roomId: string;
  livekitToken: string;
  livekitUrl: string;
  expiresAt: string;
  qrPayload: string;
  hostIdentity: string;
  deleteSecret: string;
}

export async function createRoom(
  app: FastifyInstance,
  body: Record<string, unknown> = { displayName: 'Host' },
  headers: Record<string, string> = {},
): Promise<CreatedRoom> {
  const res = await app.inject({ method: 'POST', url: '/api/rooms', payload: body, headers });
  if (res.statusCode !== 201) {
    throw new Error(`Creating a room failed with ${res.statusCode}: ${res.body}`);
  }
  return res.json();
}
