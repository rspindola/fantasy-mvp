'use server'

import { createClient } from '@/lib/supabase/server'
import {
  getPostponedRounds,
  toggleFixturePostponed,
  simulateFixtureMatch,
  recalculatePostponedRound,
  executeAutoSubAndCloseRound,
  generateRoundPartials,
  type RoundClosingSummary,
  type RoundPartialsSummary,
} from '@/lib/round/round-processor'
import { revalidatePath } from 'next/cache'

export type FixtureItem = {
  id: string
  round: number
  kickoffAt: string | null
  status: 'scheduled' | 'live' | 'FT' | 'postponed'
  homeScore: number | null
  awayScore: number | null
  homeClub: {
    id: string
    name: string
    shortName: string
    logoUrl: string | null
  }
  awayClub: {
    id: string
    name: string
    shortName: string
    logoUrl: string | null
  }
}

export type CommissionerPageData = {
  isCommissioner: boolean
  league: {
    id: string
    name: string
    scoringMode: 'TOTAL' | 'H2H'
    h2hFormat?: 'SINGLE_ROUND' | 'DOUBLE_ROUND'
    status: string
    inviteCode: string
    teamCount: number
  }
  season: {
    id: string
    currentRound: number
    totalRounds: number
  }
  currentRoundFixtures: FixtureItem[]
  postponedFixturesByRound: {
    round: number
    fixtures: FixtureItem[]
    hasScoresCalculated: boolean
  }[]
  postponedRounds: number[]
}

export async function getCommissionerData(leagueId: string): Promise<CommissionerPageData | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  // 1. Fetch league
  const { data: league } = await supabase
    .from('leagues')
    .select('id, name, scoring_mode, h2h_format, status, invite_code, commissioner_id, season_id')
    .eq('id', leagueId)
    .single()

  if (!league) return null

  const isCommissioner = league.commissioner_id === user.id
  if (!isCommissioner) {
    return {
      isCommissioner: false,
      league: {
        id: league.id,
        name: league.name,
        scoringMode: league.scoring_mode as any,
        status: league.status,
        inviteCode: league.invite_code,
        teamCount: 0,
      },
      season: { id: '', currentRound: 1, totalRounds: 38 },
      currentRoundFixtures: [],
      postponedFixturesByRound: [],
      postponedRounds: [],
    }
  }

  // 2. Fetch team count
  const { count: teamCount } = await supabase
    .from('fantasy_teams')
    .select('id', { count: 'exact', head: true })
    .eq('league_id', leagueId)

  // 3. Fetch season
  const { data: season } = await supabase
    .from('seasons')
    .select('id, current_round, total_rounds')
    .eq('id', league.season_id)
    .single()

  const currentRound = season?.current_round ?? 1
  const totalRounds = season?.total_rounds ?? 38

  // 4. Fetch fixtures for current round with clubs
  const { data: currentFixturesData } = await supabase
    .from('fixtures')
    .select(`
      id,
      round,
      kickoff_at,
      status,
      home_score,
      away_score,
      homeClub:real_clubs!fixtures_home_club_id_fkey(id, name, short_name, logo_url),
      awayClub:real_clubs!fixtures_away_club_id_fkey(id, name, short_name, logo_url)
    `)
    .eq('season_id', league.season_id)
    .eq('round', currentRound)
    .order('kickoff_at', { ascending: true })

  const currentRoundFixtures: FixtureItem[] = (currentFixturesData || []).map((f: any) => ({
    id: f.id,
    round: f.round,
    kickoffAt: f.kickoff_at,
    status: f.status,
    homeScore: f.home_score,
    awayScore: f.away_score,
    homeClub: {
      id: f.homeClub?.id || '',
      name: f.homeClub?.name || '',
      shortName: f.homeClub?.short_name || f.homeClub?.name || '',
      logoUrl: f.homeClub?.logo_url || null,
    },
    awayClub: {
      id: f.awayClub?.id || '',
      name: f.awayClub?.name || '',
      shortName: f.awayClub?.short_name || f.awayClub?.name || '',
      logoUrl: f.awayClub?.logo_url || null,
    },
  }))

  // 5. Fetch all postponed fixtures across season
  const { data: allPostponedData } = await supabase
    .from('fixtures')
    .select(`
      id,
      round,
      kickoff_at,
      status,
      home_score,
      away_score,
      homeClub:real_clubs!fixtures_home_club_id_fkey(id, name, short_name, logo_url),
      awayClub:real_clubs!fixtures_away_club_id_fkey(id, name, short_name, logo_url)
    `)
    .eq('season_id', league.season_id)
    .eq('status', 'postponed')
    .order('round', { ascending: true })

  // Check which rounds have round_scores calculated
  const { data: existingScores } = await supabase
    .from('round_scores')
    .select('fixture_round')
    .limit(100)

  const calculatedRounds = new Set((existingScores || []).map((s: any) => s.fixture_round))

  // Group postponed fixtures by round
  const roundMap = new Map<number, FixtureItem[]>()
  ;(allPostponedData || []).forEach((f: any) => {
    const list = roundMap.get(f.round) || []
    list.push({
      id: f.id,
      round: f.round,
      kickoffAt: f.kickoff_at,
      status: f.status,
      homeScore: f.home_score,
      awayScore: f.away_score,
      homeClub: {
        id: f.homeClub?.id || '',
        name: f.homeClub?.name || '',
        shortName: f.homeClub?.short_name || f.homeClub?.name || '',
        logoUrl: f.homeClub?.logo_url || null,
      },
      awayClub: {
        id: f.awayClub?.id || '',
        name: f.awayClub?.name || '',
        shortName: f.awayClub?.short_name || f.awayClub?.name || '',
        logoUrl: f.awayClub?.logo_url || null,
      },
    })
    roundMap.set(f.round, list)
  })

  const postponedFixturesByRound = Array.from(roundMap.entries()).map(([round, fixtures]) => ({
    round,
    fixtures,
    hasScoresCalculated: calculatedRounds.has(round),
  }))

  const postponedRounds = await getPostponedRounds(league.season_id)

  return {
    isCommissioner: true,
    league: {
      id: league.id,
      name: league.name,
      scoringMode: league.scoring_mode as any,
      h2hFormat: league.h2h_format as any,
      status: league.status,
      inviteCode: league.invite_code,
      teamCount: teamCount ?? 0,
    },
    season: {
      id: league.season_id,
      currentRound,
      totalRounds,
    },
    currentRoundFixtures,
    postponedFixturesByRound,
    postponedRounds,
  }
}

