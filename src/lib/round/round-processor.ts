import { createClient } from '@/lib/supabase/server'
import {
  processAutoSubstitutions,
  type LineupPlayerInput,
  type ProcessedLineupResult,
} from '@/lib/lineup/auto-sub'
import { ensureLockedRoundLineups, populateInitialLineupsForLeague } from '@/lib/lineup/lock'
import { calculatePlayerScoring } from '@/lib/scoring/scoring-engine'

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
  seasonAdvanced: boolean
  newRound?: number
}

/**
 * Ensures players have scout stats for the given fixture round.
 * If stats don't exist yet, generates realistic scouts with ~15% resting players (0 min)
 * to test and demonstrate auto-substitution.
 */
export async function ensureRoundScouts(seasonId: string, fixtureRound: number) {
  const supabase = await createClient()

  // Check if we have fixtures for this round
  const { data: fixtures } = await supabase
    .from('fixtures')
    .select('id, home_club_id, away_club_id, status')
    .eq('season_id', seasonId)
    .eq('round', fixtureRound)

  if (!fixtures || fixtures.length === 0) return

  // Filter ONLY active/played fixtures (skip postponed fixtures!)
  const activeFixtures = fixtures.filter((f) => f.status !== 'postponed')
  if (activeFixtures.length === 0) return

  const fixtureIds = activeFixtures.map((f) => f.id)

  // Check existing stats count
  const { count: existingCount } = await supabase
    .from('player_fixture_stats')
    .select('id', { count: 'exact', head: true })
    .in('fixture_id', fixtureIds)

  if (existingCount && existingCount > 30) {
    // Already populated
    return
  }

  // Fetch all players for clubs playing in this round (excluding postponed games)
  const clubIds = Array.from(
    new Set(activeFixtures.flatMap((f) => [f.home_club_id, f.away_club_id]))
  )

  const { data: players } = await supabase
    .from('real_players')
    .select('id, club_id, position, avg_points')
    .in('club_id', clubIds)
    .eq('is_active', true)

  if (!players || players.length === 0) return

  // Create club-to-fixture mapping
  const clubFixtureMap = new Map<string, string>()
  for (const f of fixtures) {
    clubFixtureMap.set(f.home_club_id, f.id)
    clubFixtureMap.set(f.away_club_id, f.id)
  }

  const statRecords = []
  for (let idx = 0; idx < players.length; idx++) {
    const p = players[idx]
    const fId = clubFixtureMap.get(p.club_id)
    if (!fId) continue

    // Simulate ~15% resting/injured players with 0 minutes (so auto-sub triggers!)
    const isResting = idx % 7 === 0
    const minutes = isResting ? 0 : 90

    let pts = 0
    if (!isResting) {
      const hasGoal = (p.position === 'ATA' && idx % 3 === 0) || (p.position === 'MEI' && idx % 8 === 0)
      const hasAssist = (p.position === 'MEI' && idx % 4 === 1) || (p.position === 'LAT' && idx % 6 === 2)
      const cleanSheet = (p.position === 'ZAG' || p.position === 'LAT' || p.position === 'GOL') && idx % 2 === 0

      pts = calculatePlayerScoring({
        position: p.position as any,
        minutes: 90,
        goals: hasGoal ? 1 : 0,
        assists: hasAssist ? 1 : 0,
        shotsOnWoodwork: 0,
        shotsOnTarget: p.position === 'ATA' || p.position === 'MEI' ? 1 : 0,
        shotsOffTarget: 1,
        foulsDrawn: 2,
        penaltiesWon: 0,
        passesFailed: 3,
        offsides: 0,
        penaltiesMissed: 0,
        cleanSheet,
        saves: p.position === 'GOL' ? 3 + (idx % 3) : 0,
        penaltySaves: 0,
        tackles: 2,
        foulsCommitted: 1,
        ownGoals: 0,
        yellowCards: idx % 9 === 0 ? 1 : 0,
        redCards: 0,
        goalsConceded: cleanSheet ? 0 : 1,
        penaltiesCommitted: 0,
      })
    }

    statRecords.push({
      player_id: p.id,
      fixture_id: fId,
      minutes,
      computed_points: pts,
    })
  }

  // Insert in batches of 100
  for (let i = 0; i < statRecords.length; i += 100) {
    const batch = statRecords.slice(i, i + 100)
    await supabase.from('player_fixture_stats').upsert(batch, {
      onConflict: 'player_id,fixture_id',
    })
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

    const playerIds = slots.map((s) => s.player_id)

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
      await supabase
        .from('seasons')
        .update({ current_round: newRound })
        .eq('id', league.season_id)

      seasonAdvanced = true

      try {
        await populateInitialLineupsForLeague(leagueId, newRound)
      } catch (e) {
        console.error('[advanceRound] Error populating initial lineups for new round:', e)
      }
    }
  }

  return {
    fixtureRound,
    teamsProcessed: teamScoreMap.size,
    substitutions: allSubstitutions,
    matchupResults,
    seasonAdvanced,
    newRound,
  }
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
  return Array.from(new Set(fixtures.map((f: any) => f.round))).sort((a, b) => a - b)
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
 * Simulates the completion of a postponed or scheduled match, generating realistic Cartola scouts.
 */
