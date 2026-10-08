'use server'

import { createClient } from '@/lib/supabase/server'
import { calculateTotalStandings, type TotalStandingsRow } from '@/lib/standings/total-standings'
import { calculateH2HStandings, type H2HStandingsRow } from '@/lib/h2h/h2h-processor'
import { checkRoundLockStatus } from '@/lib/lineup/lock'
import { computeRoundLiveScoresMap } from '@/lib/round/round-processor'

export type MatchupItem = {
  id: string
  fixtureRound: number
  homeTeamId: string
  homeTeamName: string
  awayTeamId: string
  awayTeamName: string
  homePoints: number | null
  awayPoints: number | null
  result: 'home' | 'away' | 'draw' | null
  isPartial?: boolean
}

export type MarketStatusInfo = {
  isLocked: boolean
  closingAt: string | null
  kickoffAt: string | null
  currentRound: number
}

export type StandingsPageData = {
  leagueId: string
  leagueName: string
  scoringMode: 'TOTAL' | 'H2H'
  h2hFormat?: 'SINGLE_ROUND' | 'DOUBLE_ROUND'
  currentRound: number
  totalRounds: number
  finalRound: number
  standings: H2HStandingsRow[]
  allMatchups: MatchupItem[]
  currentMatchups: MatchupItem[]
  postponedRounds: number[]
  roundInfoMap: Record<number, string>
  marketStatus: MarketStatusInfo
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
    .select('id, name, scoring_mode, h2h_format, season_id')
    .eq('id', leagueId)
    .single()

  if (!league) return null

  // Fetch season info
  const { data: season } = await supabase
    .from('seasons')
    .select('current_round, total_rounds')
    .eq('id', league.season_id)
    .single()

  const currentRound = season?.current_round ?? 1
  const totalRounds = season?.total_rounds ?? 38

  // Fetch all fantasy teams in the league
  const { data: leagueTeamsData } = await supabase
    .from('fantasy_teams')
    .select(`
      id,
      name,
      draft_order,
      profile:profiles!fantasy_teams_user_id_fkey(display_name)
    `)
    .eq('league_id', leagueId)
    .order('draft_order', { ascending: true })

  const allLeagueTeams = (leagueTeamsData || []).map((t: any) => ({
    id: t.id,
    name: t.name,
    managerName: t.profile?.display_name ?? 'Técnico',
  }))

  // Fetch round scores history for general cumulative points (used as tiebreaker)
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

  const totalStandings = calculateTotalStandings(scoresHistory, allLeagueTeams)
  const generalPointsMap = new Map<string, number>()
  totalStandings.forEach((row) => {
    generalPointsMap.set(row.fantasyTeamId, row.cumulativePoints)
  })

  // Fetch H2H matchups
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
    .order('fixture_round', { ascending: true })

  // Check which unclosed rounds need partial scores (rounds <= currentRound with null home_points)
  const unclosedRounds = Array.from(
    new Set(
      (matchupsData || [])
        .filter((m: any) => m.fixture_round <= currentRound && m.home_points === null)
        .map((m: any) => m.fixture_round)
    )
  )

  const partialScoresByRound = new Map<number, Map<string, number>>()
  for (const r of unclosedRounds) {
    try {
      const scores = await computeRoundLiveScoresMap(leagueId, r)
      partialScoresByRound.set(r, scores)
    } catch (e) {
      console.error(`[getStandingsData] Error computing live partial scores for round ${r}:`, e)
    }
  }

  const allMatchups: MatchupItem[] = (matchupsData || []).map((m: any) => {
    const isConcluded = m.home_points !== null && m.away_points !== null
    const roundPartials = partialScoresByRound.get(m.fixture_round)

    let homePoints: number | null = null
    let awayPoints: number | null = null
    let isPartial = false

    if (isConcluded) {
      homePoints = Number(m.home_points)
      awayPoints = Number(m.away_points)
      isPartial = false
    } else if (roundPartials) {
      homePoints = roundPartials.get(m.home_team_id) ?? 0
      awayPoints = roundPartials.get(m.away_team_id) ?? 0
      isPartial = true
    }

    return {
      id: m.id,
      fixtureRound: m.fixture_round,
      homeTeamId: m.home_team_id,
      homeTeamName: m.home_team?.name ?? 'Time A',
      awayTeamId: m.away_team_id,
      awayTeamName: m.away_team?.name ?? 'Time B',
      homePoints,
      awayPoints,
      result: isConcluded ? (m.result as any) : null,
      isPartial,
    }
  })

  // Calculate unified tournament table with generalScore tiebreaker
  const standings = calculateH2HStandings(allMatchups, allLeagueTeams, generalPointsMap)
  const currentMatchups = allMatchups.filter((m) => m.fixtureRound === currentRound)

  const finalRound =
    allMatchups.length > 0
      ? Math.max(...allMatchups.map((m) => m.fixtureRound))
      : totalRounds

  // Fetch postponed rounds
  const { data: postponedFixtures } = await supabase
    .from('fixtures')
    .select('round')
    .eq('season_id', league.season_id)
    .eq('status', 'postponed')

  const postponedRounds = Array.from(
    new Set((postponedFixtures || []).map((f: any) => f.round))
  ).sort((a: any, b: any) => a - b)

  // Fetch kickoff dates for round headers
  const { data: fixturesKickoffs } = await supabase
    .from('fixtures')
    .select('round, kickoff_at')
    .eq('season_id', league.season_id)
    .order('kickoff_at', { ascending: true })

  const roundInfoMap: Record<number, string> = {}
  ;(fixturesKickoffs || []).forEach((f: any) => {
    if (f.kickoff_at && !roundInfoMap[f.round]) {
      const d = new Date(f.kickoff_at)
      const now = new Date()
      const isToday = now.toDateString() === d.toDateString()
      const timeStr = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
      if (isToday) {
        roundInfoMap[f.round] = `Hoje • ${timeStr}`
      } else {
        const dateStr = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
        roundInfoMap[f.round] = `${dateStr} • ${timeStr}`
      }
    }
  })

  // Check market lock and closing time for current round
  const lockStatus = await checkRoundLockStatus(league.season_id, currentRound)
  const closingAt = lockStatus.kickoffAt
    ? new Date(new Date(lockStatus.kickoffAt).getTime() - 30 * 60 * 1000).toISOString()
    : null

  const marketStatus: MarketStatusInfo = {
    isLocked: lockStatus.isLocked,
    closingAt,
    kickoffAt: lockStatus.kickoffAt,
    currentRound,
  }

  return {
    leagueId,
    leagueName: league.name,
    scoringMode: league.scoring_mode as any,
    h2hFormat: league.h2h_format as any,
    currentRound,
    totalRounds,
    finalRound,
    standings,
    allMatchups,
    currentMatchups,
    postponedRounds,
    roundInfoMap,
    marketStatus,
  }
}
