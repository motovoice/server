import { describe, expect, it, vi } from 'vitest';
import { createRoom, createTestApp } from './helpers.js';

const TOKEN = 'stats-token-for-tests';
const today = () => new Date().toISOString().slice(0, 10);

async function statsApp() {
  vi.stubEnv('STATS_TOKEN', TOKEN);
  return createTestApp();
}

describe('stats API', () => {
  it('is not registered when STATS_TOKEN is unset', async () => {
    const app = await createTestApp();
    const res = await app.inject({ method: 'GET', url: '/api/stats/joins' });
    expect(res.statusCode).toBe(404);
  });

  it.each([
    ['missing', undefined],
    ['wrong', 'wrong-token'],
  ])('rejects a %s token with 401', async (_label, token) => {
    const app = await statsApp();
    const res = await app.inject({
      method: 'GET',
      url: '/api/stats/joins',
      headers: token ? { 'x-stats-token': token } : {},
    });
    expect(res.statusCode).toBe(401);
  });

  it('counts created rooms, joins and distinct devices per day', async () => {
    const app = await statsApp();
    const room = await createRoom(app, { displayName: 'Anna' }, { 'x-device-id': 'device-a' });
    await createRoom(app, { displayName: 'Cleo' });

    for (const [name, device] of [['Ben', 'device-b'], ['Ben', 'device-b'], ['Dora', 'device-d']]) {
      await app.inject({
        method: 'POST',
        url: `/api/rooms/${room.roomId}/join`,
        payload: { displayName: name },
        headers: { 'x-device-id': device },
      });
    }

    const get = async (path: string) => {
      const res = await app.inject({ method: 'GET', url: `/api/stats/${path}`, headers: { 'x-stats-token': TOKEN } });
      expect(res.statusCode).toBe(200);
      return res.json();
    };

    expect(await get('rooms-created')).toEqual([{ day: today(), count: 2 }]);
    expect(await get('joins')).toEqual([{ day: today(), count: 3 }]);
    // device-a (create), device-b (twice), device-d — the room without header is not counted.
    expect(await get('active-devices')).toEqual([{ day: today(), count: 3 }]);
  });

  it.each(['0', '366', 'abc'])('rejects days=%s with 400', async (days) => {
    const app = await statsApp();
    const res = await app.inject({
      method: 'GET',
      url: `/api/stats/joins?days=${days}`,
      headers: { 'x-stats-token': TOKEN },
    });
    expect(res.statusCode).toBe(400);
  });
});
