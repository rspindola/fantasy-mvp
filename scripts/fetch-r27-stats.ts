import { Client } from 'pg'
import fs from 'fs'
import path from 'path'
import { calculatePlayerScoring } from '../src/lib/scoring/scoring-engine'

const CACHE_FILE = path.join(__dirname, 'data', 'round27_stats_cache.json')

function mapPosition(apiPos: string, indexInGroup: number): 'GOL' | 'LAT' | 'ZAG' | 'MEI' | 'ATA' {
  switch (apiPos) {
    case 'G':
    case 'Goalkeeper':
      return 'GOL'
    case 'D':
    case 'Defender':
      return indexInGroup % 2 === 0 ? 'LAT' : 'ZAG'
    case 'M':
    case 'Midfielder':
      return 'MEI'
    case 'F':
    case 'Attacker':
      return 'ATA'
    default:
      return 'MEI'
  }
}

export async function syncRound27RealStats(client: Client, seasonId: string) {
  console.log('📡 Processando estatísticas reais da Rodada 27 do Brasileirão...')

  if (!fs.existsSync(CACHE_FILE)) {
    throw new Error(`Cache file não encontrado em ${CACHE_FILE}`)
  }

  const cachedData: Record<number, any[]> = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'))

  // 1. Fetch fixtures for Round 27
  const fixturesRes = await client.query(`
    SELECT f.id, f.api_fixture_id, f.home_club_id, f.away_club_id,
           f.home_score, f.away_score,
           hc.name as home, ac.name as away
    FROM fixtures f
    JOIN real_clubs hc ON hc.id = f.home_club_id
    JOIN real_clubs ac ON ac.id = f.away_club_id
    WHERE f.season_id = $1 AND f.round = 27;
  `, [seasonId])

  const fixtures = fixturesRes.rows

  // 2. Fetch club mapping
  const clubsRes = await client.query(`SELECT id, api_football_id FROM real_clubs WHERE season_id = $1;`, [seasonId])
  const clubIdMap = new Map<number, string>()
  clubsRes.rows.forEach(r => clubIdMap.set(r.api_football_id, r.id))

  // 3. Pre-load all real_players into memory
  const allPlayersRes = await client.query(`SELECT id, position, api_football_id FROM real_players;`)
  const playerMap = new Map<number, { id: string; position: 'GOL' | 'LAT' | 'ZAG' | 'MEI' | 'ATA' }>()
  allPlayersRes.rows.forEach(r => {
    if (r.api_football_id) {
      playerMap.set(r.api_football_id, { id: r.id, position: r.position })
    }
  })

  // 4. Identify missing players and insert them in bulk
  const missingPlayers: { clubId: string; name: string; position: 'GOL' | 'LAT' | 'ZAG' | 'MEI' | 'ATA'; apiId: number; photo: string }[] = []

  for (const f of fixtures) {
    const fixtureData = cachedData[f.api_fixture_id]
    if (!fixtureData) continue

    for (const teamItem of fixtureData) {
      const apiTeamId = teamItem.team?.id
      const dbClubId = clubIdMap.get(apiTeamId) || f.home_club_id
      const players = teamItem.players || []

      for (let pIdx = 0; pIdx < players.length; pIdx++) {
        const apiPlayer = players[pIdx].player
        if (!playerMap.has(apiPlayer.id)) {
          const stats = players[pIdx].statistics?.[0]
          const pos = mapPosition(stats?.games?.position || 'M', pIdx)
          missingPlayers.push({
            clubId: dbClubId,
            name: apiPlayer.name,
            position: pos,
            apiId: apiPlayer.id,
            photo: apiPlayer.photo || `https://media.api-sports.io/football/players/${apiPlayer.id}.png`
          })
        }
      }
    }
  }

  if (missingPlayers.length > 0) {
    console.log(`➕ Inserindo ${missingPlayers.length} atletas que participaram da R27 mas não estavam no catálogo...`)
    for (const mp of missingPlayers) {
      const insRes = await client.query(`
        INSERT INTO real_players (club_id, name, position, api_football_id, is_active, photo_url)
        VALUES ($1, $2, $3, $4, true, $5)
        ON CONFLICT (api_football_id) DO UPDATE SET is_active = true
        RETURNING id, position, api_football_id;
      `, [mp.clubId, mp.name, mp.position, mp.apiId, mp.photo])

      if (insRes.rows.length > 0) {
        playerMap.set(insRes.rows[0].api_football_id, {
          id: insRes.rows[0].id,
          position: insRes.rows[0].position
        })
      }
    }
  }

  // 5. Build player_fixture_stats batch rows
  console.log('⚡ Calculando scouts e pontuações Cartola para todos os atletas da R27...')
  const statsRows: any[] = []

  for (const f of fixtures) {
    const fixtureData = cachedData[f.api_fixture_id]
    if (!fixtureData) continue

    for (const teamItem of fixtureData) {
      const apiTeamId = teamItem.team?.id
      const dbClubId = clubIdMap.get(apiTeamId)
      const isHome = dbClubId ? dbClubId === f.home_club_id : null
      const teamGoalsConceded = isHome === true ? (f.away_score ?? 0) : (f.home_score ?? 0)
      const players = teamItem.players || []

      for (let pIdx = 0; pIdx < players.length; pIdx++) {
        const pObj = players[pIdx]
        const apiPlayer = pObj.player
        const stats = pObj.statistics?.[0]
        if (!stats) continue

        const pData = playerMap.get(apiPlayer.id)
        if (!pData) continue

        const position = pData.position
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
        const shotsOnTarget = stats.shots?.on || 0
        const shotsTotal = stats.shots?.total || 0
        const shotsOffTarget = Math.max(0, shotsTotal - shotsOnTarget)
        const passesTotal = stats.passes?.total || 0
        const passesAcc = parseInt(stats.passes?.accuracy) || passesTotal
        const passesFailed = Math.max(0, passesTotal - (passesAcc > 100 ? Math.round((passesTotal * passesAcc) / 100) : passesAcc))
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

        statsRows.push([
          pData.id,
          f.id,
          minutes,
          tackles,
          foulsCommitted,
          yellowCards,
          redCards,
          cleanSheet,
          saves,
          penaltySaves,
          goalsConceded,
          penaltiesCommitted,
          foulsDrawn,
          passesFailed,
          assists,
          shotsOnTarget,
          shotsOffTarget,
          goals,
          offsides,
          penaltiesMissed,
          penaltiesWon,
          computedPoints,
        ])
      }
    }
  }

  // 6. Batch insert into player_fixture_stats (chunks of 50)
  console.log(`📥 Gravando ${statsRows.length} estatísticas reais no banco de dados em lote...`)
  const CHUNK_SIZE = 50

  for (let i = 0; i < statsRows.length; i += CHUNK_SIZE) {
    const chunk = statsRows.slice(i, i + CHUNK_SIZE)
    const valuePlaceholders: string[] = []
    const flatValues: any[] = []
    let pIdx = 1

    for (const r of chunk) {
      const rowPlaceholders: string[] = []
      for (const val of r) {
        rowPlaceholders.push(`$${pIdx++}`)
        flatValues.push(val)
      }
      valuePlaceholders.push(`(${rowPlaceholders.join(', ')})`)
    }

    const sql = `
      INSERT INTO player_fixture_stats (
        player_id, fixture_id, minutes, tackles, fouls_committed,
        yellow_cards, red_cards, clean_sheet, saves, penalty_saves, goals_conceded,
        penalties_committed, fouls_drawn, passes_failed, assists,
        shots_on_target, shots_off_target, goals, offsides, penalties_missed,
        penalties_won, computed_points
      ) VALUES ${valuePlaceholders.join(', ')}
      ON CONFLICT (player_id, fixture_id) DO UPDATE SET
        minutes = EXCLUDED.minutes,
        tackles = EXCLUDED.tackles,
        fouls_committed = EXCLUDED.fouls_committed,
        yellow_cards = EXCLUDED.yellow_cards,
        red_cards = EXCLUDED.red_cards,
        clean_sheet = EXCLUDED.clean_sheet,
        saves = EXCLUDED.saves,
        penalty_saves = EXCLUDED.penalty_saves,
        goals_conceded = EXCLUDED.goals_conceded,
        penalties_committed = EXCLUDED.penalties_committed,
        fouls_drawn = EXCLUDED.fouls_drawn,
        passes_failed = EXCLUDED.passes_failed,
        assists = EXCLUDED.assists,
        shots_on_target = EXCLUDED.shots_on_target,
        shots_off_target = EXCLUDED.shots_off_target,
        goals = EXCLUDED.goals,
        offsides = EXCLUDED.offsides,
        penalties_missed = EXCLUDED.penalties_missed,
        penalties_won = EXCLUDED.penalties_won,
        computed_points = EXCLUDED.computed_points;
    `
    await client.query(sql, flatValues)
  }

  console.log(`✅ ${statsRows.length} scouts reais gravados com sucesso!`)
}

// Standalone execution
if (require.main === module) {
  async function main() {
    const connectionString =
      process.env.DATABASE_URL ||
      'postgres://postgres.ilinrgasbkhvzujltbhp:pQXA9LMIwHZdqBfK@aws-0-ca-central-1.pooler.supabase.com:6543/postgres'
    const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } })
    try {
      await client.connect()
      const sRes = await client.query(`SELECT id FROM seasons WHERE year = 2026 LIMIT 1;`)
      await syncRound27RealStats(client, sRes.rows[0].id)
    } catch (err) {
      console.error(err)
    } finally {
      await client.end()
    }
  }
  main()
}
