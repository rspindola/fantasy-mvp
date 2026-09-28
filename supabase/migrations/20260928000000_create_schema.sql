-- Migration: Complete Fantasy Draft MVP Schema
-- Created At: 2026-09-28

-- 1. SEASONS
CREATE TABLE seasons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_api_id INT NOT NULL,          -- 71 = Brasileirão
  year INT NOT NULL,
  name TEXT NOT NULL,                   -- "Brasileirão Série A 2026"
  current_round INT DEFAULT 1,
  total_rounds INT DEFAULT 38,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(league_api_id, year)
);

-- 2. REAL CLUBS
CREATE TABLE real_clubs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id UUID REFERENCES seasons(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  short_name TEXT NOT NULL,
  logo_url TEXT,
  api_football_id INT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(season_id, api_football_id)
);

-- 3. REAL PLAYERS
CREATE TABLE real_players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID REFERENCES real_clubs(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  photo_url TEXT,
  position TEXT NOT NULL CHECK (position IN ('GOL','LAT','ZAG','MEI','ATA')),
  api_football_id INT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  avg_points NUMERIC(6,2) DEFAULT 0,
  total_minutes INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(api_football_id)
);

-- 4. FIXTURES
CREATE TABLE fixtures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id UUID REFERENCES seasons(id) ON DELETE CASCADE NOT NULL,
  round INT NOT NULL,
  home_club_id UUID REFERENCES real_clubs(id) NOT NULL,
  away_club_id UUID REFERENCES real_clubs(id) NOT NULL,
  kickoff_at TIMESTAMPTZ,
  status TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled','live','FT','postponed')),
  home_score INT,
  away_score INT,
  api_fixture_id INT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(api_fixture_id)
);

-- 5. PLAYER FIXTURE STATS
CREATE TABLE player_fixture_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID REFERENCES real_players(id) ON DELETE CASCADE NOT NULL,
  fixture_id UUID REFERENCES fixtures(id) ON DELETE CASCADE NOT NULL,
  minutes INT DEFAULT 0,
  -- Defense scouts
  tackles INT DEFAULT 0,          -- DS desarme (+1.5)
  fouls_committed INT DEFAULT 0,  -- FC falta cometida (-0.3)
  own_goals INT DEFAULT 0,        -- GC gol contra (-3.0)
  yellow_cards INT DEFAULT 0,     -- CA amarelo (-1.0)
  red_cards INT DEFAULT 0,        -- CV vermelho (-3.0)
  clean_sheet BOOLEAN DEFAULT false, -- SG sem sofrer gol (+5.0)
  saves INT DEFAULT 0,            -- DE defesa difícil (+1.3)
  penalty_saves INT DEFAULT 0,    -- DP defesa de pênalti (+7.0)
  goals_conceded INT DEFAULT 0,   -- GS gol sofrido (-1.0)
  penalties_committed INT DEFAULT 0, -- PC pênalti cometido (-1.0)
  -- Attack scouts
  fouls_drawn INT DEFAULT 0,      -- FS falta sofrida (+0.5)
  passes_failed INT DEFAULT 0,    -- PE passe incompleto (-0.1)
  assists INT DEFAULT 0,          -- A assistência (+4.0)
  shots_on_woodwork INT DEFAULT 0,-- FT finalização na trave (+3.0)
  shots_on_target INT DEFAULT 0,  -- FD finalização defendida (+1.2)
  shots_off_target INT DEFAULT 0, -- FF finalização para fora (+0.8)
  goals INT DEFAULT 0,            -- G gol (+8.0)
  offsides INT DEFAULT 0,         -- I impedimento (-0.1)
  penalties_missed INT DEFAULT 0, -- PP pênalti perdido (-4.0)
  penalties_won INT DEFAULT 0,    -- PS pênalti sofrido (+1.0)
  -- Computed
  computed_points NUMERIC(6,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(player_id, fixture_id)
);

