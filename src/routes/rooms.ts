import type { FastifyPluginAsync } from 'fastify';
import { db } from '../services/db.js';
import { createLiveKitToken, roomService } from '../services/livekit.js';

interface CreateRoomBody {
  displayName?: string;
}

interface JoinRoomBody {
  displayName: string;
}

interface RoomParams {
  id: string;
}

// ─── Shared schema fragments ───────────────────────────────────
const roomIdParam = {
  type: 'object',
  properties: { id: { type: 'string', format: 'uuid', description: 'Room ID' } },
  required: ['id'],
} as const;

export const roomRoutes: FastifyPluginAsync = async (app) => {

  // ─── POST /api/rooms — Create new room ────────────────────
  app.post<{ Body: CreateRoomBody }>('/rooms', {
    schema: {
      tags: ['Rooms'],
      summary: 'Create a new room',
      security: [{}, { serverPassword: [] }],
      body: {
        type: 'object',
        properties: {
          displayName: { type: 'string', description: 'Host display name', default: 'Host' },
        },
      },
      response: {
        201: {
          type: 'object',
          properties: {
            roomId:       { type: 'string', format: 'uuid' },
            livekitToken: { type: 'string' },
            livekitUrl:   { type: 'string' },
            expiresAt:    { type: 'string', format: 'date-time' },
            qrPayload:    { type: 'string' },
            hostIdentity: { type: 'string' },
            deleteSecret: { type: 'string', format: 'uuid', description: 'Required to delete this room — store securely' },
          },
        },
      },
    },
  }, async (req, reply) => {
    const displayName = req.body?.displayName || 'Host';

    const result = await db.query<{ id: string; expires_at: Date; delete_secret: string }>(
      `INSERT INTO rooms (created_by, host_identity)
       VALUES ($1, $1)
       RETURNING id, expires_at, delete_secret`,
      [displayName]
    );
    const room = result.rows[0];

    await db.query(
      `INSERT INTO room_events (room_id, event_type, display_name) VALUES ($1, 'created', $2)`,
      [room.id, displayName]
    );

    const livekitToken = await createLiveKitToken(room.id, displayName, true);

    return reply.status(201).send({
      roomId:       room.id,
      livekitToken,
      livekitUrl:   process.env.LIVEKIT_URL,
      expiresAt:    room.expires_at,
      qrPayload:    `motovoice://join?room=${room.id}`,
      hostIdentity: displayName,
      deleteSecret: room.delete_secret,
    });
  });

  // ─── POST /api/rooms/:id/join — Join room ─────────────────
  app.post<{ Params: RoomParams; Body: JoinRoomBody }>(
    '/rooms/:id/join',
    {
      schema: {
        tags: ['Rooms'],
        summary: 'Join an existing room as a guest',
        security: [{}, { serverPassword: [] }],
        params: roomIdParam,
        body: {
          type: 'object',
          required: ['displayName'],
          properties: {
            displayName: { type: 'string', description: 'Guest display name' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              roomId:       { type: 'string', format: 'uuid' },
              livekitToken: { type: 'string' },
              livekitUrl:   { type: 'string' },
              hostIdentity: { type: 'string' },
            },
          },
          400: { type: 'object', properties: { error: { type: 'string' } } },
          404: { type: 'object', properties: { error: { type: 'string' } } },
        },
      },
    },
    async (req, reply) => {
      const { id } = req.params;
      const { displayName } = req.body;

      if (!displayName?.trim()) {
        return reply.status(400).send({ error: 'displayName is required' });
      }

      const roomResult = await db.query<{ host_identity: string }>(
        `SELECT host_identity FROM rooms WHERE id = $1 AND is_active = true AND expires_at > NOW()`,
        [id]
      );
      if (roomResult.rows.length === 0) {
        return reply.status(404).send({ error: 'Room not found or already expired' });
      }

      await db.query(
        `UPDATE rooms SET participant_count = participant_count + 1 WHERE id = $1`,
        [id]
      );

      await db.query(
        `INSERT INTO room_events (room_id, event_type, display_name) VALUES ($1, 'joined', $2)`,
        [id, displayName]
      );

      const livekitToken = await createLiveKitToken(id, displayName, false);

      return {
        roomId:       id,
        livekitToken,
        livekitUrl:   process.env.LIVEKIT_URL,
        hostIdentity: roomResult.rows[0].host_identity,
      };
    }
  );

  // ─── POST /api/rooms/:id/leave — Leave room ──────────────
  app.post<{ Params: RoomParams; Body: JoinRoomBody }>(
    '/rooms/:id/leave',
    {
      schema: {
        tags: ['Rooms'],
        summary: 'Leave a room',
        security: [{}, { serverPassword: [] }],
        params: roomIdParam,
        body: {
          type: 'object',
          required: ['displayName'],
          properties: {
            displayName: { type: 'string' },
          },
        },
        response: {
          204: { type: 'null', description: 'Successfully left' },
          400: { type: 'object', properties: { error: { type: 'string' } } },
          404: { type: 'object', properties: { error: { type: 'string' } } },
        },
      },
    },
    async (req, reply) => {
      const { id } = req.params;
      const { displayName } = req.body;

      if (!displayName?.trim()) {
        return reply.status(400).send({ error: 'displayName is required' });
      }

      const result = await db.query(
        `UPDATE rooms
         SET participant_count = GREATEST(participant_count - 1, 0)
         WHERE id = $1 AND is_active = true
         RETURNING id`,
        [id]
      );
      if (result.rows.length === 0) {
        return reply.status(404).send({ error: 'Room not found or already expired' });
      }

      await db.query(
        `INSERT INTO room_events (room_id, event_type, display_name) VALUES ($1, 'left', $2)`,
        [id, displayName]
      );

      return reply.status(204).send();
    }
  );

  // ─── GET /api/rooms/:id — Get room status ─────────────────
  app.get<{ Params: RoomParams }>('/rooms/:id', {
    schema: {
      tags: ['Rooms'],
      summary: 'Get room status',
      security: [{}, { serverPassword: [] }],
      params: roomIdParam,
      response: {
        200: {
          type: 'object',
          properties: {
            id:                { type: 'string', format: 'uuid' },
            created_at:        { type: 'string', format: 'date-time' },
            expires_at:        { type: 'string', format: 'date-time' },
            participant_count: { type: 'integer' },
            is_active:         { type: 'boolean' },
          },
        },
        404: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
  }, async (req, reply) => {
    const { id } = req.params;

    const result = await db.query(
      `SELECT id, created_at, expires_at, participant_count, is_active
       FROM rooms WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return reply.status(404).send({ error: 'Room not found' });
    }

    return result.rows[0];
  });

  // ─── DELETE /api/rooms/:id — Close livekit room ──────────────
  app.delete<{ Params: RoomParams }>('/rooms/:id', {
    schema: {
      tags: ['Rooms'],
      summary: 'Delete a room',
      description: 'Requires the `deleteSecret` returned by POST /api/rooms as a Bearer token.',
      security: [{ deleteSecret: [] }, { deleteSecret: [], serverPassword: [] }],
      params: roomIdParam,
      response: {
        204: { type: 'null', description: 'Room deleted' },
        403: { type: 'object', properties: { error: { type: 'string' } } },
        404: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
  }, async (req, reply) => {
    const { id } = req.params;

    const authHeader = req.headers['authorization'];
    const secret = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!secret) {
      return reply.status(403).send({ error: 'Missing delete secret' });
    }

    const roomResult = await db.query<{ delete_secret: string }>(
      `SELECT delete_secret FROM rooms WHERE id = $1`,
      [id]
    );

    if (roomResult.rows.length === 0) {
      return reply.status(404).send({ error: 'Room not found' });
    }

    if (roomResult.rows[0].delete_secret !== secret) {
      return reply.status(403).send({ error: 'Invalid delete secret' });
    }

    await db.query(
      `UPDATE rooms SET is_active = false WHERE id = $1`,
      [id]
    );

    try {
      await roomService.deleteRoom(id);
    } catch {
      // room may already be deleted in LiveKit
    }

    return reply.status(204).send();
  });
};
