-- Migration: Add turn_started_at and paused_remaining_seconds to leagues
ALTER TABLE leagues ADD COLUMN IF NOT EXISTS turn_started_at TIMESTAMPTZ;
ALTER TABLE leagues ADD COLUMN IF NOT EXISTS paused_remaining_seconds INT;
