import { Client } from 'pg'
import https from 'https'

const API_KEY = process.env.FOOTBALL_API_KEY
if (!API_KEY) throw new Error('FOOTBALL_API_KEY env var is required')

const LEAGUE_ID = 71    // Brasileirão Série A
const SEASON    = 2026

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function fetchApi(path: string): Promise<{ response?: unknown[]; errors?: Record<string, unknown>; results?: number }> {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'v3.football.api-sports.io',
      path,
      headers: { 'x-apisports-key': API_KEY },
    }
    https.get(options, (res) => {
      let body = ''
      res.on('data', (chunk) => (body += chunk))
      res.on('end', () => {
        try {
          const json = JSON.parse(body)
          if (json.errors && Object.keys(json.errors).length > 0) {
            console.warn(`⚠️  API warning for ${path}:`, json.errors)
          }
          resolve(json)
        } catch (e) {
          reject(new Error(`Failed to parse response: ${body.substring(0, 200)}`))
        }
      })
    }).on('error', reject)
  })
}

// API-Football position → formato interno
function mapPosition(apiPos: string, idx: number): 'GOL' | 'LAT' | 'ZAG' | 'MEI' | 'ATA' {
  switch (apiPos) {
    case 'Goalkeeper': return 'GOL'
    case 'Defender':   return idx % 2 === 0 ? 'ZAG' : 'LAT'
    case 'Midfielder': return 'MEI'
    case 'Attacker':   return 'ATA'
    default:           return 'MEI'
  }
}

// Status da API-Football → formato interno
function mapStatus(short: string): string {
  switch (short) {
    case 'FT': case 'AET': case 'PEN': return 'FT'
    case '1H': case '2H': case 'HT': case 'ET': case 'P':  return 'live'
    default:   return 'scheduled'
  }
}

