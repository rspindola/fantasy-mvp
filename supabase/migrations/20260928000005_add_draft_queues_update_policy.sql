-- Migration: Add queues_update policy for draft_queues to allow reordering
DROP POLICY IF EXISTS "queues_update" ON draft_queues;
CREATE POLICY "queues_update" ON draft_queues FOR UPDATE USING (
  EXISTS (SELECT 1 FROM fantasy_teams WHERE id = fantasy_team_id AND user_id = auth.uid())
);
