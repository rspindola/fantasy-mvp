import { Client } from 'pg'
import https from 'https'
import fs from 'fs'
import path from 'path'
import { calculatePlayerScoring } from '../src/lib/scoring/scoring-engine'

const API_KEY = process.env.FOOTBALL_API_KEY
if (!API_KEY) throw new Error('FOOTBALL_API_KEY env var is required')
const CACHE_FILE = path.join(__dirname, 'data', 'rounds_stats_cache.json')
const R27_CACHE_FILE = path.join(__dirname, 'data', 'round27_stats_cache.json')

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function fetchApi(apiPath: string): Promise<{ response?: any; errors?: Record<string, any>; requests?: any }> {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'v3.football.api-sports.io',
      path: apiPath,
      headers: {
        'x-apisports-key': API_KEY,
      },
    }

    https
      .get(options, (res) => {
        let body = ''
        res.on('data', (chunk) => (body += chunk))
        res.on('end', () => {
          try {
            const json = JSON.parse(body)
            resolve(json)
          } catch (e) {
            reject(new Error(`Failed to parse API response: ${body.substring(0, 100)}`))
          }
        })
      })
      .on('error', reject)
  })
}

function loadCache(): Record<string, any[]> {
  const cache: Record<string, any[]> = {}

  // Pre-seed with R27 cache if available
  if (fs.existsSync(R27_CACHE_FILE)) {
    try {
      const r27 = JSON.parse(fs.readFileSync(R27_CACHE_FILE, 'utf-8'))
      Object.assign(cache, r27)
    } catch (e) {
      console.warn('⚠️ Could not load R27 cache:', e)
    }
  }

  // Overlay rounds_stats_cache if exists
  if (fs.existsSync(CACHE_FILE)) {
    try {
      const existing = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'))
      Object.assign(cache, existing)
    } catch (e) {
      console.warn('⚠️ Could not load existing rounds_stats_cache:', e)
    }
  }

  return cache
}

function saveCache(cache: Record<string, any[]>) {
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2), 'utf-8')
}

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

