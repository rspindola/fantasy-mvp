import { Client } from 'pg'
import fs from 'fs'
import path from 'path'
import { calculatePlayerScoring, type PlayerScouts } from '../src/lib/scoring/scoring-engine'

async function backfillPasses() {
  console.log('🚀 Iniciando backfill de Passes Completos (PC: +0.1)...')

  const CACHE_FILE = path.join(__dirname, 'data', 'rounds_stats_cache.json')
  if (!fs.existsSync(CACHE_FILE)) {
    throw new Error('Arquivo de cache rounds_stats_cache.json não encontrado!')
  }

  const cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'))
  console.log(`💾 Cache local carregado com ${Object.keys(cache).length} partidas.`)

  const connectionString =
    process.env.DATABASE_URL ||
    'postgres://postgres.ilinrgasbkhvzujltbhp:pQXA9LMIwHZdqBfK@aws-0-ca-central-1.pooler.supabase.com:6543/postgres'

  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  })

  await client.connect()

  try {
    // 1. Map fixtures by api_fixture_id
    const fRes = await client.query('SELECT id, api_fixture_id FROM fixtures WHERE api_fixture_id IS NOT NULL;')
    const fixtureMap = new Map<number, string>()
    for (const row of fRes.rows) {
      fixtureMap.set(Number(row.api_fixture_id), row.id)
    }

    // 2. Map players by api_football_id
    const pRes = await client.query('SELECT id, api_football_id, position, name FROM real_players WHERE api_football_id IS NOT NULL;')
    const playerMap = new Map<number, { id: string; position: any; name: string }>()
    for (const row of pRes.rows) {
      playerMap.set(Number(row.api_football_id), {
        id: row.id,
        position: row.position,
        name: row.name,
      })
    }

    // 3. Load all existing rows in player_fixture_stats to quickly update them
    console.log('📊 Buscando registros de player_fixture_stats no banco...')
    const statsRes = await client.query('SELECT * FROM player_fixture_stats;')
    console.log(`📋 Total de ${statsRes.rows.length} scouts existentes no banco.`)

    // Key: `${player_id}_${fixture_id}` -> stat row
    const existingStats = new Map<string, any>()
    for (const row of statsRes.rows) {
      existingStats.set(`${row.player_id}_${row.fixture_id}`, row)
    }

    // 4. Calculate passes completed from cache and prepare updates
    let updatedCount = 0

    // Batch update via temporary table or chunked queries
    // Collect all update tuples
    const updates: {
      id: string
      passesCompleted: number
      passesFailed: number
      newPoints: number
    }[] = []

    for (const [apiFixIdStr, teams] of Object.entries(cache)) {
      const apiFixId = Number(apiFixIdStr)
      const fixtureDbId = fixtureMap.get(apiFixId)
      if (!fixtureDbId) continue

      for (const t of teams as any[]) {
        for (const p of t.players || []) {
          const apiPlayerId = p.player?.id
          if (!apiPlayerId) continue

          const pInfo = playerMap.get(apiPlayerId)
          if (!pInfo) continue

          const statRow = existingStats.get(`${pInfo.id}_${fixtureDbId}`)
          if (!statRow) continue

          const stats = p.statistics?.[0] || {}
          const passesTotal = stats.passes?.total || 0
          const passesAcc = parseInt(stats.passes?.accuracy) || 0
          const passesCompleted = Math.min(
            passesTotal,
            passesAcc > 100 ? Math.round((passesTotal * passesAcc) / 100) : passesAcc
          )
          const passesFailed = Math.max(0, passesTotal - passesCompleted)

          const scouts: PlayerScouts = {
            position: pInfo.position,
            minutes: statRow.minutes ?? 0,
            goals: statRow.goals ?? 0,
            assists: statRow.assists ?? 0,
            shotsOnWoodwork: statRow.shots_on_woodwork ?? 0,
            shotsOnTarget: statRow.shots_on_target ?? 0,
            shotsOffTarget: statRow.shots_off_target ?? 0,
            foulsDrawn: statRow.fouls_drawn ?? 0,
            penaltiesWon: statRow.penalties_won ?? 0,
            passesCompleted,
            passesFailed,
            offsides: statRow.offsides ?? 0,
            penaltiesMissed: statRow.penalties_missed ?? 0,
            cleanSheet: statRow.clean_sheet ?? false,
            saves: statRow.saves ?? 0,
            penaltySaves: statRow.penalty_saves ?? 0,
            tackles: statRow.tackles ?? 0,
            foulsCommitted: statRow.fouls_committed ?? 0,
            ownGoals: statRow.own_goals ?? 0,
            yellowCards: statRow.yellow_cards ?? 0,
            redCards: statRow.red_cards ?? 0,
            goalsConceded: statRow.goals_conceded ?? 0,
            penaltiesCommitted: statRow.penalties_committed ?? 0,
          }

          const newPoints = calculatePlayerScoring(scouts)

          updates.push({
            id: statRow.id,
            passesCompleted,
            passesFailed,
            newPoints,
          })
        }
      }
    }

    console.log(`⚙️ Executando atualização em lote de ${updates.length} partidas...`)

    // Update in chunks using CASE WHEN or VALUES
    const CHUNK_SIZE = 500
    for (let i = 0; i < updates.length; i += CHUNK_SIZE) {
      const chunk = updates.slice(i, i + CHUNK_SIZE)
      const valueLines = chunk.map(
        (u) => `('${u.id}'::uuid, ${u.passesCompleted}, ${u.passesFailed}, ${u.newPoints})`
      )

      await client.query(`
        UPDATE player_fixture_stats AS pfs
        SET
          passes_completed = v.passes_completed,
          passes_failed = v.passes_failed,
          computed_points = v.computed_points
        FROM (VALUES ${valueLines.join(', ')}) AS v(id, passes_completed, passes_failed, computed_points)
        WHERE pfs.id = v.id;
      `)

      updatedCount += chunk.length
      if (updatedCount % 2500 === 0 || updatedCount === updates.length) {
        console.log(`   Progresso: ${updatedCount} / ${updates.length} scouts atualizados.`)
      }
    }

    // 5. Recalculate average points and total minutes for all real_players
    console.log('\n🔄 Recalculando médias gerais de todos os atletas...')
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
    console.log('✅ Médias e minutagens atualizadas com sucesso!')

    // 6. Verify sample player (S. Sosa)
    const sosaCheck = await client.query(`
      SELECT rp.name, rp.position, rp.avg_points, rp.total_minutes,
             SUM(pfs.passes_completed) as total_pc, SUM(pfs.passes_failed) as total_pe
      FROM real_players rp
      JOIN player_fixture_stats pfs ON pfs.player_id = rp.id
      WHERE rp.api_football_id = 6006
      GROUP BY rp.id;
    `)
    console.log('\n🎯 Verificação S. Sosa (Vasco):', sosaCheck.rows[0])

    console.log('\n🎉 Backfill de Passes Completos finalizado com sucesso!')
  } finally {
    await client.end()
  }
}

backfillPasses().catch((err) => {
  console.error('❌ Erro no backfill:', err)
  process.exit(1)
})