export async function simulateFixtureMatch(
  fixtureId: string,
  homeScore: number,
  awayScore: number
): Promise<void> {
  const supabase = await createClient()

  // 1. Fetch fixture
  const { data: fixture } = await supabase
    .from('fixtures')
    .select('id, home_club_id, away_club_id, round, season_id')
    .eq('id', fixtureId)
    .single()

  if (!fixture) throw new Error('Partida não encontrada')

  // 2. Update fixture status and scores
  await supabase
    .from('fixtures')
    .update({
      status: 'FT',
      home_score: homeScore,
      away_score: awayScore,
    })
    .eq('id', fixtureId)

  // 3. Fetch players for both clubs
  const { data: homePlayers } = await supabase
    .from('real_players')
    .select('id, position, name')
    .eq('club_id', fixture.home_club_id)
    .eq('is_active', true)

  const { data: awayPlayers } = await supabase
    .from('real_players')
    .select('id, position, name')
    .eq('club_id', fixture.away_club_id)
    .eq('is_active', true)

  const statRecords = []

  // Process Home Players
  const homeCleanSheet = awayScore === 0
  let homeGoalsRemaining = homeScore
  let homeAssistsRemaining = Math.min(homeScore, 2)

  for (let idx = 0; idx < (homePlayers || []).length; idx++) {
    const p = homePlayers![idx]
    const isStarter = idx < 11
    if (!isStarter) {
      statRecords.push({
        player_id: p.id,
        fixture_id: fixtureId,
        minutes: 0,
        computed_points: 0,
      })
      continue
    }

    let goals = 0
    if (homeGoalsRemaining > 0 && (p.position === 'ATA' || p.position === 'MEI')) {
      goals = 1
      homeGoalsRemaining--
    }

    let assists = 0
    if (homeAssistsRemaining > 0 && goals === 0 && (p.position === 'MEI' || p.position === 'LAT')) {
      assists = 1
      homeAssistsRemaining--
    }

    const cleanSheet =
      (p.position === 'GOL' || p.position === 'ZAG' || p.position === 'LAT') && homeCleanSheet
    const goalsConceded =
      p.position === 'GOL' || p.position === 'ZAG' || p.position === 'LAT' ? awayScore : 0
    const saves = p.position === 'GOL' ? Math.max(1, 4 - awayScore) : 0

    const pts = calculatePlayerScoring({
      position: p.position as any,
      minutes: 90,
      goals,
      assists,
      shotsOnWoodwork: 0,
      shotsOnTarget: goals > 0 ? 2 : 1,
      shotsOffTarget: 1,
      foulsDrawn: 2,
      penaltiesWon: 0,
      passesFailed: 4,
      offsides: 0,
      penaltiesMissed: 0,
      cleanSheet,
      saves,
      penaltySaves: 0,
      tackles: p.position === 'ZAG' || p.position === 'LAT' ? 3 : 1,
      foulsCommitted: 1,
      ownGoals: 0,
      yellowCards: idx % 5 === 0 ? 1 : 0,
      redCards: 0,
      goalsConceded,
      penaltiesCommitted: 0,
    })

    statRecords.push({
      player_id: p.id,
      fixture_id: fixtureId,
      minutes: 90,
      goals,
      assists,
      tackles: p.position === 'ZAG' || p.position === 'LAT' ? 3 : 1,
      clean_sheet: cleanSheet,
      saves,
      yellow_cards: idx % 5 === 0 ? 1 : 0,
      goals_conceded: goalsConceded,
      computed_points: pts,
    })
  }

  // Process Away Players
  const awayCleanSheet = homeScore === 0
  let awayGoalsRemaining = awayScore
  let awayAssistsRemaining = Math.min(awayScore, 2)

  for (let idx = 0; idx < (awayPlayers || []).length; idx++) {
    const p = awayPlayers![idx]
    const isStarter = idx < 11
    if (!isStarter) {
      statRecords.push({
        player_id: p.id,
        fixture_id: fixtureId,
        minutes: 0,
        computed_points: 0,
      })
      continue
    }

    let goals = 0
    if (awayGoalsRemaining > 0 && (p.position === 'ATA' || p.position === 'MEI')) {
      goals = 1
      awayGoalsRemaining--
    }

    let assists = 0
    if (awayAssistsRemaining > 0 && goals === 0 && (p.position === 'MEI' || p.position === 'LAT')) {
      assists = 1
      awayAssistsRemaining--
    }

    const cleanSheet =
      (p.position === 'GOL' || p.position === 'ZAG' || p.position === 'LAT') && awayCleanSheet
    const goalsConceded =
      p.position === 'GOL' || p.position === 'ZAG' || p.position === 'LAT' ? homeScore : 0
    const saves = p.position === 'GOL' ? Math.max(1, 4 - homeScore) : 0

    const pts = calculatePlayerScoring({
      position: p.position as any,
      minutes: 90,
      goals,
      assists,
      shotsOnWoodwork: 0,
      shotsOnTarget: goals > 0 ? 2 : 1,
      shotsOffTarget: 1,
      foulsDrawn: 2,
      penaltiesWon: 0,
      passesFailed: 4,
      offsides: 0,
      penaltiesMissed: 0,
      cleanSheet,
      saves,
      penaltySaves: 0,
      tackles: p.position === 'ZAG' || p.position === 'LAT' ? 3 : 1,
      foulsCommitted: 1,
      ownGoals: 0,
      yellowCards: idx % 6 === 0 ? 1 : 0,
      redCards: 0,
      goalsConceded,
      penaltiesCommitted: 0,
    })

    statRecords.push({
      player_id: p.id,
      fixture_id: fixtureId,
      minutes: 90,
      goals,
      assists,
      tackles: p.position === 'ZAG' || p.position === 'LAT' ? 3 : 1,
      clean_sheet: cleanSheet,
      saves,
      yellow_cards: idx % 6 === 0 ? 1 : 0,
      goals_conceded: goalsConceded,
      computed_points: pts,
    })
  }

  // Upsert all stats
  await supabase.from('player_fixture_stats').upsert(statRecords, {
    onConflict: 'player_id,fixture_id',
  })
}

