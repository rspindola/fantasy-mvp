-- Migration: Allow league updates and team updates
DROP POLICY IF EXISTS "leagues_update" ON leagues;
CREATE POLICY "leagues_update" ON leagues 
  FOR UPDATE 
  USING (
    commissioner_id = auth.uid() OR 
    EXISTS (SELECT 1 FROM fantasy_teams ft WHERE ft.league_id = leagues.id AND ft.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "teams_update" ON fantasy_teams;
CREATE POLICY "teams_update" ON fantasy_teams 
  FOR UPDATE 
  USING (
    user_id = auth.uid() OR 
    EXISTS (SELECT 1 FROM leagues l WHERE l.id = fantasy_teams.league_id AND l.commissioner_id = auth.uid())
  );