-- 6. PROFILES (extends auth.users)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 7. LEAGUES
CREATE TABLE leagues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  invite_code TEXT NOT NULL UNIQUE,
  scoring_mode TEXT NOT NULL CHECK (scoring_mode IN ('TOTAL','H2H')),
  draft_mode TEXT NOT NULL CHECK (draft_mode IN ('MANUAL','AUTO','HYBRID')),
  team_cap INT NOT NULL CHECK (team_cap >= 2),
  status TEXT DEFAULT 'open' CHECK (status IN ('open','drafting','active','closed')),
  season_id UUID REFERENCES seasons(id) NOT NULL,
  commissioner_id UUID REFERENCES profiles(id) NOT NULL,
  pick_timer_seconds INT DEFAULT 90,
  current_pick INT DEFAULT 0,
  total_picks INT DEFAULT 0,
  draft_started_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 8. FANTASY TEAMS
CREATE TABLE fantasy_teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id UUID REFERENCES leagues(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES profiles(id) NOT NULL,
  name TEXT NOT NULL,
  draft_order INT,
  auto_complete BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(league_id, user_id)
);

-- 9. DRAFT PICKS
CREATE TABLE draft_picks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id UUID REFERENCES leagues(id) ON DELETE CASCADE NOT NULL,
  fantasy_team_id UUID REFERENCES fantasy_teams(id) NOT NULL,
  player_id UUID REFERENCES real_players(id) NOT NULL,
  pick_number INT NOT NULL,          -- 1..N×22
  round INT NOT NULL,                -- 1..22
  is_auto_pick BOOLEAN DEFAULT false,
  picked_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(league_id, player_id),
  UNIQUE(league_id, pick_number)
);

-- 10. ROSTER PLAYERS
CREATE TABLE roster_players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fantasy_team_id UUID REFERENCES fantasy_teams(id) ON DELETE CASCADE NOT NULL,
  player_id UUID REFERENCES real_players(id) NOT NULL,
  added_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(fantasy_team_id, player_id)
);

-- 11. LINEUPS
CREATE TABLE lineups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fantasy_team_id UUID REFERENCES fantasy_teams(id) ON DELETE CASCADE NOT NULL,
  fixture_round INT NOT NULL,
  formation TEXT NOT NULL CHECK (formation IN ('4-3-3','4-4-2','3-5-2')),
  is_locked BOOLEAN DEFAULT false,
  locked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(fantasy_team_id, fixture_round)
);

-- 12. LINEUP SLOTS
CREATE TABLE lineup_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lineup_id UUID REFERENCES lineups(id) ON DELETE CASCADE NOT NULL,
  player_id UUID REFERENCES real_players(id) NOT NULL,
  slot_position TEXT NOT NULL,        -- GOL, ZAG1, ZAG2, LAT_E, LAT_D, MEI1, etc.
  is_captain BOOLEAN DEFAULT false,
  is_starter BOOLEAN NOT NULL DEFAULT true,
  UNIQUE(lineup_id, player_id)
);

-- 13. ROUND SCORES
CREATE TABLE round_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fantasy_team_id UUID REFERENCES fantasy_teams(id) ON DELETE CASCADE NOT NULL,
  fixture_round INT NOT NULL,
  total_points NUMERIC(8,2) DEFAULT 0,
  captain_bonus NUMERIC(6,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(fantasy_team_id, fixture_round)
);

-- 14. LEAGUE STANDINGS
CREATE TABLE league_standings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id UUID REFERENCES leagues(id) ON DELETE CASCADE NOT NULL,
  fantasy_team_id UUID REFERENCES fantasy_teams(id) NOT NULL,
  fixture_round INT NOT NULL,
  cumulative_points NUMERIC(10,2) DEFAULT 0,
  rounds_won INT DEFAULT 0,
  h2h_points INT DEFAULT 0,
  h2h_wins INT DEFAULT 0,
  h2h_draws INT DEFAULT 0,
  h2h_losses INT DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(league_id, fantasy_team_id, fixture_round)
);

-- 15. H2H MATCHUPS
CREATE TABLE h2h_matchups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id UUID REFERENCES leagues(id) ON DELETE CASCADE NOT NULL,
  fixture_round INT NOT NULL,
  home_team_id UUID REFERENCES fantasy_teams(id) NOT NULL,
  away_team_id UUID REFERENCES fantasy_teams(id) NOT NULL,
  home_points NUMERIC(8,2),
  away_points NUMERIC(8,2),
  result TEXT CHECK (result IN ('home','away','draw')),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(league_id, fixture_round, home_team_id)
);

