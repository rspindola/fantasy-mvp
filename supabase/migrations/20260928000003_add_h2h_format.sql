-- Migration: Add h2h_format to leagues
ALTER TABLE leagues 
ADD COLUMN IF NOT EXISTS h2h_format TEXT DEFAULT 'DOUBLE_ROUND' CHECK (h2h_format IN ('SINGLE_ROUND', 'DOUBLE_ROUND'));
