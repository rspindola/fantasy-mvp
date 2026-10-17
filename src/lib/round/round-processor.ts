import { createClient } from '@/lib/supabase/server'
import {
  processAutoSubstitutions,
  type LineupPlayerInput,
  type ProcessedLineupResult,
} from '@/lib/lineup/auto-sub'
import { ensureLockedRoundLineups, populateInitialLineupsForLeague } from '@/lib/lineup/lock'
import { syncRoundFromApiFootball, syncRoundSchedule } from './sync-api-round'

export interface RoundTopScorer {
  rank: number
  playerId: string
  name: string
  position: string
  photoUrl: string | null
  clubName: string
  clubShortName: string
  clubLogoUrl: string | null
  points: number
  minutes: number
  goals: number
  assists: number
  cleanSheet: boolean
  saves: number
  tackles: number
  fantasyTeamName: string | null
}

export interface RoundClosingSummary {
  fixtureRound: number
  teamsProcessed: number
  substitutions: {
    teamName: string
    outPlayerName: string
    inPlayerName: string
    position: string
    pointsAdded: number
    captainTransferred: boolean
  }[]
  matchupResults: {
    homeTeamName: string
    awayTeamName: string
    homePoints: number
    awayPoints: number
    winner: 'home' | 'away' | 'draw'
  }[]
  topScorers?: RoundTopScorer[]
  seasonAdvanced: boolean
  newRound?: number
}

/**
 * Ensures players have scout stats for the given fixture round.
 * If API key is present and stats are missing, syncs from official API-Football.
 * NEVER creates synthetic or fictional mock statistics.
 */
export async function ensureRoundScouts(
  seasonId: string,
  fixtureRound: number,
  leagueId?: string
) {
  const supabase = await createClient()

  // Check if we have fixtures for this round
  const { data: fixtures } = await supabase
    .from('fixtures')
    .select('id, status')
    .eq('season_id', seasonId)
    .eq('round', fixtureRound)

  if (!fixtures || fixtures.length === 0) return

  const activeFixtures = (fixtures as any[]).filter((f: any) => f.status !== 'postponed')
  if (activeFixtures.length === 0) return

  const fixtureIds = activeFixtures.map((f: any) => f.id)

  const { count: existingCount } = await supabase
    .from('player_fixture_stats')
    .select('id', { count: 'exact', head: true })
    .in('fixture_id', fixtureIds)

  if (existingCount && existingCount > 30) {
    return
  }

  // If stats missing, attempt real sync from API-Football
  if (process.env.FOOTBALL_API_KEY) {
    try {
      await syncRoundFromApiFootball(leagueId || '', fixtureRound)
    } catch (err) {
      console.warn('⚠️ API-Football sync in ensureRoundScouts failed:', err)
    }
  }
}

/**
 * Processes automated substitutions, updates round scores and settles H2H matchups
 * for a league in a given round.
 */
