-- Migration: Allow league commissioner to insert draft picks on behalf of any team in their league
-- and allow roster consolidation upon draft completion

DROP POLICY IF EXISTS "picks_insert" ON draft_picks;
CREATE POLICY "picks_insert" ON draft_picks FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM fantasy_teams WHERE id = fantasy_team_id AND user_id = auth.uid())
  OR
  EXISTS (SELECT 1 FROM leagues WHERE id = league_id AND commissioner_id = auth.uid())
);

DROP POLICY IF EXISTS "rosters_insert" ON roster_players;
CREATE POLICY "rosters_insert" ON roster_players FOR INSERT WITH CHECK (true);
