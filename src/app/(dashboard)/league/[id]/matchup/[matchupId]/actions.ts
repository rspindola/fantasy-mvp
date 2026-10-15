'use server'

import { createClient } from '@/lib/supabase/server'
import {
  processAutoSubstitutions,
  type LineupPlayerInput,
  type ProcessedLineupResult,
} from '@/lib/lineup/auto-sub'
import {
  ensureRoundScouts,
  executeAutoSubAndCloseRound,
  generateRoundPartials,
  type RoundClosingSummary,
  type RoundPartialsSummary,
} from '@/lib/round/round-processor'
import { ensureLockedRoundLineups } from '@/lib/lineup/lock'
import { sortByPosition } from '@/lib/lineup/lineup-engine'
import { revalidatePath } from 'next/cache'

export type MatchupTeamDetail = {
  teamId: string
  teamName: string
  managerName: string
  isCommissioner: boolean
  isMe: boolean
  totalPoints: number
  captainBonus: number
  formation: string
  starters: (LineupPlayerInput & {
    subbedOut: boolean
    subbedInBy?: LineupPlayerInput
  })[]
  reserves: (LineupPlayerInput & {
    subbedIn: boolean
    subbedFor?: LineupPlayerInput
  })[]
  substitutions: {
    outPlayerName: string
    inPlayerName: string
    position: string
    pointsAdded: number
    captainTransferred: boolean
  }[]
}

export type MatchupDetailPageData = {
  leagueId: string
  leagueName: string
  matchupId: string
  fixtureRound: number
  currentSeasonRound: number
  status: 'completed' | 'live' | 'upcoming'
  homeTeam: MatchupTeamDetail
  awayTeam: MatchupTeamDetail
  result: 'home' | 'away' | 'draw' | null
  isCommissioner: boolean
  isPostponedRound: boolean
}