-- INDEXES
CREATE INDEX idx_real_players_club ON real_players(club_id);
CREATE INDEX idx_real_players_active ON real_players(is_active);
CREATE INDEX idx_fixtures_season_round ON fixtures(season_id, round);
CREATE INDEX idx_fixtures_kickoff ON fixtures(kickoff_at);
CREATE INDEX idx_player_stats_player ON player_fixture_stats(player_id);
CREATE INDEX idx_player_stats_fixture ON player_fixture_stats(fixture_id);
CREATE INDEX idx_leagues_invite ON leagues(invite_code);
CREATE INDEX idx_leagues_status ON leagues(status);
CREATE INDEX idx_fantasy_teams_league ON fantasy_teams(league_id);
CREATE INDEX idx_fantasy_teams_user ON fantasy_teams(user_id);
CREATE INDEX idx_draft_picks_league ON draft_picks(league_id);
CREATE INDEX idx_roster_players_team ON roster_players(fantasy_team_id);
CREATE INDEX idx_lineups_team_round ON lineups(fantasy_team_id, fixture_round);
CREATE INDEX idx_round_scores_team ON round_scores(fantasy_team_id);
CREATE INDEX idx_standings_league ON league_standings(league_id);
CREATE INDEX idx_h2h_league_round ON h2h_matchups(league_id, fixture_round);

-- PROFILE TRIGGER ON AUTH.USERS
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ROW LEVEL SECURITY
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE leagues ENABLE ROW LEVEL SECURITY;
ALTER TABLE fantasy_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE draft_picks ENABLE ROW LEVEL SECURITY;
ALTER TABLE roster_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE lineups ENABLE ROW LEVEL SECURITY;
ALTER TABLE lineup_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE seasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE real_clubs ENABLE ROW LEVEL SECURITY;
ALTER TABLE real_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE fixtures ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_fixture_stats ENABLE ROW LEVEL SECURITY;

-- PUBLIC READ FOR CATALOG
CREATE POLICY "seasons_read" ON seasons FOR SELECT USING (true);
CREATE POLICY "clubs_read" ON real_clubs FOR SELECT USING (true);
CREATE POLICY "players_read" ON real_players FOR SELECT USING (true);
CREATE POLICY "fixtures_read" ON fixtures FOR SELECT USING (true);
CREATE POLICY "stats_read" ON player_fixture_stats FOR SELECT USING (true);

-- PROFILES POLICIES
CREATE POLICY "profiles_read" ON profiles FOR SELECT USING (true);
CREATE POLICY "profiles_update" ON profiles FOR UPDATE USING (auth.uid() = id);

-- LEAGUES POLICIES
CREATE POLICY "leagues_read" ON leagues FOR SELECT USING (true);
CREATE POLICY "leagues_insert" ON leagues FOR INSERT WITH CHECK (auth.uid() = commissioner_id);

-- FANTASY TEAMS POLICIES
CREATE POLICY "teams_read" ON fantasy_teams FOR SELECT USING (true);
CREATE POLICY "teams_insert" ON fantasy_teams FOR INSERT WITH CHECK (auth.uid() = user_id);

-- DRAFT PICKS POLICIES
CREATE POLICY "picks_read" ON draft_picks FOR SELECT USING (true);
CREATE POLICY "picks_insert" ON draft_picks FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM fantasy_teams WHERE id = fantasy_team_id AND user_id = auth.uid())
);

-- ROSTER PLAYERS POLICIES
CREATE POLICY "rosters_read" ON roster_players FOR SELECT USING (true);

-- LINEUPS POLICIES
CREATE POLICY "lineups_read" ON lineups FOR SELECT USING (true);
CREATE POLICY "lineups_insert" ON lineups FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM fantasy_teams WHERE id = fantasy_team_id AND user_id = auth.uid())
);
CREATE POLICY "lineups_update" ON lineups FOR UPDATE USING (
  EXISTS (SELECT 1 FROM fantasy_teams WHERE id = fantasy_team_id AND user_id = auth.uid())
);