/**
 * Recalculates a previously closed postponed round retroactively.
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
 * Generates momentary/partial statistics for fixtures of a round that have already started.
 * Only fixtures whose kickoff_at <= now() are updated with live/FT status and player scouts.
 * Future fixtures remain 'scheduled' with 0 player scouts ("A jogar").
 *
 * CRITICAL: This does NOT write to round_scores, does NOT lock H2H matchups, and does NOT advance the season.
 * Official scores are strictly computed when the commissioner consolidates and closes the round.
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

  // 2. Fetch all fixtures for this round
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
  let playersUpdated = 0
  const matchDetails: RoundPartialsSummary['matches'] = []

  for (const f of fixtures) {
    const homeClubName = (f.homeClub as any)?.short_name || 'Casa'
    const awayClubName = (f.awayClub as any)?.short_name || 'Fora'

    // If postponed, keep as postponed
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
    const elapsedMinutes = f.kickoff_at ? Math.floor((now - kickoffTime) / 60000) : -1

    // If kickoff is in the future
    if (elapsedMinutes < 0) {
      scheduledCount++
      await supabase
        .from('fixtures')
        .update({ status: 'scheduled', home_score: 0, away_score: 0 })
        .eq('id', f.id)
      // Clean up any stale stats for future matches so players show as "A jogar"
      await supabase.from('player_fixture_stats').delete().eq('fixture_id', f.id)

      matchDetails.push({
        id: f.id,
        homeClub: homeClubName,
        awayClub: awayClubName,
        status: 'scheduled',
        homeScore: 0,
        awayScore: 0,
        elapsedMinutes,
      })
      continue
    }

    // Match has started (elapsedMinutes >= 0)
    startedCount++
    const isAlreadyFT = f.status === 'FT'
    const isFinished = isAlreadyFT || elapsedMinutes >= 115
    const newStatus: 'FT' | 'live' = isFinished ? 'FT' : 'live'

    if (isFinished) finishedCount++
    else liveCount++

    // Determine realistic scores if not already set or keeping existing
    let homeScore = f.home_score
    let awayScore = f.away_score

    if (homeScore === null || awayScore === null) {
      // Deterministic generation based on fixture ID
      const hash = f.id.split('').reduce((acc: number, char: string) => acc + char.charCodeAt(0), 0)
      if (isFinished) {
        homeScore = (hash % 3) + (hash % 2 === 0 ? 1 : 0)
        awayScore = (hash + 1) % 3
      } else if (elapsedMinutes >= 45) {
        homeScore = hash % 3
        awayScore = (hash + 1) % 2
      } else {
        homeScore = hash % 2 === 0 ? 1 : 0
        awayScore = hash % 3 === 0 ? 1 : 0
      }
    }

    // Update fixture status and score
    await supabase
      .from('fixtures')
      .update({
        status: newStatus,
        home_score: homeScore,
        away_score: awayScore,
      })
      .eq('id', f.id)

    // Generate player stats for both clubs
    const { data: homePlayers } = await supabase
      .from('real_players')
      .select('id, position, name')
      .eq('club_id', f.home_club_id)
      .eq('is_active', true)

    const { data: awayPlayers } = await supabase
      .from('real_players')
      .select('id, position, name')
      .eq('club_id', f.away_club_id)
      .eq('is_active', true)

    const statRecords = []
    const homeCleanSheet = awayScore === 0
    let homeGoalsRemaining = homeScore
    let homeAssistsRemaining = Math.min(homeScore, 2)

    const effectiveMinutes = isFinished
      ? 90
      : Math.min(90, Math.max(15, Math.min(elapsedMinutes, 85)))

    // Home Players
    for (let idx = 0; idx < (homePlayers || []).length; idx++) {
      const p = homePlayers![idx]
      const isStarter = idx < 11
      const isSub = !isStarter && idx < 14 && elapsedMinutes > 55

      const minutes = isStarter
        ? effectiveMinutes
        : isSub
        ? Math.min(30, Math.max(10, elapsedMinutes - 55))
        : 0

      if (minutes === 0) {
        statRecords.push({
          player_id: p.id,
          fixture_id: f.id,
          minutes: 0,
          computed_points: 0,
        })
        continue
      }

      let goals = 0
      if (homeGoalsRemaining > 0 && (p.position === 'ATA' || p.position === 'MEI')) {
        goals = 1
        homeGoalsRemaining--
      }

      let assists = 0
      if (homeAssistsRemaining > 0 && goals === 0 && (p.position === 'MEI' || p.position === 'LAT')) {
        assists = 1
        homeAssistsRemaining--
      }

      const cleanSheet =
        (p.position === 'GOL' || p.position === 'ZAG' || p.position === 'LAT') && homeCleanSheet
      const goalsConceded =
        p.position === 'GOL' || p.position === 'ZAG' || p.position === 'LAT' ? awayScore : 0
      const saves = p.position === 'GOL' ? Math.max(1, Math.floor(minutes / 25)) : 0
      const tackles =
        p.position === 'ZAG' || p.position === 'LAT'
          ? Math.min(3, Math.floor(minutes / 25))
          : p.position === 'MEI'
          ? 1
          : 0

      const pts = calculatePlayerScoring({
        position: p.position as any,
        minutes,
        goals,
        assists,
        shotsOnWoodwork: 0,
        shotsOnTarget: goals > 0 ? 2 : p.position === 'ATA' ? 1 : 0,
        shotsOffTarget: p.position === 'ATA' || p.position === 'MEI' ? 1 : 0,
        foulsDrawn: Math.floor(minutes / 40),
        penaltiesWon: 0,
        passesFailed: Math.floor(minutes / 20),
        offsides: 0,
        penaltiesMissed: 0,
        cleanSheet,
        saves,
        penaltySaves: 0,
        tackles,
        foulsCommitted: 1,
        ownGoals: 0,
        yellowCards: idx === 3 ? 1 : 0,
        redCards: 0,
        goalsConceded,
        penaltiesCommitted: 0,
      })

      statRecords.push({
        player_id: p.id,
        fixture_id: f.id,
        minutes,
        goals,
        assists,
        tackles,
        clean_sheet: cleanSheet,
        saves,
        yellow_cards: idx === 3 ? 1 : 0,
        goals_conceded: goalsConceded,
        computed_points: pts,
      })
    }

    // Away Players
    const awayCleanSheet = homeScore === 0
    let awayGoalsRemaining = awayScore
    let awayAssistsRemaining = Math.min(awayScore, 2)

    for (let idx = 0; idx < (awayPlayers || []).length; idx++) {
      const p = awayPlayers![idx]
      const isStarter = idx < 11
      const isSub = !isStarter && idx < 14 && elapsedMinutes > 55

      const minutes = isStarter
        ? effectiveMinutes
        : isSub
        ? Math.min(30, Math.max(10, elapsedMinutes - 55))
        : 0

      if (minutes === 0) {
        statRecords.push({
          player_id: p.id,
          fixture_id: f.id,
          minutes: 0,
          computed_points: 0,
        })
        continue
      }

      let goals = 0
      if (awayGoalsRemaining > 0 && (p.position === 'ATA' || p.position === 'MEI')) {
        goals = 1
        awayGoalsRemaining--
      }

      let assists = 0
      if (awayAssistsRemaining > 0 && goals === 0 && (p.position === 'MEI' || p.position === 'LAT')) {
        assists = 1
        awayAssistsRemaining--
      }

      const cleanSheet =
        (p.position === 'GOL' || p.position === 'ZAG' || p.position === 'LAT') && awayCleanSheet
      const goalsConceded =
        p.position === 'GOL' || p.position === 'ZAG' || p.position === 'LAT' ? homeScore : 0
      const saves = p.position === 'GOL' ? Math.max(1, Math.floor(minutes / 25)) : 0
      const tackles =
        p.position === 'ZAG' || p.position === 'LAT'
          ? Math.min(3, Math.floor(minutes / 25))
          : p.position === 'MEI'
          ? 1
          : 0

      const pts = calculatePlayerScoring({
        position: p.position as any,
        minutes,
        goals,
        assists,
        shotsOnWoodwork: 0,
        shotsOnTarget: goals > 0 ? 2 : p.position === 'ATA' ? 1 : 0,
        shotsOffTarget: p.position === 'ATA' || p.position === 'MEI' ? 1 : 0,
        foulsDrawn: Math.floor(minutes / 40),
        penaltiesWon: 0,
        passesFailed: Math.floor(minutes / 20),
        offsides: 0,
        penaltiesMissed: 0,
        cleanSheet,
        saves,
        penaltySaves: 0,
        tackles,
        foulsCommitted: 1,
        ownGoals: 0,
        yellowCards: idx === 4 ? 1 : 0,
        redCards: 0,
        goalsConceded,
        penaltiesCommitted: 0,
      })

      statRecords.push({
        player_id: p.id,
        fixture_id: f.id,
        minutes,
        goals,
        assists,
        tackles,
        clean_sheet: cleanSheet,
        saves,
        yellow_cards: idx === 4 ? 1 : 0,
        goals_conceded: goalsConceded,
        computed_points: pts,
      })
    }

    await supabase.from('player_fixture_stats').upsert(statRecords, {
      onConflict: 'player_id,fixture_id',
    })

    playersUpdated += statRecords.length

    matchDetails.push({
      id: f.id,
      homeClub: homeClubName,
      awayClub: awayClubName,
      status: newStatus,
      homeScore,
      awayScore,
      elapsedMinutes,
    })
  }

  return {
    fixtureRound: roundToProcess,
    totalFixtures: fixtures.length,
    startedCount,
    liveCount,
    finishedCount,
    scheduledCount,
    postponedCount,
    playersUpdated,
    matches: matchDetails,
  }
}


