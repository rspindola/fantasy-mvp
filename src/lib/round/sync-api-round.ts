import https from 'https'
import { createClient } from '@/lib/supabase/server'
import { calculatePlayerScoring } from '@/lib/scoring/scoring-engine'
import type { RoundPartialsSummary } from './round-processor'

const API_HOST = 'v3.football.api-sports.io'
const LEAGUE_ID = 71 // Brasileirão Série A
const SEASON_YEAR = 2026

function fetchApiFootball(path: string, apiKey: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: API_HOST,
      path: encodeURI(path),
      headers: {
        'x-apisports-key': apiKey,
      },
    }

    https
      .get(options, (res) => {
        let body = ''
        res.on('data', (chunk) => (body += chunk))
        res.on('end', () => {
          try {
            const parsed = JSON.parse(body)
            resolve(parsed)
          } catch (e) {
            reject(new Error(`Failed to parse API-Football response: ${body.substring(0, 100)}`))
          }
        })
      })
      .on('error', reject)
  })
}

function mapApiFixtureStatus(short: string): 'FT' | 'live' | 'postponed' | 'scheduled' {
  switch (short) {
    case 'FT':
    case 'AET':
    case 'PEN':
      return 'FT'
    case '1H':
    case '2H':
    case 'HT':
    case 'ET':
    case 'P':
    case 'LIVE':
      return 'live'
    case 'PST':
      return 'postponed'
    default:
      return 'scheduled'
  }
}

/**
 * Fetches real matches and player statistics directly from API-Football for the given round.
 * Updates fixtures and player_fixture_stats with 100% real official data.
 */
