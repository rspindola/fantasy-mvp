import { Client } from 'pg'
import fs from 'fs'
import path from 'path'
import { calculatePlayerScoring } from '../src/lib/scoring/scoring-engine'

async function run() {
  const connectionString =
    process.env.DATABASE_URL ||
    'postgres://postgres.ilinrgasbkhvzujltbhp:pQXA9LMIwHZdqBfK@aws-0-ca-central-1.pooler.supabase.com:6543/postgres'

  console.log('🔌 Conectando ao banco de dados...')
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  })

  await client.connect()
  console.log('✅ Conectado com sucesso!')

  try {
    // 1. Load cache if available
    const CACHE_FILE = path.join(__dirname, 'data', 'rounds_stats_cache.json')
    let cache: Record<string, any[]> = {}
    if (fs.existsSync(CACHE_FILE)) {
      cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'))
      console.log(`💾 Cache carregado com ${Object.keys(cache).length} partidas.`)
    }

    // 2. Load clubs map (api_football_id -> real_clubs.id)
    const clubsRes = await client.query('SELECT id, api_football_id FROM real_clubs;')
    const clubApiToDb = new Map<number, string>()
    clubsRes.rows.forEach((r) => clubApiToDb.set(r.api_football_id, r.id))

    // 3. Build player team mapping from cache if possible
    // player_api_id + fixture_api_id -> api_team_id
    const playerFixtureTeamMap = new Map<string, number>()
    for (const [fixtureApiId, teams] of Object.entries(cache)) {
      for (const t of teams) {
        const teamId = t.team?.id
        for (const p of t.players || []) {
          if (p.player?.id) {
            playerFixtureTeamMap.set(`${p.player.id}_${fixtureApiId}`, teamId)
          }
        }
      }
    }

    // 4. Fetch all player_fixture_stats joined with fixtures and real_players
    console.log('📥 Carregando todos os player_fixture_stats do banco...')
    const query = `
      SELECT 
        pfs.*,
        p.position,
        p.club_id as player_club_id,
        p.api_football_id as player_api_id,
        f.home_club_id,
        f.away_club_id,
        f.home_score,
        f.away_score,
        f.api_fixture_id
      FROM player_fixture_stats pfs
      JOIN fixtures f ON f.id = pfs.fixture_id
      JOIN real_players p ON p.id = pfs.player_id
      WHERE f.status = 'FT';
    `
    const statsRes = await client.query(query)
    console.log(`📊 Total de registros encontrados: ${statsRes.rows.length}`)

    let changedToFalse = 0
    let changedToTrue = 0
    let scoreChanged = 0
    const toUpdate: {
      id: string
      clean_sheet: boolean
      computed_points: number
      old_clean_sheet: boolean
      old_points: number
    }[] = []

    for (const row of statsRes.rows) {
      const position = row.position
      const minutes = row.minutes || 0

      // Determine whether player was home or away
      let isHome: boolean | null = null
      const cachedTeamApiId = playerFixtureTeamMap.get(`${row.player_api_id}_${row.api_fixture_id}`)
      if (cachedTeamApiId) {
        const dbClubId = clubApiToDb.get(cachedTeamApiId)
        if (dbClubId === row.home_club_id) isHome = true
        else if (dbClubId === row.away_club_id) isHome = false
      }

      if (isHome === null) {
        if (row.player_club_id === row.home_club_id) isHome = true
        else if (row.player_club_id === row.away_club_id) isHome = false
      }

      let teamGoalsConceded = 0
      if (isHome === true) {
        teamGoalsConceded = row.away_score ?? 0
      } else if (isHome === false) {
        teamGoalsConceded = row.home_score ?? 0
      } else {
        // Fallback: if club cannot be matched, assume worst case or check goals_conceded
        teamGoalsConceded = Math.max(row.home_score ?? 0, row.away_score ?? 0)
      }

      const isDefensivePos = position === 'GOL' || position === 'ZAG' || position === 'LAT'
      const correctCleanSheet =
        isDefensivePos &&
        minutes >= 45 &&
        teamGoalsConceded === 0 &&
        (position !== 'GOL' || (row.goals_conceded || 0) === 0)

      const oldCleanSheet = Boolean(row.clean_sheet)
      const oldPoints = Number(row.computed_points)

      // Recalculate points with correct clean sheet
      const newPoints = calculatePlayerScoring({
        position: row.position,
        minutes: row.minutes,
        goals: row.goals,
        assists: row.assists,
        shotsOnWoodwork: row.shots_on_woodwork,
        shotsOnTarget: row.shots_on_target,
        shotsOffTarget: row.shots_off_target,
        foulsDrawn: row.fouls_drawn,
        penaltiesWon: row.penalties_won,
        passesCompleted: row.passes_completed,
        passesFailed: row.passes_failed,
        offsides: row.offsides,
        penaltiesMissed: row.penalties_missed,
        cleanSheet: correctCleanSheet,
        saves: row.saves,
        penaltySaves: row.penalty_saves,
        tackles: row.tackles,
        foulsCommitted: row.fouls_committed,
        ownGoals: row.own_goals,
        yellowCards: row.yellow_cards,
        redCards: row.red_cards,
        goalsConceded: row.goals_conceded,
        penaltiesCommitted: row.penalties_committed,
      })

      if (oldCleanSheet !== correctCleanSheet || Math.abs(oldPoints - newPoints) > 0.001) {
        if (oldCleanSheet && !correctCleanSheet) changedToFalse++
        if (!oldCleanSheet && correctCleanSheet) changedToTrue++
        if (Math.abs(oldPoints - newPoints) > 0.001) scoreChanged++

        toUpdate.push({
          id: row.id,
          clean_sheet: correctCleanSheet,
          computed_points: newPoints,
          old_clean_sheet: oldCleanSheet,
          old_points: oldPoints,
        })
      }
    }

    console.log('\n--- Diagnóstico da Correção ---')
    console.log(`❌ Clean Sheet corrigido de TRUE para FALSE: ${changedToFalse}`)
    console.log(`✅ Clean Sheet corrigido de FALSE para TRUE: ${changedToTrue}`)
    console.log(`📈 Registros com pontuação alterada: ${scoreChanged}`)

    // Check Cuiabano specifically
    const cuiabanoUpdates = toUpdate.filter((u) => {
      const original = statsRes.rows.find((r) => r.id === u.id)
      return original && original.player_api_id === 184564 // Cuiabano API ID or name
    })
    console.log(`\nExemplo Cuiabano: encontrados ${cuiabanoUpdates.length} registros a atualizar.`)

    // Apply updates in batches
    console.log(`\n💾 Aplicando ${toUpdate.length} atualizações no banco de dados...`)
    const BATCH_SIZE = 500
    for (let i = 0; i < toUpdate.length; i += BATCH_SIZE) {
      const batch = toUpdate.slice(i, i + BATCH_SIZE)
      const values: any[] = []
      const clauses: string[] = []

      batch.forEach((item, idx) => {
        const idParam = `$${idx * 3 + 1}`
        const csParam = `$${idx * 3 + 2}`
        const ptsParam = `$${idx * 3 + 3}`
        clauses.push(`(${idParam}::uuid, ${csParam}::boolean, ${ptsParam}::numeric)`)
        values.push(item.id, item.clean_sheet, item.computed_points)
      })

      const updateQuery = `
        UPDATE player_fixture_stats AS pfs
        SET
          clean_sheet = v.clean_sheet,
          computed_points = v.computed_points
        FROM (VALUES ${clauses.join(', ')}) AS v(id, clean_sheet, computed_points)
        WHERE pfs.id = v.id;
      `
      await client.query(updateQuery, values)
      process.stdout.write(`\rProcessados ${Math.min(i + BATCH_SIZE, toUpdate.length)}/${toUpdate.length}...`)
    }
    console.log('\n✅ player_fixture_stats atualizado com sucesso!')

    // Recalculate avg_points in real_players
    console.log('\n🔄 Recalculando avg_points e total_minutes em real_players...')
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
    console.log('✅ Médias dos atletas atualizadas com sucesso!')
  } finally {
    await client.end()
  }
}

run().catch((err) => {
  console.error('Erro na execução:', err)
  process.exit(1)
})
