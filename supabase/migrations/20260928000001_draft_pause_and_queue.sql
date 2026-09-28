-- Migration: Add is_paused to leagues and draft_queues table

ALTER TABLE leagues ADD COLUMN IF NOT EXISTS is_paused BOOLEAN DEFAULT false;

CREATE TABLE IF NOT EXISTS draft_queues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fantasy_team_id UUID REFERENCES fantasy_teams(id) ON DELETE CASCADE NOT NULL,
  player_id UUID REFERENCES real_players(id) ON DELETE CASCADE NOT NULL,
  priority INT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(fantasy_team_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_draft_queues_team ON draft_queues(fantasy_team_id, priority);

ALTER TABLE draft_queues ENABLE ROW LEVEL SECURITY;

CREATE POLICY "queues_read" ON draft_queues FOR SELECT USING (true);
CREATE POLICY "queues_insert" ON draft_queues FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM fantasy_teams WHERE id = fantasy_team_id AND user_id = auth.uid())
);
CREATE POLICY "queues_delete" ON draft_queues FOR DELETE USING (
  EXISTS (SELECT 1 FROM fantasy_teams WHERE id = fantasy_team_id AND user_id = auth.uid())
);
