import { timingSafeEqual } from 'crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';

// Optional: if SERVER_PASSWORD is set, creating a room requires it via the
// X-Server-Password header. Joining only needs the (unguessable) room ID.
const serverPassword = process.env.SERVER_PASSWORD;

export const authRequired = !!serverPassword;

export async function requireServerPassword(req: FastifyRequest, reply: FastifyReply) {
  if (!serverPassword) return;

  const expected = Buffer.from(serverPassword);
  const provided = req.headers['x-server-password'];
  const providedBuf = Buffer.from(typeof provided === 'string' ? provided : '');

  const valid =
    providedBuf.length === expected.length &&
    timingSafeEqual(providedBuf, expected);

  if (!valid) {
    return reply.status(401).send({ error: 'Invalid or missing server password' });
  }
}