export async function fetchAndPopulateRounds(startRound: number, endRound: number) {
  const minRound = Math.min(startRound, endRound)
  const maxRound = Math.max(startRound, endRound)

  console.log(`\n======================================================`)
  console.log(`🚀 Iniciando sincronização das Rodadas ${maxRound} até ${minRound}`)
  console.log(`======================================================\n`)

  const connectionString =
    process.env.DATABASE_URL ||
    'postgres://postgres.ilinrgasbkhvzujltbhp:pQXA9LMIwHZdqBfK@aws-0-ca-central-1.pooler.supabase.com:6543/postgres'
  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } })

  await client.connect()

  try {
    // 1. Check API quota status
    console.log('📡 Verificando cota da API-Football...')
    const statusRes = await fetchApi('/status')
    const currentUsage = statusRes.response?.requests?.current ?? '?'
    const limitDay = statusRes.response?.requests?.limit_day ?? 100
    console.log(`📊 Cota utilizada hoje: ${currentUsage}/${limitDay}`)

    // 2. Get 2026 season ID
    const sRes = await client.query(`SELECT id FROM seasons WHERE year = 2026 LIMIT 1;`)
    if (sRes.rows.length === 0) {
      throw new Error('Temporada 2026 não encontrada!')
    }
    const seasonId = sRes.rows[0].id

    // 3. Load fixtures for target rounds, ordered from newest to oldest
    const fixturesRes = await client.query(
      `
      SELECT f.id, f.round, f.api_fixture_id, f.home_club_id, f.away_club_id,
             hc.name as home, ac.name as away
      FROM fixtures f
      JOIN real_clubs hc ON hc.id = f.home_club_id
      JOIN real_clubs ac ON ac.id = f.away_club_id
      WHERE f.season_id = $1 AND f.round BETWEEN $2 AND $3
      ORDER BY f.round DESC, f.kickoff_at ASC;
    `,
      [seasonId, minRound, maxRound]
    )

    const fixtures = fixturesRes.rows
    console.log(`📋 Total de ${fixtures.length} partidas encontradas para as rodadas ${maxRound} a ${minRound}.`)

    // 4. Load club map
    const clubsRes = await client.query(`SELECT id, api_football_id FROM real_clubs WHERE season_id = $1;`, [seasonId])
    const clubIdMap = new Map<number, string>()
    clubsRes.rows.forEach((r) => clubIdMap.set(r.api_football_id, r.id))

    // 5. Pre-load all real_players into memory
    const allPlayersRes = await client.query(`SELECT id, position, api_football_id FROM real_players;`)
    const playerMap = new Map<number, { id: string; position: 'GOL' | 'LAT' | 'ZAG' | 'MEI' | 'ATA' }>()
    allPlayersRes.rows.forEach((r) => {
      if (r.api_football_id) {
        playerMap.set(r.api_football_id, { id: r.id, position: r.position })
      }
    })

    // 6. Load local cache
    const cache = loadCache()
    console.log(`💾 Cache local carregado com ${Object.keys(cache).length} partidas previamente salvas.`)

    let apiCallsCount = 0

    // 7. Iterate fixtures and fetch missing ones
    for (let i = 0; i < fixtures.length; i++) {
      const f = fixtures[i]
      const fixtureApiId = String(f.api_fixture_id)

      console.log(
        `\n[${i + 1}/${fixtures.length}] Rodada ${f.round}: ${f.home} vs ${f.away} (API ID: ${fixtureApiId})`
      )

      let fixtureData = cache[fixtureApiId]

      if (!fixtureData) {
        console.log(` ➔ Baixando dados da API-Football...`)
        // Delay 6.5s to respect rate-limit (10 req/min)
        await sleep(6500)

        const apiRes = await fetchApi(`/fixtures/players?fixture=${fixtureApiId}`)

        if (apiRes.errors && Object.keys(apiRes.errors).length > 0) {
          console.error(` ❌ Erro da API-Football:`, apiRes.errors)
          if (JSON.stringify(apiRes.errors).includes('requests') || JSON.stringify(apiRes.errors).includes('limit')) {
            console.error('⛔ Cota diária atingida! Parando o script com segurança.')
            break
          }
        }

        if (!apiRes.response || apiRes.response.length === 0) {
          console.warn(` ⚠️ Nenhum scout retornado para fixture ${fixtureApiId}`)
          continue
        }

        fixtureData = apiRes.response
        cache[fixtureApiId] = fixtureData
        saveCache(cache)
        apiCallsCount++
        console.log(` ➔ Sucesso! Partida salva em cache. (Chamadas nesta sessão: ${apiCallsCount})`)
      } else {
        console.log(` ➔ Já em cache local! Ignorando chamada de API.`)
      }

      // 8. Process players from fixtureData
      const missingPlayers: {
        clubId: string
        name: string
        position: 'GOL' | 'LAT' | 'ZAG' | 'MEI' | 'ATA'
        apiId: number
        photo: string
      }[] = []

      for (const teamItem of fixtureData) {
        const apiTeamId = teamItem.team?.id
        const dbClubId = clubIdMap.get(apiTeamId) || f.home_club_id
        const players = teamItem.players || []

        for (let pIdx = 0; pIdx < players.length; pIdx++) {
          const apiPlayer = players[pIdx].player
          if (!apiPlayer?.id) continue

          if (!playerMap.has(apiPlayer.id)) {
            const stats = players[pIdx].statistics?.[0]
            const pos = mapPosition(stats?.games?.position || 'M', pIdx)
            missingPlayers.push({
              clubId: dbClubId,
              name: apiPlayer.name,
              position: pos,
              apiId: apiPlayer.id,
              photo: apiPlayer.photo || `https://media.api-sports.io/football/players/${apiPlayer.id}.png`,
            })
          }
        }
      }

      // Insert any newly discovered players
      if (missingPlayers.length > 0) {
        for (const mp of missingPlayers) {
          const insRes = await client.query(
            `
            INSERT INTO real_players (club_id, name, position, api_football_id, is_active, photo_url)
            VALUES ($1, $2, $3, $4, true, $5)
            ON CONFLICT (api_football_id) DO UPDATE SET is_active = true
            RETURNING id, position, api_football_id;
          `,
            [mp.clubId, mp.name, mp.position, mp.apiId, mp.photo]
          )

          if (insRes.rows.length > 0) {
            playerMap.set(insRes.rows[0].api_football_id, {
              id: insRes.rows[0].id,
              position: insRes.rows[0].position,
            })
          }
        }
        console.log(`   ➕ ${missingPlayers.length} novos atletas cadastrados no banco.`)
      }

      // 9. Calculate Cartola scouts & prepare rows
      const statsRows: any[] = []

      for (const teamItem of fixtureData) {
        const players = teamItem.players || []

        for (let pIdx = 0; pIdx < players.length; pIdx++) {
          const pObj = players[pIdx]
          const apiPlayer = pObj.player
          const stats = pObj.statistics?.[0]
          if (!stats || !apiPlayer?.id) continue

          const pData = playerMap.get(apiPlayer.id)
          if (!pData) continue

          const position = pData.position
          const minutes = stats.games?.minutes || 0
          const goals = stats.goals?.total || 0
          const assists = stats.goals?.assists || 0
          const saves = stats.goals?.saves || 0
          const goalsConceded = stats.goals?.conceded || 0
          const cleanSheet =
            (position === 'GOL' || position === 'ZAG' || position === 'LAT') && minutes >= 45 && goalsConceded === 0
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
            passesCompleted,
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

      // 10. Upsert into player_fixture_stats
      if (statsRows.length > 0) {
        const CHUNK_SIZE = 50
        for (let c = 0; c < statsRows.length; c += CHUNK_SIZE) {
          const chunk = statsRows.slice(c, c + CHUNK_SIZE)
          const valuePlaceholders: string[] = []
          const flatValues: any[] = []
          let pIndex = 1

          for (const row of chunk) {
            const rowPlaceholders: string[] = []
            for (const val of row) {
              rowPlaceholders.push(`$${pIndex++}`)
              flatValues.push(val)
            }
            valuePlaceholders.push(`(${rowPlaceholders.join(', ')})`)
          }

          const sql = `
            INSERT INTO player_fixture_stats (
              player_id, fixture_id, minutes, tackles, fouls_committed,
              yellow_cards, red_cards, clean_sheet, saves, penalty_saves, goals_conceded,
              penalties_committed, fouls_drawn, passes_completed, passes_failed, assists,
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
              passes_completed = EXCLUDED.passes_completed,
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
        console.log(`   ✅ ${statsRows.length} scouts gravados no banco para esta partida.`)
      }
    }

    // 11. Recalculate average points and total minutes for all real_players
    console.log('\n🔄 Recalculando médias e minutos de todos os atletas...')
    await client.query(`
      UPDATE real_players rp
      SET
        avg_points = sub.avg_pts,
        total_minutes = sub.total_mins
      FROM (
        SELECT
          player_id,
          ROUND(AVG(computed_points)::numeric, 2) as avg_pts,
          SUM(minutes) as total_mins
        FROM player_fixture_stats
        GROUP BY player_id
      ) sub
      WHERE rp.id = sub.player_id;
    `)
    console.log('✅ Médias e minutos atualizados com sucesso no elenco!')

    // 12. Final status check
    const finalStatus = await fetchApi('/status')
    const finalUsage = finalStatus.response?.requests?.current ?? '?'
    console.log(`\n🎉 Sincronização concluída! Cota final da API hoje: ${finalUsage}/100`)
  } finally {
    await client.end()
  }
}

// CLI Argument parsing
if (require.main === module) {
  const args = process.argv.slice(2)
  let start = 1
  let end = 28

  for (const arg of args) {
    if (arg.startsWith('--start=')) start = parseInt(arg.split('=')[1])
    if (arg.startsWith('--end=')) end = parseInt(arg.split('=')[1])
  }

  fetchAndPopulateRounds(start, end).catch((err) => {
    console.error('❌ Erro na execução:', err)
    process.exit(1)
  })
}