export async function getMatchupDetailData(
  leagueId: string,
  matchupId: string
): Promise<MatchupDetailPageData | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // 1. Fetch matchup info
  const { data: matchup, error: mErr } = await supabase
    .from('h2h_matchups')
    .select(`
      id,
      fixture_round,
      home_team_id,
      away_team_id,
      home_points,
      away_points,
      result,
      home_team:fantasy_teams!h2h_matchups_home_team_id_fkey(
        id,
        name,
        user_id,
        profile:profiles(display_name, avatar_url)
      ),
      away_team:fantasy_teams!h2h_matchups_away_team_id_fkey(
        id,
        name,
        user_id,
        profile:profiles(display_name, avatar_url)
      )
    `)
    .eq('id', matchupId)
    .single()

  if (mErr || !matchup) return null

  // 2. Fetch league and season
  const { data: league } = await supabase
    .from('leagues')
    .select('id, name, commissioner_id, season_id')
    .eq('id', leagueId)
    .single()

  if (!league) return null

  const { data: season } = await supabase
    .from('seasons')
    .select('current_round, total_rounds')
    .eq('id', league.season_id)
    .single()

  const currentSeasonRound = season?.current_round ?? 1
  const currentMatchup = matchup
  const currentLeague = league
  const currentUserId = user?.id ?? ''

  // Only ensure fallback scouts if the round was already completed in the past
  if (currentMatchup.fixture_round < currentSeasonRound) {
    await ensureRoundScouts(currentLeague.season_id, currentMatchup.fixture_round)
  }

  // Ensure lineups are auto-completed (force for current and past rounds to prevent empty squads)
  await ensureLockedRoundLineups(leagueId, currentMatchup.fixture_round, {
    force: currentMatchup.fixture_round <= currentSeasonRound,
  })

  // Fetch round fixtures to check for postponed matches
  const { data: roundFixtures } = await supabase
    .from('fixtures')
    .select('id, home_club_id, away_club_id, status')
    .eq('season_id', currentLeague.season_id)
    .eq('round', currentMatchup.fixture_round)

  const isPostponedRound = (roundFixtures || []).some((f: any) => f.status === 'postponed')

  const clubFixtureStatusMap = new Map<string, string>()
  ;(roundFixtures || []).forEach((f: any) => {
    clubFixtureStatusMap.set(f.home_club_id, f.status)
    clubFixtureStatusMap.set(f.away_club_id, f.status)
  })

  const hasStartedFixtures = (roundFixtures || []).some(
    (f: any) => f.status === 'live' || f.status === 'FT'
  )

  const isMatchupConcluded =
    matchup.home_points !== null &&
    matchup.away_points !== null &&
    matchup.result !== null

  const status: MatchupDetailPageData['status'] =
    isMatchupConcluded || matchup.fixture_round < currentSeasonRound
      ? 'completed'
      : hasStartedFixtures
      ? 'live'
      : 'upcoming'

  function getPlayerMatchStatus(
    clubId: string,
    hasStats: boolean,
    minutes: number
  ): 'played' | 'benched' | 'not_related' | 'postponed' | 'scheduled' | 'live' {
    const fixtureStatus = clubFixtureStatusMap.get(clubId)

    if (fixtureStatus === 'postponed' && minutes === 0) {
      return 'postponed'
    }

    // Se a partida está AO VIVO (em andamento no momento):
    // O atleta está em jogo (seja titular em campo ou no banco com bola rolando).
    // NUNCA deve ser considerado 'benched' ("Não entrou em campo") nem 'not_related' enquanto o jogo não terminar!
    if (fixtureStatus === 'live') {
      return 'live'
    }

    // Se a rodada ou a partida ainda não começou
    if (status === 'upcoming' || fixtureStatus === 'scheduled') {
      return 'scheduled'
    }

    // Se a partida já foi finalizada ('FT') ou a rodada está concluída
    if (fixtureStatus === 'FT' || status === 'completed') {
      if (minutes > 0) return 'played'
      if (hasStats) return 'benched'
      return 'not_related'
    }

    return 'scheduled'
  }

  // 3. Helper to process a team's lineup and auto-sub
  async function loadTeamLineup(
    teamId: string,
    teamName: string,
    managerName: string,
    teamUserId: string
  ): Promise<MatchupTeamDetail> {
    const { data: lineup } = await supabase
      .from('lineups')
      .select('id, formation')
      .eq('fantasy_team_id', teamId)
      .eq('fixture_round', currentMatchup.fixture_round)
      .maybeSingle()

    let lineupRecord = lineup
    let formation = lineup?.formation ?? '4-3-3'

    if (!lineupRecord) {
      // Check if team has a previous round lineup to use as projected lineup
      const { data: prevLineup } = await supabase
        .from('lineups')
        .select('id, formation')
        .eq('fantasy_team_id', teamId)
        .order('fixture_round', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (prevLineup) {
        lineupRecord = prevLineup
        formation = prevLineup.formation ?? '4-3-3'
      }
    }

    if (!lineupRecord) {
      return {
        teamId,
        teamName,
        managerName,
        isCommissioner: teamUserId === currentLeague.commissioner_id,
        isMe: teamUserId === currentUserId,
        totalPoints: 0,
        captainBonus: 0,
        formation,
        starters: [],
        reserves: [],
        substitutions: [],
      }
    }

    // Fetch slots
    const { data: slots } = await supabase
      .from('lineup_slots')
      .select(`
        player_id,
        slot_position,
        is_captain,
        is_starter,
        player:real_players!inner(
          id,
          name,
          position,
          photo_url,
          club_id,
          club:real_clubs!inner(
            short_name,
            logo_url
          )
        )
      `)
      .eq('lineup_id', lineupRecord.id)

    const playerIds = (slots || []).map((s: any) => s.player_id)

    // Fetch player stats for this round
    const { data: statsData } = await supabase
      .from('player_fixture_stats')
      .select(`
        player_id,
        minutes,
        computed_points,
        tackles,
        fouls_committed,
        yellow_cards,
        clean_sheet,
        saves,
        assists,
        goals,
        fixture:fixtures!inner(round)
      `)
      .in('player_id', playerIds)
      .eq('fixture.round', currentMatchup.fixture_round)

    const statsMap = new Map<
      string,
      {
        minutes: number
        points: number
        matchStatus: 'played' | 'benched' | 'not_related'
        scouts: any
      }
    >()
    ;(statsData || []).forEach((st: any) => {
      const minutes = st.minutes ?? 0
      statsMap.set(st.player_id, {
        minutes,
        points: Number(st.computed_points ?? 0),
        matchStatus: minutes > 0 ? 'played' : 'benched',
        scouts: {
          goals: st.goals,
          assists: st.assists,
          tackles: st.tackles,
          cleanSheet: st.clean_sheet,
          saves: st.saves,
          yellowCards: st.yellow_cards,
        },
      })
    })

    const startersInput: LineupPlayerInput[] = (slots || [])
      .filter((s: any) => s.is_starter)
      .map((s: any) => {
        const hasStats = statsMap.has(s.player_id)
        const stat = statsMap.get(s.player_id) || {
          minutes: 0,
          points: 0.0,
          scouts: {},
        }
        const matchStatus = getPlayerMatchStatus(
          s.player.club_id,
          hasStats,
          stat.minutes
        )

        return {
          playerId: s.player_id,
          name: s.player.name,
          clubShortName: s.player.club?.short_name,
          clubLogoUrl: s.player.club?.logo_url,
          photoUrl: s.player.photo_url,
          position: s.player.position,
          slotPosition: s.slot_position,
          isCaptain: s.is_captain ?? false,
          isStarter: true,
          minutes: stat.minutes,
          points: stat.points,
          matchStatus,
          scouts: stat.scouts,
        }
      })

    const reservesInput: LineupPlayerInput[] = (slots || [])
      .filter((s: any) => !s.is_starter)
      .map((s: any) => {
        const hasStats = statsMap.has(s.player_id)
        const stat = statsMap.get(s.player_id) || {
          minutes: 0,
          points: 0.0,
          scouts: {},
        }
        const matchStatus = getPlayerMatchStatus(
          s.player.club_id,
          hasStats,
          stat.minutes
        )

        return {
          playerId: s.player_id,
          name: s.player.name,
          clubShortName: s.player.club?.short_name,
          clubLogoUrl: s.player.club?.logo_url,
          photoUrl: s.player.photo_url,
          position: s.player.position,
          slotPosition: s.slot_position,
          isCaptain: false,
          isStarter: false,
          minutes: stat.minutes,
          points: stat.points,
          matchStatus,
          scouts: stat.scouts,
        }
      })

    // Process Auto-Sub
    const processed: ProcessedLineupResult = processAutoSubstitutions(
      startersInput,
      reservesInput
    )

    return {
      teamId,
      teamName,
      managerName,
      isCommissioner: teamUserId === currentLeague.commissioner_id,
      isMe: teamUserId === currentUserId,
      totalPoints: processed.totalPoints,
      captainBonus: processed.captainBonus,
      formation,
      starters: [...processed.starters].sort(sortByPosition),
      reserves: [...processed.reserves].sort(sortByPosition),
      substitutions: processed.substitutions.map((sub) => ({
        outPlayerName: sub.outPlayer.name,
        inPlayerName: sub.inPlayer.name,
        position: sub.position,
        pointsAdded: sub.inPlayer.points,
        captainTransferred: sub.captainTransferred,
      })),
    }
  }

  const homeTeamRaw = matchup.home_team as any
  const awayTeamRaw = matchup.away_team as any

  const homeTeam = await loadTeamLineup(
    matchup.home_team_id,
    homeTeamRaw?.name ?? 'Time Mandante',
    homeTeamRaw?.profile?.display_name ?? 'Técnico',
    homeTeamRaw?.user_id
  )

  const awayTeam = await loadTeamLineup(
    matchup.away_team_id,
    awayTeamRaw?.name ?? 'Time Visitante',
    awayTeamRaw?.profile?.display_name ?? 'Técnico',
    awayTeamRaw?.user_id
  )

  return {
    leagueId,
    leagueName: league.name,
    matchupId,
    fixtureRound: matchup.fixture_round,
    currentSeasonRound,
    status,
    homeTeam,
    awayTeam,
    result: matchup.result as any,
    isCommissioner: user?.id === league.commissioner_id,
    isPostponedRound,
  }
}

/**
 * Commissioner action to execute Auto-Subs and optionally advance the round.
 */
export async function executeAutoSubAction(
  leagueId: string,
  fixtureRound: number,
  advanceRound: boolean = false
): Promise<RoundClosingSummary> {
  const summary = await executeAutoSubAndCloseRound(
    leagueId,
    fixtureRound,
    advanceRound
  )
  revalidatePath(`/league/${leagueId}`)
  return summary
}

/**
 * Commissioner action to refresh partial stats for started matches without finalizing the round.
 */
export async function refreshMatchupPartialsAction(
  leagueId: string,
  fixtureRound: number
): Promise<RoundPartialsSummary> {
  const summary = await generateRoundPartials(leagueId, fixtureRound)
  revalidatePath(`/league/${leagueId}`)
  return summary
}

