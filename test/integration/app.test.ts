import { randomUUID } from 'crypto';
import { createRequire } from 'module';
import { describe, expect, it, vi } from 'vitest';
import { createTestApp } from './helpers.js';

const { version } = createRequire(import.meta.url)('../../package.json');

describe('GET /health', () => {
  it('reports status and version', async () => {
    const app = await createTestApp();
    const res = await app.inject({ method: 'GET', url: '/health' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'ok', version, authRequired: false });
  });

  it('tells clients when creating rooms needs a password', async () => {
    vi.stubEnv('SERVER_PASSWORD', 'secret-password');
    const app = await createTestApp();
    const res = await app.inject({ method: 'GET', url: '/health' });

    expect(res.json().authRequired).toBe(true);
    expect(res.body).not.toContain('secret-password');
  });
});

describe('GET /join/:id', () => {
  it('redirects to the app deep link with PUBLIC_URL as server', async () => {
    vi.stubEnv('PUBLIC_URL', 'https://api.example.com');
    const app = await createTestApp();
    const id = randomUUID();

    const res = await app.inject({ method: 'GET', url: `/join/${id}` });

    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe(
      `motovoice://join?room=${id}&server=${encodeURIComponent('https://api.example.com')}`,
    );
  });

  it('derives the server from proxy headers without PUBLIC_URL', async () => {
    const app = await createTestApp();
    const id = randomUUID();

    const res = await app.inject({
      method: 'GET',
      url: `/join/${id}`,
      headers: { 'x-forwarded-proto': 'https', 'x-forwarded-host': 'api.example.org' },
    });

    const location = new URL(res.headers.location as string);
    expect(location.searchParams.get('server')).toBe('https://api.example.org');
  });

  it('rejects IDs that are not UUIDs, so no foreign server can be injected', async () => {
    const app = await createTestApp();
    const res = await app.inject({
      method: 'GET',
      url: `/join/${encodeURIComponent('x&server=https://evil.example')}`,
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('OpenAPI docs', () => {
  it('documents the public routes and hides the redirect', async () => {
    const app = await createTestApp();
    const res = await app.inject({ method: 'GET', url: '/docs/json' });

    expect(res.statusCode).toBe(200);
    const paths = Object.keys(res.json().paths);
    expect(paths).toEqual(expect.arrayContaining(['/api/rooms', '/api/rooms/{id}', '/api/rooms/{id}/join', '/health']));
    expect(paths).not.toContain('/join/{id}');
  });
});
