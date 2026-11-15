import { randomUUID } from 'crypto';
import { describe, expect, it, vi } from 'vitest';
import { hashDeviceId } from '../../src/services/deviceId.js';
import { roomService } from '../../src/services/livekit.js';
import { createRoom, createTestApp, db, tokenVerifier } from './helpers.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

async function roomRow(id: string) {
  const res = await db.query('SELECT * FROM rooms WHERE id = $1', [id]);
  return res.rows[0];
}

async function events(id: string) {
  const res = await db.query(
    'SELECT event_type, display_name, device_id_hash FROM room_events WHERE room_id = $1 ORDER BY id',
    [id],
  );
  return res.rows;
}

describe('POST /api/rooms', () => {
  it('creates a room and returns a host token', async () => {
    const app = await createTestApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/rooms',
      payload: { displayName: 'Anna' },
      headers: { 'x-device-id': 'device-1' },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.roomId).toMatch(UUID);
    expect(body.deleteSecret).toMatch(UUID);
    expect(body.hostIdentity).toBe('Anna');
    expect(body.livekitUrl).toBe(process.env.LIVEKIT_URL);
    expect(new Date(body.expiresAt).getTime()).toBeGreaterThan(Date.now() + 23 * 3600_000);

    const claims = await tokenVerifier.verify(body.livekitToken);
    expect(claims.video).toMatchObject({ room: body.roomId, roomAdmin: true });

    const row = await roomRow(body.roomId);
    expect(row).toMatchObject({ created_by: 'Anna', host_identity: 'Anna', is_active: true });
    expect(await events(body.roomId)).toEqual([
      { event_type: 'created', display_name: 'Anna', device_id_hash: hashDeviceId('device-1') },
    ]);
  });

  it('defaults the host name and stores no device hash without header', async () => {
    const app = await createTestApp();
    const room = await createRoom(app, {});

    expect(room.hostIdentity).toBe('Host');
    expect((await events(room.roomId))[0].device_id_hash).toBeNull();
  });

  it('returns an invite link pointing at PUBLIC_URL', async () => {
    vi.stubEnv('PUBLIC_URL', 'https://api.example.com/');
    const app = await createTestApp();
    const room = await createRoom(app);

    expect(room.qrPayload).toBe(
      `motovoice://join?room=${room.roomId}&server=${encodeURIComponent('https://api.example.com')}`,
    );
  });

  describe('with SERVER_PASSWORD set', () => {
    it.each([
      ['a missing password', undefined],
      ['a wrong password', 'wrong-password'],
      ['a prefix of the password', 'secret'],
    ])('rejects %s with 401', async (_label, password) => {
      vi.stubEnv('SERVER_PASSWORD', 'secret-password');
      const app = await createTestApp();
      const res = await app.inject({
        method: 'POST',
        url: '/api/rooms',
        payload: { displayName: 'Anna' },
        headers: password ? { 'x-server-password': password } : {},
      });

      expect(res.statusCode).toBe(401);
      expect((await db.query('SELECT count(*)::int AS n FROM rooms')).rows[0].n).toBe(0);
    });

    it('accepts the correct password', async () => {
      vi.stubEnv('SERVER_PASSWORD', 'secret-password');
      const app = await createTestApp();
      const room = await createRoom(app, { displayName: 'Anna' }, { 'x-server-password': 'secret-password' });
      expect(room.roomId).toMatch(UUID);
    });

    it('still lets guests join without a password', async () => {
      vi.stubEnv('SERVER_PASSWORD', 'secret-password');
      const app = await createTestApp();
      const room = await createRoom(app, { displayName: 'Anna' }, { 'x-server-password': 'secret-password' });

      const res = await app.inject({
        method: 'POST',
        url: `/api/rooms/${room.roomId}/join`,
        payload: { displayName: 'Ben' },
      });
      expect(res.statusCode).toBe(200);
    });
  });
});

