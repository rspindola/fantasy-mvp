-- Allow updating fixtures (status, scores, etc.)
CREATE POLICY "fixtures_update" ON fixtures FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "fixtures_insert" ON fixtures FOR INSERT WITH CHECK (true);

-- Allow insert/update/delete on player_fixture_stats
CREATE POLICY "stats_insert" ON player_fixture_stats FOR INSERT WITH CHECK (true);
CREATE POLICY "stats_update" ON player_fixture_stats FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "stats_delete" ON player_fixture_stats FOR DELETE USING (true);
