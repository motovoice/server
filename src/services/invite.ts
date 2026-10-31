import type { FastifyRequest } from 'fastify';

// Public base URL of this server as seen by the app (no trailing slash).
// PUBLIC_URL wins if set; otherwise it is derived from the request, which
// relies on the reverse proxy forwarding Host and X-Forwarded-Proto.
export function getPublicBaseUrl(req: FastifyRequest): string {
  const configured = process.env.PUBLIC_URL?.trim();
  if (configured) return configured.replace(/\/+$/, '');
  return `${req.protocol}://${req.host}`;
}

// Deep link used in QR codes and /join redirects. The app switches to
// `server` if it differs from its currently configured server.
export function buildInviteUri(roomId: string, baseUrl: string): string {
  return `motovoice://join?room=${encodeURIComponent(roomId)}&server=${encodeURIComponent(baseUrl)}`;
}
