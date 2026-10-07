-- Migration: Allow auto-picks to be inserted during draft timeout
DROP POLICY IF EXISTS "picks_insert" ON draft_picks;
CREATE POLICY "picks_insert" ON draft_picks FOR INSERT WITH CHECK (
  is_auto_pick = true
  OR
  EXISTS (SELECT 1 FROM fantasy_teams WHERE id = fantasy_team_id AND user_id = auth.uid())
  OR
  EXISTS (SELECT 1 FROM leagues WHERE id = league_id AND commissioner_id = auth.uid())
);