export async function syncRoundFromApiFootball(
  leagueId: string,
  fixtureRound: number
): Promise<RoundPartialsSummary | null> {
  const apiKey = process.env.FOOTBALL_API_KEY
  if (!apiKey) {
    console.warn('⚠️ FOOTBALL_API_KEY not configured, skipping API-Football sync.')
    return null
  }

  const supabase = await createClient()

  // 1. Fetch league to get season_id
  const { data: league, error: lErr } = await supabase
    .from('leagues')
    .select('id, season_id')
    .eq('id', leagueId)
    .single()

  if (lErr || !league) {
    throw new Error('Liga não encontrada')
  }

  // 2. Query API-Football for this round's fixtures
  const roundEndpoint = `/fixtures?league=${LEAGUE_ID}&season=${SEASON_YEAR}&round=Regular Season - ${fixtureRound}`
  const apiFixturesRes = await fetchApiFootball(roundEndpoint, apiKey)

  if (!apiFixturesRes?.response || apiFixturesRes.response.length === 0) {
    console.warn(`⚠️ Nenhum confronto retornado pela API-Football para a rodada ${fixtureRound}`)
    return null
  }

  const apiFixtures = apiFixturesRes.response as any[]

  // 3. Load DB fixtures for this round and season
  const { data: dbFixtures } = await supabase
    .from('fixtures')
    .select(`
      id,
      api_fixture_id,
      round,
      status,
      home_score,
      away_score,
      home_club_id,
      away_club_id,
      homeClub:real_clubs!fixtures_home_club_id_fkey(id, name, short_name),
      awayClub:real_clubs!fixtures_away_club_id_fkey(id, name, short_name)
    `)
    .eq('season_id', league.season_id)
    .eq('round', fixtureRound)

  if (!dbFixtures || dbFixtures.length === 0) {
    return null
  }

  const dbFixtureByApiId = new Map<number, any>()
  dbFixtures.forEach((f: any) => {
    if (f.api_fixture_id) {
      dbFixtureByApiId.set(Number(f.api_fixture_id), f)
    }
  })

  // 4. Pre-load all real_players with api_football_id
  const { data: allPlayers } = await supabase
    .from('real_players')
    .select('id, position, api_football_id, name')
    .not('api_football_id', 'is', null)

  const playerByApiId = new Map<number, { id: string; position: 'GOL' | 'LAT' | 'ZAG' | 'MEI' | 'ATA'; name: string }>()
  ;(allPlayers || []).forEach((p: any) => {
    playerByApiId.set(Number(p.api_football_id), {
      id: p.id,
      position: p.position,
      name: p.name,
    })
  })

  let startedCount = 0
  let liveCount = 0
  let finishedCount = 0
  let scheduledCount = 0
  let postponedCount = 0
  let playersUpdated = 0
  const matchDetails: RoundPartialsSummary['matches'] = []

  // 5. Iterate each fixture from API-Football and sync
  for (const apiFix of apiFixtures) {
    const apiFixtureId = Number(apiFix.fixture.id)
    const dbFixture = dbFixtureByApiId.get(apiFixtureId)
    if (!dbFixture) continue

    const homeClubName = (dbFixture.homeClub as any)?.short_name || apiFix.teams.home.name
    const awayClubName = (dbFixture.awayClub as any)?.short_name || apiFix.teams.away.name
    const status = mapApiFixtureStatus(apiFix.fixture.status.short)

    const homeScore = status === 'scheduled' ? null : apiFix.goals.home
    const awayScore = status === 'scheduled' ? null : apiFix.goals.away
    const elapsedMinutes = apiFix.fixture.status.elapsed || 0

    // Update fixture status and score in Supabase
    await supabase
      .from('fixtures')
      .update({
        status,
        home_score: homeScore,
        away_score: awayScore,
      })
      .eq('id', dbFixture.id)

    if (status === 'FT') {
      finishedCount++
      startedCount++
    } else if (status === 'live') {
      liveCount++
      startedCount++
    } else if (status === 'postponed') {
      postponedCount++
    } else {
      scheduledCount++
      // If scheduled, clear any stale scouts
      await supabase.from('player_fixture_stats').delete().eq('fixture_id', dbFixture.id)
      matchDetails.push({
        id: dbFixture.id,
        homeClub: homeClubName,
        awayClub: awayClubName,
        status: 'scheduled',
        homeScore: null,
        awayScore: null,
        elapsedMinutes: 0,
      })
      continue
    }

    matchDetails.push({
      id: dbFixture.id,
      homeClub: homeClubName,
      awayClub: awayClubName,
      status,
      homeScore,
      awayScore,
      elapsedMinutes,
    })

    // If live or FT, fetch real player statistics from API-Football
    const playersEndpoint = `/fixtures/players?fixture=${apiFixtureId}`
    const playersRes = await fetchApiFootball(playersEndpoint, apiKey)
    const statBatch: any[] = []

    for (const teamItem of playersRes?.response || []) {
      const isHomeTeam = teamItem.team.id === apiFix.teams.home.id
      const teamGoalsConceded = isHomeTeam ? (awayScore ?? 0) : (homeScore ?? 0)

      for (const pObj of teamItem.players || []) {
        const pApiId = Number(pObj.player.id)
        const dbP = playerByApiId.get(pApiId)
        if (!dbP) continue

        const stats = pObj.statistics?.[0]
        if (!stats) continue

        const position = dbP.position
        const minutes = stats.games?.minutes || 0
        const goals = stats.goals?.total || 0
        const assists = stats.goals?.assists || 0
        const saves = stats.goals?.saves || 0
        const goalsConceded = position === 'GOL' ? (stats.goals?.conceded ?? teamGoalsConceded) : 0
        const cleanSheet =
          (position === 'GOL' || position === 'ZAG' || position === 'LAT') &&
          minutes >= 45 &&
          teamGoalsConceded === 0 &&
          (position !== 'GOL' || goalsConceded === 0)

        const tackles = (stats.tackles?.total || 0) + (stats.tackles?.interceptions || 0)
        const foulsCommitted = stats.fouls?.committed || 0
        const foulsDrawn = stats.fouls?.drawn || 0
        const yellowCards = stats.cards?.yellow || 0
        const redCards = stats.cards?.red || 0
        const penaltySaves = stats.penalty?.saved || 0
        const penaltiesMissed = stats.penalty?.missed || 0
        const penaltiesWon = stats.penalty?.won || 0
        const penaltiesCommitted = stats.penalty?.commited || 0

        // In API-Football, shots.on includes goals; in Cartola, finalização defendida (FD) does not count the goal
        const rawShotsOn = stats.shots?.on || 0
        const shotsOnTarget = Math.max(0, rawShotsOn - goals)
        const rawShotsTotal = stats.shots?.total || 0
        const shotsOffTarget = Math.max(0, rawShotsTotal - rawShotsOn)

        const passesTotal = stats.passes?.total || 0
        const passesAcc = parseInt(stats.passes?.accuracy) || 0
        const passesCompleted = Math.min(
          passesTotal,
          passesAcc > 100 ? Math.round((passesTotal * passesAcc) / 100) : passesAcc
        )
        const passesFailed = Math.max(0, passesTotal - passesCompleted)
        const offsides = stats.offsides || 0

        const computedPoints = calculatePlayerScoring({
          position,
          minutes,
          goals,
          assists,
          shotsOnWoodwork: 0,
          shotsOnTarget,
          shotsOffTarget,
          foulsDrawn,
          penaltiesWon,
          passesCompleted,
          passesFailed,
          offsides,
          penaltiesMissed,
          cleanSheet,
          saves,
          penaltySaves,
          tackles,
          foulsCommitted,
          ownGoals: 0,
          yellowCards,
          redCards,
          goalsConceded,
          penaltiesCommitted,
        })

        statBatch.push({
          player_id: dbP.id,
          fixture_id: dbFixture.id,
          minutes,
          tackles,
          fouls_committed: foulsCommitted,
          own_goals: 0,
          yellow_cards: yellowCards,
          red_cards: redCards,
          clean_sheet: cleanSheet,
          saves,
          penalty_saves: penaltySaves,
          goals_conceded: goalsConceded,
          penalties_committed: penaltiesCommitted,
          fouls_drawn: foulsDrawn,
          passes_failed: passesFailed,
          passes_completed: passesCompleted,
          assists,
          shots_on_woodwork: 0,
          shots_on_target: shotsOnTarget,
          shots_off_target: shotsOffTarget,
          goals,
          offsides,
          penalties_missed: penaltiesMissed,
          penalties_won: penaltiesWon,
          computed_points: computedPoints,
        })
      }
    }

    if (statBatch.length > 0) {
      await supabase
        .from('player_fixture_stats')
        .upsert(statBatch, { onConflict: 'player_id,fixture_id' })
      playersUpdated += statBatch.length
    }
  }

  return {
    fixtureRound,
    totalFixtures: dbFixtures.length,
    startedCount,
    liveCount,
    finishedCount,
    scheduledCount,
    postponedCount,
    playersUpdated,
    matches: matchDetails,
  }
}
