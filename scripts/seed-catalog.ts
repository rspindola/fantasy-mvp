import { Client } from 'pg'
import { REAL_BR_CLUBS } from './data/real-squads'

async function seedCatalog() {
  const connectionString = process.env.DATABASE_URL || 'postgres://postgres.ilinrgasbkhvzujltbhp:pQXA9LMIwHZdqBfK@aws-0-ca-central-1.pooler.supabase.com:6543/postgres'

  console.log('⚡ Iniciando Seed com Elencos Reais do Brasileirão 2026...')
  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } })

  try {
    await client.connect()
    console.log('✅ Conectado ao Supabase!')

    // Limpar dados de catálogo anteriores se existirem (para atualizar com elencos corretos)
    console.log('🧹 Limpando jogadores e partidas anteriores...')
    await client.query(`TRUNCATE TABLE real_players, fixtures, real_clubs, seasons CASCADE;`)

    // 1. Season
    const seasonRes = await client.query(`
      INSERT INTO seasons (league_api_id, year, name, current_round, total_rounds)
      VALUES (71, 2026, 'Brasileirão Série A 2026', 28, 38)
      RETURNING id;
    `)
    const seasonId = seasonRes.rows[0].id

    // 2. Clubes
    const clubMap = new Map<string, string>()
    for (const club of REAL_BR_CLUBS) {
      const res = await client.query(`
        INSERT INTO real_clubs (season_id, name, short_name, logo_url, api_football_id)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, short_name;
      `, [seasonId, club.name, club.shortName, club.logoUrl, club.apiId])
      clubMap.set(club.shortName, res.rows[0].id)
    }
    console.log(`🛡️  ${REAL_BR_CLUBS.length} clubes reais cadastrados!`)

    // 3. Jogadores Reais em Batch
    const playerValues: (string | number | boolean)[] = []
    const playerSqlRows: string[] = []
    let apiPlayerId = 10001
    let paramIdx = 1
    let totalPlayersCount = 0

    for (const clubSeed of REAL_BR_CLUBS) {
      const clubId = clubMap.get(clubSeed.shortName)!

      for (const p of clubSeed.squad) {
        const pid = apiPlayerId++
        totalPlayersCount++

        playerSqlRows.push(`($${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, true, $${paramIdx++}, $${paramIdx++}, $${paramIdx++})`)
        playerValues.push(
          clubId,
          p.name,
          p.position,
          pid,
          p.avgPoints,
          p.totalMinutes,
          `https://media.api-sports.io/football/players/${pid}.png`
        )
      }
    }

    const batchPlayerSql = `
      INSERT INTO real_players (club_id, name, position, api_football_id, is_active, avg_points, total_minutes, photo_url)
      VALUES ${playerSqlRows.join(',\n')};
    `
    await client.query(batchPlayerSql, playerValues)
    console.log(`🏃 ${totalPlayersCount} Jogadores reais inseridos com sucesso!`)

    // 4. Fixtures Batch (38 Rodadas)
    const clubIds = Array.from(clubMap.values())
    let fixtureApiId = 50001
    const fixtureSqlRows: string[] = []
    const fixtureValues: (string | number | boolean | null)[] = []
    let fParamIdx = 1

    const n = clubIds.length
    const now = new Date()

    for (let round = 1; round <= 38; round++) {
      const isReturn = round > 19
      const roundOffset = (round - 1) % (n - 1)
      const daysDiff = (round - 28) * 7
      const kickoffAt = new Date(now.getTime() + daysDiff * 24 * 60 * 60 * 1000)

      for (let i = 0; i < n / 2; i++) {
        const homeIdx = (roundOffset + i) % (n - 1)
        let awayIdx = (n - 1 - i + roundOffset) % (n - 1)
        if (i === 0) awayIdx = n - 1

        const home = isReturn ? clubIds[awayIdx] : clubIds[homeIdx]
        const away = isReturn ? clubIds[homeIdx] : clubIds[awayIdx]
        const fid = fixtureApiId++
        const isFT = round <= 27
        const status = isFT ? 'FT' : 'scheduled'
        const homeScore = isFT ? Math.floor(Math.random() * 4) : null
        const awayScore = isFT ? Math.floor(Math.random() * 3) : null

        fixtureSqlRows.push(`($${fParamIdx++}, $${fParamIdx++}, $${fParamIdx++}, $${fParamIdx++}, $${fParamIdx++}, $${fParamIdx++}, $${fParamIdx++}, $${fParamIdx++}, $${fParamIdx++})`)
        fixtureValues.push(seasonId, round, home, away, kickoffAt.toISOString(), status, homeScore, awayScore, fid)
      }
    }

    const batchFixtureSql = `
      INSERT INTO fixtures (season_id, round, home_club_id, away_club_id, kickoff_at, status, home_score, away_score, api_fixture_id)
      VALUES ${fixtureSqlRows.join(',\n')};
    `
    await client.query(batchFixtureSql, fixtureValues)
    console.log(`📅 380 Partidas das 38 rodadas salvas com sucesso!`)

    console.log('🎉 Seed completo de Elencos Reais finalizado com sucesso!')

  } catch (err) {
    console.error('❌ Erro no seed:', err)
  } finally {
    await client.end()
  }
}

seedCatalog()
