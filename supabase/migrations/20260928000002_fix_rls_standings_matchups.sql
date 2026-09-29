-- Migration: Add missing RLS policies for h2h_matchups, round_scores, lineup_slots, and league_standings

-- H2H MATCHUPS POLICIES
DROP POLICY IF EXISTS "h2h_matchups_read" ON h2h_matchups;
CREATE POLICY "h2h_matchups_read" ON h2h_matchups FOR SELECT USING (true);

DROP POLICY IF EXISTS "h2h_matchups_insert" ON h2h_matchups;
CREATE POLICY "h2h_matchups_insert" ON h2h_matchups FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "h2h_matchups_update" ON h2h_matchups;
CREATE POLICY "h2h_matchups_update" ON h2h_matchups FOR UPDATE USING (true);

-- ROUND SCORES POLICIES
DROP POLICY IF EXISTS "round_scores_read" ON round_scores;
CREATE POLICY "round_scores_read" ON round_scores FOR SELECT USING (true);

DROP POLICY IF EXISTS "round_scores_insert" ON round_scores;
CREATE POLICY "round_scores_insert" ON round_scores FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "round_scores_update" ON round_scores;
CREATE POLICY "round_scores_update" ON round_scores FOR UPDATE USING (true);

-- LINEUP SLOTS POLICIES
DROP POLICY IF EXISTS "slots_read" ON lineup_slots;
CREATE POLICY "slots_read" ON lineup_slots FOR SELECT USING (true);

DROP POLICY IF EXISTS "slots_insert" ON lineup_slots;
CREATE POLICY "slots_insert" ON lineup_slots FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM lineups l
    JOIN fantasy_teams ft ON ft.id = l.fantasy_team_id
    WHERE l.id = lineup_id AND ft.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "slots_delete" ON lineup_slots;
CREATE POLICY "slots_delete" ON lineup_slots FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM lineups l
    JOIN fantasy_teams ft ON ft.id = l.fantasy_team_id
    WHERE l.id = lineup_id AND ft.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "slots_update" ON lineup_slots;
CREATE POLICY "slots_update" ON lineup_slots FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM lineups l
    JOIN fantasy_teams ft ON ft.id = l.fantasy_team_id
    WHERE l.id = lineup_id AND ft.user_id = auth.uid()
  )
);

-- LEAGUE STANDINGS POLICIES
DROP POLICY IF EXISTS "league_standings_read" ON league_standings;
CREATE POLICY "league_standings_read" ON league_standings FOR SELECT USING (true);
