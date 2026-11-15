import type { FastifyRequest } from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import { buildInviteUri, getPublicBaseUrl } from '../../src/services/invite.js';

const fakeRequest = (protocol: 'http' | 'https', host: string) =>
  ({ protocol, host }) as FastifyRequest;

describe('buildInviteUri', () => {
  it('builds a motovoice deep link with room and server', () => {
    expect(buildInviteUri('room-1', 'https://api.example.com')).toBe(
      'motovoice://join?room=room-1&server=https%3A%2F%2Fapi.example.com',
    );
  });

  it('encodes values so they cannot inject extra query parameters', () => {
    const uri = new URL(buildInviteUri('a&server=evil', 'https://api.example.com/x?y=1'));
    expect(uri.searchParams.getAll('server')).toEqual(['https://api.example.com/x?y=1']);
    expect(uri.searchParams.get('room')).toBe('a&server=evil');
  });
});

describe('getPublicBaseUrl', () => {
  it('prefers PUBLIC_URL and strips trailing slashes and whitespace', () => {
    vi.stubEnv('PUBLIC_URL', '  https://api.example.com//  ');
    expect(getPublicBaseUrl(fakeRequest('http', 'internal:3000'))).toBe('https://api.example.com');
  });

  it('falls back to the request protocol and host', () => {
    expect(getPublicBaseUrl(fakeRequest('https', 'api.example.org'))).toBe('https://api.example.org');
  });

  it('ignores a blank PUBLIC_URL', () => {
    vi.stubEnv('PUBLIC_URL', '   ');
    expect(getPublicBaseUrl(fakeRequest('http', 'localhost:3000'))).toBe('http://localhost:3000');
  });
});
