import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';

const apiKey    = process.env.LIVEKIT_API_KEY!;
const apiSecret = process.env.LIVEKIT_API_SECRET!;
const livekitUrl = process.env.LIVEKIT_URL!;

if (!apiKey || !apiSecret || !livekitUrl) {
  throw new Error('Missing livekit environment variables (LIVEKIT_API_KEY, LIVEKIT_API_SECRET, LIVEKIT_URL)');
}

export const roomService = new RoomServiceClient(
  livekitUrl.replace('wss://', 'https://').replace('ws://', 'http://'),
  apiKey,
  apiSecret
);

/**
 * generate access token
 */
export async function createLiveKitToken(
  roomId: string,
  displayName: string,
  isHost = false
): Promise<string> {
  const participantId = `${displayName.replace(/\s+/g, '_')}_${Date.now()}`;

  const at = new AccessToken(apiKey, apiSecret, {
    identity: participantId,
    name: displayName,
    ttl: '24h',
  });

  at.addGrant({
    roomJoin:        true,
    room:            roomId,
    canPublish:      true,
    canSubscribe:    true,
    canPublishData:  false,
    roomAdmin:       isHost,
  });

  return at.toJwt();
}