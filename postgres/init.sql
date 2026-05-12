CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── Rooms ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rooms (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    host_identity   TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at      TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '24 hours'),
    created_by      TEXT,
    participant_count INTEGER NOT NULL DEFAULT 0,
    is_active       BOOLEAN NOT NULL DEFAULT true
);

-- Index for faster lookups
CREATE INDEX idx_rooms_active ON rooms (id) WHERE is_active = true;
CREATE INDEX idx_rooms_expires ON rooms (expires_at);

-- ─── Cleanup Function ─────────────
CREATE OR REPLACE FUNCTION deactivate_expired_rooms()
RETURNS INTEGER AS $$
DECLARE
    affected INTEGER;
BEGIN
    UPDATE rooms
    SET    is_active = false
    WHERE  expires_at < now()
    AND    is_active  = true;
    GET DIAGNOSTICS affected = ROW_COUNT;
    RETURN affected;
END;
$$ LANGUAGE plpgsql;

-- ─── Audit Log ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS room_events (
    id         BIGSERIAL PRIMARY KEY,
    room_id    UUID REFERENCES rooms(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,   -- 'created' | 'joined' | 'left' | 'expired'
    display_name TEXT,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_room_events_room ON room_events (room_id);