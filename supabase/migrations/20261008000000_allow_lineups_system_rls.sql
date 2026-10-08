-- Migration: Allow system/server actions to insert, update and delete lineups and lineup_slots
-- This enables auto-completion of incomplete or empty lineups by the system, commissioner, or matchup views.

DROP POLICY IF EXISTS "lineups_insert" ON lineups;
CREATE POLICY "lineups_insert" ON lineups FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "lineups_update" ON lineups;
CREATE POLICY "lineups_update" ON lineups FOR UPDATE USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "lineups_delete" ON lineups;
CREATE POLICY "lineups_delete" ON lineups FOR DELETE USING (true);

DROP POLICY IF EXISTS "slots_insert" ON lineup_slots;
CREATE POLICY "slots_insert" ON lineup_slots FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "slots_update" ON lineup_slots;
CREATE POLICY "slots_update" ON lineup_slots FOR UPDATE USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "slots_delete" ON lineup_slots;
CREATE POLICY "slots_delete" ON lineup_slots FOR DELETE USING (true);