async function seedFromApi() {
  const connectionString =
    process.env.DATABASE_URL ||
    'postgres://postgres.ilinrgasbkhvzujltbhp:pQXA9LMIwHZdqBfK@aws-0-ca-central-1.pooler.supabase.com:6543/postgres'

  console.log(`🌐 Conectando à API-Football (season=${SEASON}, league=${LEAGUE_ID})...`)
  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } })

  try {
    await client.connect()
    console.log('✅ Conectado ao Supabase!\n')

    // 1. Limpar catálogo antigo
    console.log('🧹 Limpando catálogo antigo...')
    await client.query(`TRUNCATE TABLE real_players, fixtures, real_clubs, seasons CASCADE;`)

    // 2. Buscar times do Brasileirão 2026
    console.log(`📡 Buscando times — league=${LEAGUE_ID} season=${SEASON}...`)
    const teamsRes = await fetchApi(`/teams?league=${LEAGUE_ID}&season=${SEASON}`)
    if (!teamsRes.response || teamsRes.response.length === 0) {
      throw new Error('Nenhum time retornado da API!')
    }

    const teamsData = teamsRes.response as Array<{
      team: { id: number; name: string; code?: string; logo: string }
    }>
    console.log(`🛡️  ${teamsData.length} times retornados\n`)

    // 3. Buscar rodada atual
    await sleep(6500)
    const standingsRes = await fetchApi(`/standings?league=${LEAGUE_ID}&season=${SEASON}`)
    const standingsData = (standingsRes.response as Array<{
      league: { round: string }
    }> | undefined)?.[0]
    const currentRoundStr = standingsData?.league?.round || 'Regular Season - 28'
    const currentRound = parseInt(currentRoundStr.replace(/[^0-9]/g, '')) || 28
    console.log(`📅 Rodada atual: ${currentRound}\n`)

    // 4. Criar Season 2026
    const seasonRes = await client.query(`
      INSERT INTO seasons (league_api_id, year, name, current_round, total_rounds)
      VALUES ($1, $2, $3, $4, 38)
      RETURNING id;
    `, [LEAGUE_ID, SEASON, `Brasileirão Série A ${SEASON}`, currentRound])
    const seasonId = seasonRes.rows[0].id
    console.log(`✅ Season ${SEASON} criada (rodada atual: ${currentRound})\n`)

    // 5. Inserir clubes
    const clubMap = new Map<number, string>() // apiTeamId → dbClubId
    for (const item of teamsData) {
      const team = item.team
      const shortName = (team.code || team.name.substring(0, 3)).toUpperCase()
      const clubRes = await client.query(
        `INSERT INTO real_clubs (season_id, name, short_name, logo_url, api_football_id)
         VALUES ($1, $2, $3, $4, $5) RETURNING id;`,
        [seasonId, team.name, shortName, team.logo, team.id]
      )
      clubMap.set(team.id, clubRes.rows[0].id)
    }
    console.log(`✅ ${teamsData.length} clubes cadastrados\n`)

    // 6. Buscar elencos ao vivo (squad) de cada clube
    console.log('🏃 Buscando elencos atuais de cada clube (6.5s por time)...')
    let totalPlayers = 0

    for (const item of teamsData) {
      const team = item.team
      const dbClubId = clubMap.get(team.id)!

      console.log(`  ➔ ${team.name}...`)
      await sleep(6500) // respeita rate-limit: 10 req/min no Pro

      const squadRes = await fetchApi(`/players/squads?team=${team.id}`)
      const squadData = (squadRes.response as Array<{
        players: Array<{ id: number; name: string; position: string; photo?: string }>
      }>)?.[0]

      if (!squadData?.players?.length) {
        console.log(`    ⚠️  Elenco vazio`)
        continue
      }

      const sqlRows: string[] = []
      const values: (string | number | boolean)[] = []
      let paramIdx = 1
      let defIdx = 0

      for (const p of squadData.players) {
        const pos = mapPosition(p.position, p.position === 'Defender' ? defIdx++ : 0)
        // avg_points e total_minutes serão atualizados pelo fetch-batch-rounds-stats depois
        const baseByPos: Record<string, number> = { GOL: 3.8, ZAG: 3.4, LAT: 3.4, MEI: 4.0, ATA: 4.2 }
        const avgPoints = parseFloat((baseByPos[pos] + Math.random() * 1.5).toFixed(2))
        const totalMinutes = Math.floor(Math.random() * 900) + 300

        sqlRows.push(
          `($${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, true, $${paramIdx++}, $${paramIdx++}, $${paramIdx++})`
        )
        values.push(
          dbClubId, p.name, pos, p.id, avgPoints, totalMinutes,
          p.photo || `https://media.api-sports.io/football/players/${p.id}.png`
        )
      }

      await client.query(`
        INSERT INTO real_players (club_id, name, position, api_football_id, is_active, avg_points, total_minutes, photo_url)
        VALUES ${sqlRows.join(',\n')}
        ON CONFLICT (api_football_id) DO UPDATE SET
          name = EXCLUDED.name,
          club_id = EXCLUDED.club_id,
          photo_url = EXCLUDED.photo_url;
      `, values)

      totalPlayers += squadData.players.length
      console.log(`    ✅ ${squadData.players.length} jogadores`)
    }

    console.log(`\n🏃 Total: ${totalPlayers} jogadores importados\n`)

    // 7. Buscar todas as 380 partidas da temporada
    console.log('📅 Buscando calendário completo (380 partidas)...')
    await sleep(6500)
    const fixturesRes = await fetchApi(`/fixtures?league=${LEAGUE_ID}&season=${SEASON}`)

    if (!fixturesRes.response || fixturesRes.response.length === 0) {
      throw new Error('Nenhuma partida retornada!')
    }

    const fixtures = fixturesRes.response as Array<{
      fixture: { id: number; date: string; status: { short: string } }
      league: { round: string }
      teams: { home: { id: number }; away: { id: number } }
      goals: { home: number | null; away: number | null }
    }>
    console.log(`📋 ${fixtures.length} partidas encontradas`)

    const fixSqlRows: string[] = []
    const fixValues: (string | number | boolean | null)[] = []
    let fIdx = 1
    let skipped = 0

    for (const m of fixtures) {
      const homeDbId = clubMap.get(m.teams.home.id)
      const awayDbId = clubMap.get(m.teams.away.id)
      if (!homeDbId || !awayDbId) { skipped++; continue }

      const round = parseInt(m.league.round.replace(/[^0-9]/g, '')) || 1
      const status = mapStatus(m.fixture.status.short)

      fixSqlRows.push(
        `($${fIdx++}, $${fIdx++}, $${fIdx++}, $${fIdx++}, $${fIdx++}, $${fIdx++}, $${fIdx++}, $${fIdx++}, $${fIdx++})`
      )
      fixValues.push(
        seasonId, round, homeDbId, awayDbId, m.fixture.date,
        status, m.goals.home, m.goals.away, m.fixture.id
      )
    }

    if (fixSqlRows.length > 0) {
      await client.query(`
        INSERT INTO fixtures (season_id, round, home_club_id, away_club_id, kickoff_at, status, home_score, away_score, api_fixture_id)
        VALUES ${fixSqlRows.join(',\n')}
        ON CONFLICT (api_fixture_id) DO NOTHING;
      `, fixValues)
    }

    console.log(`✅ ${fixSqlRows.length} partidas importadas (${skipped} ignoradas)`)
    console.log('\n🎉 SEED CONCLUÍDO — DADOS REAIS DO BRASILEIRÃO SÉRIE A 2026!')
    console.log(`   Times     : ${teamsData.length}`)
    console.log(`   Jogadores : ${totalPlayers}`)
    console.log(`   Partidas  : ${fixSqlRows.length}`)
    console.log(`   Rodada    : ${currentRound}/38`)
    console.log('\n⚡ Próximo passo: rode o script de stats para popular as pontuações:')
    console.log(`   npx tsx scripts/fetch-batch-rounds-stats.ts 1 ${currentRound}`)

  } catch (err) {
    console.error('❌ Erro durante o seed:', err)
    process.exit(1)
  } finally {
    await client.end()
  }
}

seedFromApi()