export async function toggleFixturePostponedAction(
  leagueId: string,
  fixtureId: string,
  isPostponed: boolean
) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) throw new Error('Não autenticado')

  // Verify commissioner
  const { data: league } = await supabase
    .from('leagues')
    .select('commissioner_id')
    .eq('id', leagueId)
    .single()

  if (!league || league.commissioner_id !== user.id) {
    throw new Error('Apenas o comissário pode alterar status de partidas.')
  }

  await toggleFixturePostponed(fixtureId, isPostponed)
  revalidatePath(`/league/${leagueId}`)
  revalidatePath(`/league/${leagueId}/admin`)
  revalidatePath(`/league/${leagueId}/standings`)
  return { success: true }
}

export async function simulateFixtureMatchAction(
  leagueId: string,
  fixtureId: string,
  homeScore: number,
  awayScore: number
) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) throw new Error('Não autenticado')

  const { data: league } = await supabase
    .from('leagues')
    .select('commissioner_id')
    .eq('id', leagueId)
    .single()

  if (!league || league.commissioner_id !== user.id) {
    throw new Error('Apenas o comissário pode simular partidas.')
  }

  await simulateFixtureMatch(fixtureId, homeScore, awayScore)
  revalidatePath(`/league/${leagueId}`)
  revalidatePath(`/league/${leagueId}/admin`)
  revalidatePath(`/league/${leagueId}/standings`)
  return { success: true }
}

export async function closeAndAdvanceRoundAction(
  leagueId: string,
  fixtureRound: number
): Promise<RoundClosingSummary> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) throw new Error('Não autenticado')

  const { data: league } = await supabase
    .from('leagues')
    .select('commissioner_id')
    .eq('id', leagueId)
    .single()

  if (!league || league.commissioner_id !== user.id) {
    throw new Error('Apenas o comissário pode fechar a rodada.')
  }

  const result = await executeAutoSubAndCloseRound(leagueId, fixtureRound, true)
  revalidatePath(`/league/${leagueId}`)
  revalidatePath(`/league/${leagueId}/admin`)
  revalidatePath(`/league/${leagueId}/standings`)
  revalidatePath(`/league/${leagueId}/lineup`)
  return result
}

export async function recalculatePostponedRoundAction(
  leagueId: string,
  fixtureRound: number
): Promise<RoundClosingSummary> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) throw new Error('Não autenticado')

  const { data: league } = await supabase
    .from('leagues')
    .select('commissioner_id')
    .eq('id', leagueId)
    .single()

  if (!league || league.commissioner_id !== user.id) {
    throw new Error('Apenas o comissário pode recalcular a rodada.')
  }

  const result = await recalculatePostponedRound(leagueId, fixtureRound)
  revalidatePath(`/league/${leagueId}`)
  revalidatePath(`/league/${leagueId}/admin`)
  revalidatePath(`/league/${leagueId}/standings`)
  return result
}

export async function generateRoundPartialsAction(
  leagueId: string,
  fixtureRound?: number
): Promise<RoundPartialsSummary> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) throw new Error('Não autenticado')

  const { data: league } = await supabase
    .from('leagues')
    .select('commissioner_id')
    .eq('id', leagueId)
    .single()

  if (!league || league.commissioner_id !== user.id) {
    throw new Error('Apenas o comissário pode gerar parciais da rodada.')
  }

  const result = await generateRoundPartials(leagueId, fixtureRound)
  revalidatePath(`/league/${leagueId}`)
  revalidatePath(`/league/${leagueId}/admin`)
  revalidatePath(`/league/${leagueId}/standings`)
  revalidatePath(`/league/${leagueId}/lineup`)
  return result
}

