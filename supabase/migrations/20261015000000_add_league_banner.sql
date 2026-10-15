-- Migration: Add banner_image_url to leagues for commissioner customization
ALTER TABLE leagues ADD COLUMN IF NOT EXISTS banner_image_url TEXT;

-- Also fetch season/championship info via seasons table (already has name + league_api_id)
-- No extra columns needed in seasons; the frontend will use the season joined to the league.

-- Storage bucket for league banners (run via Supabase dashboard or service role)
-- INSERT INTO storage.buckets (id, name, public) VALUES ('league-banners', 'league-banners', true)
-- ON CONFLICT DO NOTHING;

-- RLS: allow authenticated users to upload banners to their own league folder
-- Policy is managed via Supabase dashboard storage policies
