import { createHash } from 'crypto';

// Hashes the client-generated, random device ID (X-Device-Id header) so we
// never persist it in plain text. Used only for anonymous usage stats
// (e.g. distinct daily devices) — never linked to a display name or IP.
export function hashDeviceId(deviceId: string): string {
  return createHash('sha256').update(deviceId).digest('hex');
}
