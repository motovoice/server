import { describe, expect, it } from 'vitest';
import { hashDeviceId } from '../../src/services/deviceId.js';

describe('hashDeviceId', () => {
  it('returns the SHA-256 hex digest', () => {
    expect(hashDeviceId('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('is deterministic and never returns the raw ID', () => {
    const id = '0b6f3c1e-1111-4222-8333-944455556666';
    expect(hashDeviceId(id)).toBe(hashDeviceId(id));
    expect(hashDeviceId(id)).not.toContain(id);
    expect(hashDeviceId(id)).not.toBe(hashDeviceId(`${id}x`));
  });
});
