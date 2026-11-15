import { TokenVerifier } from 'livekit-server-sdk';
import { describe, expect, it } from 'vitest';
import { createLiveKitToken } from '../../src/services/livekit.js';

const verifier = new TokenVerifier(process.env.LIVEKIT_API_KEY!, process.env.LIVEKIT_API_SECRET!);

describe('createLiveKitToken', () => {
  it('signs a token for exactly one room with publish/subscribe rights', async () => {
    const claims = await verifier.verify(await createLiveKitToken('room-1', 'Anna', false));

    expect(claims.name).toBe('Anna');
    expect(claims.video).toMatchObject({
      roomJoin: true,
      room: 'room-1',
      canPublish: true,
      canSubscribe: true,
      canPublishData: false,
      roomAdmin: false,
    });
  });

  it('grants roomAdmin only to the host', async () => {
    const claims = await verifier.verify(await createLiveKitToken('room-1', 'Host', true));
    expect(claims.video?.roomAdmin).toBe(true);
  });

  it('derives a unique identity without whitespace from the display name', async () => {
    const claims = await verifier.verify(await createLiveKitToken('room-1', 'Max  Mustermann', false));
    expect(claims.sub).toMatch(/^Max_Mustermann_\d+$/);
  });

  it('expires after 24 hours', async () => {
    const claims = await verifier.verify(await createLiveKitToken('room-1', 'Anna', false));
    const lifetime = claims.exp! - claims.nbf!;
    expect(lifetime).toBe(24 * 60 * 60);
  });

  it('is rejected when signed with another secret', async () => {
    const token = await createLiveKitToken('room-1', 'Anna', false);
    const foreign = new TokenVerifier(process.env.LIVEKIT_API_KEY!, 'another_secret_that_is_long_enough');
    await expect(foreign.verify(token)).rejects.toThrow();
  });
});
