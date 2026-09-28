'use server'

import { createClient } from '@/lib/supabase/server'
import { calculateTotalStandings, type TotalStandingsRow } from '@/lib/standings/total-standings'
import { calculateH2HStandings, type H2HStandingsRow } from '@/lib/h2h/h2h-processor'

export type StandingsPageData = {
  leagueId: string
  leagueName: string
  scoringMode: 'TOTAL' | 'H2H'
  currentRound: number
  totalStandings: TotalStandingsRow[]
  h2hStandings: H2HStandingsRow[]
  currentMatchups: {
    id: string
    homeTeamName: string
    awayTeamName: string
    homePoints: number | null
    awayPoints: number | null
    result: string | null
  }[]
}

export async function getStandingsData(leagueId: string): Promise<StandingsPageData | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  // Fetch league info
  const { data: league } = await supabase
    .from('leagues')
    .select('id, name, scoring_mode, season_id')
    .eq('id', leagueId)
    .single()

  if (!league) return null

  // Fetch season info
  const { data: season } = await supabase
    .from('seasons')
    .select('current_round')
    .eq('id', league.season_id)
    .single()

  const currentRound = season?.current_round ?? 1

  // Fetch round scores history for TOTAL standings
  const { data: scoresData } = await supabase
    .from('round_scores')
    .select(`
      fixture_round,
      total_points,
      captain_bonus,
      fantasy_team:fantasy_teams!inner(
        id,
        name,
        league_id,
        profile:profiles(display_name)
      )
    `)
    .eq('fantasy_team.league_id', leagueId)

  const scoresHistory = (scoresData || []).map((s: any) => ({
    fantasyTeamId: s.fantasy_team.id,
    teamName: s.fantasy_team.name,
    managerName: s.fantasy_team.profile?.display_name ?? 'Técnico',
    fixtureRound: s.fixture_round,
    totalPoints: Number(s.total_points ?? 0),
    captainBonus: Number(s.captain_bonus ?? 0),
  }))

  const totalStandings = calculateTotalStandings(scoresHistory)

  // Fetch H2H matchups for H2H standings & current round matchups
  let h2hStandings: H2HStandingsRow[] = []
  let currentMatchups: StandingsPageData['currentMatchups'] = []

  if (league.scoring_mode === 'H2H') {
    const { data: matchupsData } = await supabase
      .from('h2h_matchups')
      .select(`
        id,
        fixture_round,
        home_team_id,
        away_team_id,
        home_points,
        away_points,
        result,
        home_team:fantasy_teams!h2h_matchups_home_team_id_fkey(name),
        away_team:fantasy_teams!h2h_matchups_away_team_id_fkey(name)
      `)
      .eq('league_id', leagueId)

    const matchupsRecords = (matchupsData || []).map((m: any) => ({
      id: m.id,
      fixtureRound: m.fixture_round,
      homeTeamId: m.home_team_id,
      homeTeamName: m.home_team?.name ?? 'Time A',
      awayTeamId: m.away_team_id,
      awayTeamName: m.away_team?.name ?? 'Time B',
      homePoints: m.home_points !== null ? Number(m.home_points) : null,
      awayPoints: m.away_points !== null ? Number(m.away_points) : null,
      result: m.result as any,
    }))

    h2hStandings = calculateH2HStandings(matchupsRecords)

    currentMatchups = matchupsRecords
      .filter((m) => m.fixtureRound === currentRound)
      .map((m) => ({
        id: m.id,
        homeTeamName: m.homeTeamName,
        awayTeamName: m.awayTeamName,
        homePoints: m.homePoints,
        awayPoints: m.awayPoints,
        result: m.result,
      }))
  }

  return {
    leagueId,
    leagueName: league.name,
    scoringMode: league.scoring_mode as any,
    currentRound,
    totalStandings,
    h2hStandings,
    currentMatchups,
  }
}
