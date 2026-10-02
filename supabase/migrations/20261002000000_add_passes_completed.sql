-- Migration: Add passes_completed to player_fixture_stats
ALTER TABLE player_fixture_stats 
ADD COLUMN IF NOT EXISTS passes_completed INT DEFAULT 0;