export async function executeAutoSubAndCloseRound(
  leagueId: string,
  fixtureRound: number,
  advanceRound: boolean = false
): Promise<RoundClosingSummary> {
  const supabase = await createClient()

  // 1. Fetch league info
  const { data: league } = await supabase
    .from('leagues')
    .select('id, season_id, scoring_mode')
    .eq('id', leagueId)
    .single()

  if (!league) throw new Error('Liga não encontrada')

  // Sync real matches and statistics from API-Football prior to closing round
  if (process.env.FOOTBALL_API_KEY) {
    try {
      await syncRoundFromApiFootball(leagueId, fixtureRound)
    } catch (err) {
      console.warn('⚠️ API-Football sync failed before closing round:', err)
    }
  }

  // Ensure scouts exist
  await ensureRoundScouts(league.season_id, fixtureRound)

  // 2. Fetch all fantasy teams in this league
  const { data: teams } = await supabase
    .from('fantasy_teams')
    .select('id, name')
    .eq('league_id', leagueId)

  if (!teams || teams.length === 0) throw new Error('Nenhum time na liga')

  const teamScoreMap = new Map<string, number>()
  const allSubstitutions: RoundClosingSummary['substitutions'] = []

  // 3. Ensure all teams have complete lineups (at least 11 starters) before scoring
  await ensureLockedRoundLineups(leagueId, fixtureRound)

  // Process each team's lineup
  for (const team of teams) {
    // Fetch lineup
    const { data: lineup } = await supabase
      .from('lineups')
      .select('id, formation')
      .eq('fantasy_team_id', team.id)
      .eq('fixture_round', fixtureRound)
      .maybeSingle()

    if (!lineup) continue

    // Fetch slots with player and club info
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
          club:real_clubs!inner(
            short_name,
            logo_url
          )
        )
      `)
      .eq('lineup_id', lineup.id)

    if (!slots || slots.length === 0) continue

    const playerIds = slots.map((s: any) => s.player_id)

    // Fetch player stats for this round
    const { data: statsData } = await supabase
      .from('player_fixture_stats')
      .select(`
        player_id,
        minutes,
        computed_points,
        fixture:fixtures!inner(round)
      `)
      .in('player_id', playerIds)
      .eq('fixture.round', fixtureRound)

    const statsMap = new Map<string, { minutes: number; points: number }>()
    ;(statsData || []).forEach((st: any) => {
      statsMap.set(st.player_id, {
        minutes: st.minutes ?? 0,
        points: Number(st.computed_points ?? 0),
      })
    })

    const startersInput: LineupPlayerInput[] = slots
      .filter((s: any) => s.is_starter)
      .map((s: any) => {
        const stat = statsMap.get(s.player_id) || { minutes: 0, points: 0.0 }
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
        }
      })

    const reservesInput: LineupPlayerInput[] = slots
      .filter((s: any) => !s.is_starter)
      .map((s: any) => {
        const stat = statsMap.get(s.player_id) || { minutes: 0, points: 0.0 }
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
        }
      })

    // Execute Auto-Sub algorithm!
    const processed: ProcessedLineupResult = processAutoSubstitutions(
      startersInput,
      reservesInput
    )

    teamScoreMap.set(team.id, processed.totalPoints)

    // Save substitution logs for report
    for (const sub of processed.substitutions) {
      allSubstitutions.push({
        teamName: team.name,
        outPlayerName: sub.outPlayer.name,
        inPlayerName: sub.inPlayer.name,
        position: sub.position,
        pointsAdded: sub.inPlayer.points,
        captainTransferred: sub.captainTransferred,
      })
    }

    // Upsert round_scores
    await supabase.from('round_scores').upsert(
      {
        fantasy_team_id: team.id,
        fixture_round: fixtureRound,
        total_points: processed.totalPoints,
        captain_bonus: processed.captainBonus,
      },
      { onConflict: 'fantasy_team_id,fixture_round' }
    )
  }

  // 4. Update H2H Matchups for this round
  const matchupResults: RoundClosingSummary['matchupResults'] = []

  if (league.scoring_mode === 'H2H') {
    const { data: matchups } = await supabase
      .from('h2h_matchups')
      .select(`
        id,
        home_team_id,
        away_team_id,
        home_team:fantasy_teams!h2h_matchups_home_team_id_fkey(name),
        away_team:fantasy_teams!h2h_matchups_away_team_id_fkey(name)
      `)
      .eq('league_id', leagueId)
      .eq('fixture_round', fixtureRound)

    if (matchups) {
      for (const m of matchups as any[]) {
        const homePts = teamScoreMap.get(m.home_team_id) || 0
        const awayPts = teamScoreMap.get(m.away_team_id) || 0
        const result: 'home' | 'away' | 'draw' =
          homePts > awayPts ? 'home' : awayPts > homePts ? 'away' : 'draw'

        await supabase
          .from('h2h_matchups')
          .update({
            home_points: homePts,
            away_points: awayPts,
            result,
          })
          .eq('id', m.id)

        matchupResults.push({
          homeTeamName: m.home_team?.name ?? 'Time A',
          awayTeamName: m.away_team?.name ?? 'Time B',
          homePoints: homePts,
          awayPoints: awayPts,
          winner: result,
        })
      }
    }
  }

  // 5. Optionally advance season round
  let seasonAdvanced = false
  let newRound: number | undefined

  if (advanceRound) {
    const { data: season } = await supabase
      .from('seasons')
      .select('current_round, total_rounds')
      .eq('id', league.season_id)
      .single()

    if (season && season.current_round === fixtureRound && season.current_round < season.total_rounds) {
      newRound = season.current_round + 1
      const { error: seasonErr } = await supabase
        .from('seasons')
        .update({ current_round: newRound })
        .eq('id', league.season_id)

      if (seasonErr) {
        console.error('[advanceRound] Error updating seasons current_round:', seasonErr)
        throw new Error(`Falha ao avançar rodada na temporada: ${seasonErr.message}`)
      }

      seasonAdvanced = true

      try {
        await populateInitialLineupsForLeague(leagueId, newRound!)
      } catch (e) {
        console.error('[advanceRound] Error populating initial lineups for new round:', e)
      }

      // Automatically sync and update the official match schedule for the new round
      try {
        await syncRoundSchedule(league.season_id, newRound!, { supabaseClient: supabase })
      } catch (e) {
        console.warn(`[advanceRound] Error syncing fixtures schedule for new round ${newRound}:`, e)
      }
    }
  }

  const topScorers = await getRoundTopScorers(leagueId, fixtureRound, 10)

  return {
    fixtureRound,
    teamsProcessed: teamScoreMap.size,
    substitutions: allSubstitutions,
    matchupResults,
    topScorers,
    seasonAdvanced,
    newRound,
  }
}

/**
 * Fetches the top scoring players for a given round, cross-referenced with league fantasy rosters.
 */
export async function getRoundTopScorers(
  leagueId: string,
  fixtureRound: number,
  limit: number = 10
): Promise<RoundTopScorer[]> {
  const supabase = await createClient()

  const { data: stats } = await supabase
    .from('player_fixture_stats')
    .select(`
      player_id,
      computed_points,
      minutes,
      goals,
      assists,
      saves,
      tackles,
      clean_sheet,
      player:real_players(
        id,
        name,
        position,
        photo_url,
        club:real_clubs(name, short_name, logo_url)
      ),
      fixture:fixtures!inner(round)
    `)
    .eq('fixture.round', fixtureRound)
    .order('computed_points', { ascending: false })
    .limit(limit)

  if (!stats || stats.length === 0) return []

  const { data: rosters } = await supabase
    .from('roster_players')
    .select('player_id, team:fantasy_teams!inner(name, league_id)')
    .eq('team.league_id', leagueId)

  const rosterMap = new Map<string, string>()
  ;(rosters || []).forEach((r: any) => {
    if (r.player_id && r.team?.name) {
      rosterMap.set(r.player_id, r.team.name)
    }
  })

  return (stats as any[]).map((s: any, idx: number) => {
    const p = s.player || {}
    const c = p.club || {}
    return {
      rank: idx + 1,
      playerId: s.player_id,
      name: p.name || 'Jogador',
      position: p.position || 'MEI',
      photoUrl: p.photo_url || null,
      clubName: c.name || '',
      clubShortName: c.short_name || '',
      clubLogoUrl: c.logo_url || null,
      points: Number(s.computed_points || 0),
      minutes: Number(s.minutes || 0),
      goals: Number(s.goals || 0),
      assists: Number(s.assists || 0),
      cleanSheet: Boolean(s.clean_sheet),
      saves: Number(s.saves || 0),
      tackles: Number(s.tackles || 0),
      fantasyTeamName: rosterMap.get(s.player_id) || null,
    }
  })
}

/**
 * Returns all rounds that contain at least one postponed fixture.
 */
export async function getPostponedRounds(seasonId: string): Promise<number[]> {
  const supabase = await createClient()
  const { data: fixtures } = await supabase
    .from('fixtures')
    .select('round')
    .eq('season_id', seasonId)
    .eq('status', 'postponed')

  if (!fixtures || fixtures.length === 0) return []
  return Array.from(new Set<number>(fixtures.map((f: any) => Number(f.round)))).sort((a: number, b: number) => a - b)
}

/**
 * Toggles a fixture status between 'postponed' and 'scheduled'.
 * When postponing, clears player stats so they reflect 0 minutes / postponed status.
 */
export async function toggleFixturePostponed(
  fixtureId: string,
  isPostponed: boolean
): Promise<void> {
  const supabase = await createClient()

  if (isPostponed) {
    await supabase.from('player_fixture_stats').delete().eq('fixture_id', fixtureId)

    await supabase
      .from('fixtures')
      .update({
        status: 'postponed',
        home_score: null,
        away_score: null,
      })
      .eq('id', fixtureId)
  } else {
    await supabase
      .from('fixtures')
      .update({
        status: 'scheduled',
      })
      .eq('id', fixtureId)
  }
}

/**
 * Recalculates a previously closed postponed round retroactively using official stats.
 */
export async function recalculatePostponedRound(
  leagueId: string,
  fixtureRound: number
): Promise<RoundClosingSummary> {
  return executeAutoSubAndCloseRound(leagueId, fixtureRound, false)
}

export interface RoundPartialsSummary {
  fixtureRound: number
  totalFixtures: number
  startedCount: number
  liveCount: number
  finishedCount: number
  scheduledCount: number
  postponedCount: number
  playersUpdated: number
  matches: {
    id: string
    homeClub: string
    awayClub: string
    status: 'scheduled' | 'live' | 'FT' | 'postponed'
    homeScore: number | null
    awayScore: number | null
    elapsedMinutes: number
  }[]
}

/**
 * Generates momentary/partial statistics for fixtures of a round.
 * Queries API-Football directly for official live/finalized scores and player stats.
 *
 * CRITICAL: Never generates synthetic, random, or mock scores/stats.
 * This does NOT write to round_scores, does NOT lock H2H matchups, and does NOT advance the season.
 */
export async function generateRoundPartials(
  leagueId: string,
  fixtureRound?: number
): Promise<RoundPartialsSummary> {
  const supabase = await createClient()

  // 1. Fetch league to find season_id and current round
  const { data: league } = await supabase
    .from('leagues')
    .select('id, season_id, season:seasons(current_round)')
    .eq('id', leagueId)
    .single()

  if (!league) throw new Error('Liga não encontrada')

  const currentRoundFromSeason = (league.season as any)?.current_round ?? 1
  const roundToProcess = fixtureRound ?? currentRoundFromSeason

  // 1. Sync 100% real matches & player statistics from API-Football
  if (process.env.FOOTBALL_API_KEY) {
    try {
      const realSync = await syncRoundFromApiFootball(leagueId, roundToProcess)
      if (realSync) {
        return realSync
      }
    } catch (err) {
      console.warn('⚠️ API-Football sync failed, reading existing database records:', err)
    }
  }

  // 2. Fallback: Read existing database state directly without synthesizing any fake data
  const { data: fixtures } = await supabase
    .from('fixtures')
    .select(`
      id,
      round,
      kickoff_at,
      status,
      home_score,
      away_score,
      home_club_id,
      away_club_id,
      homeClub:real_clubs!fixtures_home_club_id_fkey(name, short_name),
      awayClub:real_clubs!fixtures_away_club_id_fkey(name, short_name)
    `)
    .eq('season_id', league.season_id)
    .eq('round', roundToProcess)
    .order('kickoff_at', { ascending: true })

  if (!fixtures || fixtures.length === 0) {
    throw new Error(`Nenhuma partida encontrada para a rodada ${roundToProcess}`)
  }

  const now = Date.now()
  let startedCount = 0
  let liveCount = 0
  let finishedCount = 0
  let scheduledCount = 0
  let postponedCount = 0
  const matchDetails: RoundPartialsSummary['matches'] = []

  for (const f of fixtures) {
    const homeClubName = (f.homeClub as any)?.short_name || 'Casa'
    const awayClubName = (f.awayClub as any)?.short_name || 'Fora'

    if (f.status === 'postponed') {
      postponedCount++
      matchDetails.push({
        id: f.id,
        homeClub: homeClubName,
        awayClub: awayClubName,
        status: 'postponed',
        homeScore: null,
        awayScore: null,
        elapsedMinutes: 0,
      })
      continue
    }

    const kickoffTime = f.kickoff_at ? new Date(f.kickoff_at).getTime() : 0
    const elapsedMinutes = f.kickoff_at ? Math.max(0, Math.floor((now - kickoffTime) / 60000)) : 0

    if (f.status === 'FT') {
      finishedCount++
      startedCount++
    } else if (f.status === 'live') {
      liveCount++
      startedCount++
    } else {
      scheduledCount++
    }

    matchDetails.push({
      id: f.id,
      homeClub: homeClubName,
      awayClub: awayClubName,
      status: f.status as any,
      homeScore: f.home_score,
      awayScore: f.away_score,
      elapsedMinutes: f.status === 'FT' ? 90 : elapsedMinutes,
    })
  }

  const fixtureIds = fixtures.map((f: any) => f.id)
  const { count: playersUpdated } = await supabase
    .from('player_fixture_stats')
    .select('id', { count: 'exact', head: true })
    .in('fixture_id', fixtureIds)

  return {
    fixtureRound: roundToProcess,
    totalFixtures: fixtures.length,
    startedCount,
    liveCount,
    finishedCount,
    scheduledCount,
    postponedCount,
    playersUpdated: playersUpdated || 0,
    matches: matchDetails,
  }
}

/**
 * Computes momentary/partial scores for all fantasy teams in a league for a given round.
 * Uses current lineups and player_fixture_stats with auto-substitutions and captain bonus.
 * Does not write to DB.
 */
export async function computeRoundLiveScoresMap(
  leagueId: string,
  fixtureRound: number
): Promise<Map<string, number>> {
  const supabase = await createClient()
  const scoreMap = new Map<string, number>()

  // 1. Fetch all fantasy teams in this league
  const { data: teams } = await supabase
    .from('fantasy_teams')
    .select('id')
    .eq('league_id', leagueId)

  if (!teams || teams.length === 0) return scoreMap

  const teamIds = teams.map((t: any) => t.id)

  // 2. Fetch lineups for this round
  const { data: lineups } = await supabase
    .from('lineups')
    .select('id, fantasy_team_id, formation')
    .in('fantasy_team_id', teamIds)
    .eq('fixture_round', fixtureRound)

  const lineupMap = new Map<string, any>()
  ;(lineups || []).forEach((l: any) => lineupMap.set(l.fantasy_team_id, l))

  // For teams without a lineup in this round, look for their latest previous lineup
  const missingTeamIds = teamIds.filter((id: string) => !lineupMap.has(id))
  if (missingTeamIds.length > 0) {
    const { data: prevLineups } = await supabase
      .from('lineups')
      .select('id, fantasy_team_id, formation, fixture_round')
      .in('fantasy_team_id', missingTeamIds)
      .order('fixture_round', { ascending: false })

    ;(prevLineups || []).forEach((pl: any) => {
      if (!lineupMap.has(pl.fantasy_team_id)) {
        lineupMap.set(pl.fantasy_team_id, pl)
      }
    })
  }

  const allLineupIds = Array.from(lineupMap.values()).map((l) => l.id)
  if (allLineupIds.length === 0) {
    teams.forEach((t: any) => scoreMap.set(t.id, 0))
    return scoreMap
  }

  // 3. Fetch slots
  const { data: slotsData } = await supabase
    .from('lineup_slots')
    .select(`
      lineup_id,
      player_id,
      slot_position,
      is_captain,
      is_starter,
      player:real_players!inner(
        id,
        name,
        position,
        club_id,
        club:real_clubs!inner(short_name, logo_url)
      )
    `)
    .in('lineup_id', allLineupIds)

  const slotsByLineup = new Map<string, any[]>()
  const allPlayerIdsSet = new Set<string>()
  ;(slotsData || []).forEach((s: any) => {
    const list = slotsByLineup.get(s.lineup_id) || []
    list.push(s)
    slotsByLineup.set(s.lineup_id, list)
    allPlayerIdsSet.add(s.player_id)
  })

  // 4. Fetch player stats for this round
  const allPlayerIds = Array.from(allPlayerIdsSet)
  const statsMap = new Map<string, { minutes: number; points: number }>()

  if (allPlayerIds.length > 0) {
    const { data: statsData } = await supabase
      .from('player_fixture_stats')
      .select(`
        player_id,
        minutes,
        computed_points,
        fixture:fixtures!inner(round)
      `)
      .in('player_id', allPlayerIds)
      .eq('fixture.round', fixtureRound)

    ;(statsData || []).forEach((st: any) => {
      statsMap.set(st.player_id, {
        minutes: st.minutes ?? 0,
        points: Number(st.computed_points ?? 0),
      })
    })
  }

  // 5. Fetch fixtures for this round to determine match status accurately
  const { data: fixtures } = await supabase
    .from('fixtures')
    .select('id, status, home_club_id, away_club_id')
    .eq('round', fixtureRound)

  const clubFixtureStatusMap = new Map<string, string>()
  ;(fixtures || []).forEach((f: any) => {
    clubFixtureStatusMap.set(f.home_club_id, f.status)
    clubFixtureStatusMap.set(f.away_club_id, f.status)
  })

  function getPlayerMatchStatus(
    clubId: string,
    hasStats: boolean,
    minutes: number
  ): 'played' | 'benched' | 'not_related' | 'postponed' | 'scheduled' | 'live' {
    const fixtureStatus = clubFixtureStatusMap.get(clubId)
    if (fixtureStatus === 'postponed' && minutes === 0) return 'postponed'
    if (fixtureStatus === 'live') return 'live'
    if (fixtureStatus === 'scheduled') return 'scheduled'
    if (fixtureStatus === 'FT') {
      if (minutes > 0) return 'played'
      if (hasStats) return 'benched'
      return 'not_related'
    }
    return 'scheduled'
  }

  // 6. Compute each team's score using processAutoSubstitutions
  for (const team of teams) {
    const lineup = lineupMap.get(team.id)
    if (!lineup) {
      scoreMap.set(team.id, 0)
      continue
    }

    const slots = slotsByLineup.get(lineup.id) || []
    if (slots.length === 0) {
      scoreMap.set(team.id, 0)
      continue
    }

    const startersInput: LineupPlayerInput[] = slots
      .filter((s: any) => s.is_starter)
      .map((s: any) => {
        const hasStats = statsMap.has(s.player_id)
        const stat = statsMap.get(s.player_id) || { minutes: 0, points: 0.0 }
        const matchStatus = getPlayerMatchStatus(s.player.club_id, hasStats, stat.minutes)
        return {
          playerId: s.player_id,
          name: s.player.name,
          clubShortName: s.player.club?.short_name,
          clubLogoUrl: s.player.club?.logo_url,
          photoUrl: null,
          position: s.player.position,
          slotPosition: s.slot_position,
          isCaptain: s.is_captain ?? false,
          isStarter: true,
          minutes: stat.minutes,
          points: stat.points,
          matchStatus,
        }
      })

    const reservesInput: LineupPlayerInput[] = slots
      .filter((s: any) => !s.is_starter)
      .map((s: any) => {
        const hasStats = statsMap.has(s.player_id)
        const stat = statsMap.get(s.player_id) || { minutes: 0, points: 0.0 }
        const matchStatus = getPlayerMatchStatus(s.player.club_id, hasStats, stat.minutes)
        return {
          playerId: s.player_id,
          name: s.player.name,
          clubShortName: s.player.club?.short_name,
          clubLogoUrl: s.player.club?.logo_url,
          photoUrl: null,
          position: s.player.position,
          slotPosition: s.slot_position,
          isCaptain: false,
          isStarter: false,
          minutes: stat.minutes,
          points: stat.points,
          matchStatus,
        }
      })

    const processed = processAutoSubstitutions(startersInput, reservesInput)
    scoreMap.set(team.id, processed.totalPoints)
  }

  return scoreMap
}



