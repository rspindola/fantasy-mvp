-- Migration: Allow all standard formations in lineups table
ALTER TABLE lineups DROP CONSTRAINT IF EXISTS lineups_formation_check;
ALTER TABLE lineups ADD CONSTRAINT lineups_formation_check 
  CHECK (formation IN ('3-4-3', '3-5-2', '4-3-3', '4-4-2', '4-5-1', '5-3-2', '5-4-1'));