describe('POST /api/rooms/:id/join', () => {
  it('returns a guest token and counts the participant', async () => {
    const app = await createTestApp();
    const room = await createRoom(app, { displayName: 'Anna' });

    const res = await app.inject({
      method: 'POST',
      url: `/api/rooms/${room.roomId}/join`,
      payload: { displayName: 'Ben' },
      headers: { 'x-device-id': 'device-2' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toMatchObject({ roomId: room.roomId, hostIdentity: 'Anna', livekitUrl: process.env.LIVEKIT_URL });

    const claims = await tokenVerifier.verify(body.livekitToken);
    expect(claims.name).toBe('Ben');
    expect(claims.video).toMatchObject({ room: room.roomId, roomAdmin: false });

    expect((await roomRow(room.roomId)).participant_count).toBe(1);
    expect((await events(room.roomId)).at(-1)).toEqual({
      event_type: 'joined',
      display_name: 'Ben',
      device_id_hash: hashDeviceId('device-2'),
    });
  });

  it.each([
    ['missing displayName', {}],
    ['blank displayName', { displayName: '   ' }],
  ])('rejects %s with 400', async (_label, payload) => {
    const app = await createTestApp();
    const room = await createRoom(app);

    const res = await app.inject({ method: 'POST', url: `/api/rooms/${room.roomId}/join`, payload });
    expect(res.statusCode).toBe(400);
  });

  it('rejects a malformed room ID with 400', async () => {
    const app = await createTestApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/rooms/not-a-uuid/join',
      payload: { displayName: 'Ben' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 404 for an unknown room', async () => {
    const app = await createTestApp();
    const res = await app.inject({
      method: 'POST',
      url: `/api/rooms/${randomUUID()}/join`,
      payload: { displayName: 'Ben' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 404 for an expired room', async () => {
    const app = await createTestApp();
    const room = await createRoom(app);
    await db.query(`UPDATE rooms SET expires_at = now() - interval '1 minute' WHERE id = $1`, [room.roomId]);

    const res = await app.inject({
      method: 'POST',
      url: `/api/rooms/${room.roomId}/join`,
      payload: { displayName: 'Ben' },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('POST /api/rooms/:id/leave', () => {
  it('decrements the participant count and logs the event', async () => {
    const app = await createTestApp();
    const room = await createRoom(app);
    await app.inject({ method: 'POST', url: `/api/rooms/${room.roomId}/join`, payload: { displayName: 'Ben' } });

    const res = await app.inject({
      method: 'POST',
      url: `/api/rooms/${room.roomId}/leave`,
      payload: { displayName: 'Ben' },
    });

    expect(res.statusCode).toBe(204);
    expect((await roomRow(room.roomId)).participant_count).toBe(0);
    expect((await events(room.roomId)).at(-1)).toMatchObject({ event_type: 'left', display_name: 'Ben' });
  });

  it('never lets the participant count go below zero', async () => {
    const app = await createTestApp();
    const room = await createRoom(app);

    await app.inject({ method: 'POST', url: `/api/rooms/${room.roomId}/leave`, payload: { displayName: 'Ben' } });
    expect((await roomRow(room.roomId)).participant_count).toBe(0);
  });

  it('returns 404 for an unknown room', async () => {
    const app = await createTestApp();
    const res = await app.inject({
      method: 'POST',
      url: `/api/rooms/${randomUUID()}/leave`,
      payload: { displayName: 'Ben' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('rejects a blank displayName with 400', async () => {
    const app = await createTestApp();
    const room = await createRoom(app);
    const res = await app.inject({
      method: 'POST',
      url: `/api/rooms/${room.roomId}/leave`,
      payload: { displayName: ' ' },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('GET /api/rooms/:id', () => {
  it('returns the room status without secrets', async () => {
    const app = await createTestApp();
    const room = await createRoom(app);

    const res = await app.inject({ method: 'GET', url: `/api/rooms/${room.roomId}` });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toMatchObject({ id: room.roomId, participant_count: 0, is_active: true });
    expect(Object.keys(body).sort()).toEqual(['created_at', 'expires_at', 'id', 'is_active', 'participant_count']);
  });

  it('returns 404 for an unknown room', async () => {
    const app = await createTestApp();
    const res = await app.inject({ method: 'GET', url: `/api/rooms/${randomUUID()}` });
    expect(res.statusCode).toBe(404);
  });
});

describe('DELETE /api/rooms/:id', () => {
  it('deactivates the room and closes it in LiveKit', async () => {
    const deleteRoom = vi.spyOn(roomService, 'deleteRoom').mockResolvedValue();
    const app = await createTestApp();
    const room = await createRoom(app);

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/rooms/${room.roomId}`,
      headers: { authorization: `Bearer ${room.deleteSecret}` },
    });

    expect(res.statusCode).toBe(204);
    expect(deleteRoom).toHaveBeenCalledWith(room.roomId);
    expect((await roomRow(room.roomId)).is_active).toBe(false);

    const join = await app.inject({
      method: 'POST',
      url: `/api/rooms/${room.roomId}/join`,
      payload: { displayName: 'Ben' },
    });
    expect(join.statusCode).toBe(404);
  });

  it('succeeds even if the LiveKit room is already gone', async () => {
    vi.spyOn(roomService, 'deleteRoom').mockRejectedValue(new Error('room not found'));
    const app = await createTestApp();
    const room = await createRoom(app);

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/rooms/${room.roomId}`,
      headers: { authorization: `Bearer ${room.deleteSecret}` },
    });
    expect(res.statusCode).toBe(204);
  });

  it.each([
    ['no authorization header', undefined],
    ['a non-Bearer scheme', 'Basic abc'],
    ['a wrong secret', `Bearer ${randomUUID()}`],
  ])('rejects %s with 403 and keeps the room', async (_label, authorization) => {
    const deleteRoom = vi.spyOn(roomService, 'deleteRoom').mockResolvedValue();
    const app = await createTestApp();
    const room = await createRoom(app);

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/rooms/${room.roomId}`,
      headers: authorization ? { authorization } : {},
    });

    expect(res.statusCode).toBe(403);
    expect(deleteRoom).not.toHaveBeenCalled();
    expect((await roomRow(room.roomId)).is_active).toBe(true);
  });

  it('does not accept the secret of another room', async () => {
    vi.spyOn(roomService, 'deleteRoom').mockResolvedValue();
    const app = await createTestApp();
    const roomA = await createRoom(app);
    const roomB = await createRoom(app);

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/rooms/${roomA.roomId}`,
      headers: { authorization: `Bearer ${roomB.deleteSecret}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it('returns 404 for an unknown room', async () => {
    const app = await createTestApp();
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/rooms/${randomUUID()}`,
      headers: { authorization: `Bearer ${randomUUID()}` },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('deactivate_expired_rooms()', () => {
  it('deactivates only expired rooms and reports how many', async () => {
    const app = await createTestApp();
    const expired = await createRoom(app);
    const active = await createRoom(app);
    await db.query(`UPDATE rooms SET expires_at = now() - interval '1 second' WHERE id = $1`, [expired.roomId]);

    const res = await db.query('SELECT deactivate_expired_rooms() AS n');

    expect(res.rows[0].n).toBe(1);
    expect((await roomRow(expired.roomId)).is_active).toBe(false);
    expect((await roomRow(active.roomId)).is_active).toBe(true);
  });
});
