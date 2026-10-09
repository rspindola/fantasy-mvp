-- Allow commissioner/system to update seasons (advancing current_round)
CREATE POLICY "seasons_update" ON seasons FOR UPDATE USING (true) WITH CHECK (true);
