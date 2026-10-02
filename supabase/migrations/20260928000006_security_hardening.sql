-- Migration: Security Advisor Hardening
-- 1. Fix Function Search Path & revoke public execution on internal triggers
-- 2. Replace overly permissive RLS policies on roster_players, h2h_matchups, and round_scores

-- 1. Functions Search Path and Execution Privileges
ALTER FUNCTION public.handle_new_user() SET search_path = public;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM anon, authenticated;

ALTER FUNCTION public.rls_auto_enable() SET search_path = public;
REVOKE ALL ON FUNCTION public.rls_auto_enable() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rls_auto_enable() FROM anon, authenticated;

-- 2. Restrict roster_players insert (scoped to league members and commissioner)
DROP POLICY IF EXISTS "rosters_insert" ON roster_players;
CREATE POLICY "rosters_insert" ON roster_players FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM fantasy_teams ft
    WHERE ft.id = roster_players.fantasy_team_id
      AND ft.league_id IN (
        SELECT league_id FROM fantasy_teams WHERE user_id = auth.uid()
        UNION
        SELECT id FROM leagues WHERE commissioner_id = auth.uid()
      )
  )
);

-- 3. Restrict h2h_matchups insert & update (scoped to league members and commissioner)
DROP POLICY IF EXISTS "h2h_matchups_insert" ON h2h_matchups;
CREATE POLICY "h2h_matchups_insert" ON h2h_matchups FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM fantasy_teams ft
    WHERE ft.league_id = h2h_matchups.league_id AND ft.user_id = auth.uid()
    UNION
    SELECT 1 FROM leagues l
    WHERE l.id = h2h_matchups.league_id AND l.commissioner_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "h2h_matchups_update" ON h2h_matchups;
CREATE POLICY "h2h_matchups_update" ON h2h_matchups FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM fantasy_teams ft
    WHERE ft.league_id = h2h_matchups.league_id AND ft.user_id = auth.uid()
    UNION
    SELECT 1 FROM leagues l
    WHERE l.id = h2h_matchups.league_id AND l.commissioner_id = auth.uid()
  )
);

-- 4. Restrict round_scores insert & update (scoped to league members and commissioner)
DROP POLICY IF EXISTS "round_scores_insert" ON round_scores;
CREATE POLICY "round_scores_insert" ON round_scores FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM fantasy_teams ft
    WHERE ft.id = round_scores.fantasy_team_id
      AND ft.league_id IN (
        SELECT league_id FROM fantasy_teams WHERE user_id = auth.uid()
        UNION
        SELECT id FROM leagues WHERE commissioner_id = auth.uid()
      )
  )
);

DROP POLICY IF EXISTS "round_scores_update" ON round_scores;
CREATE POLICY "round_scores_update" ON round_scores FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM fantasy_teams ft
    WHERE ft.id = round_scores.fantasy_team_id
      AND ft.league_id IN (
        SELECT league_id FROM fantasy_teams WHERE user_id = auth.uid()
        UNION
        SELECT id FROM leagues WHERE commissioner_id = auth.uid()
      )
  )
);
