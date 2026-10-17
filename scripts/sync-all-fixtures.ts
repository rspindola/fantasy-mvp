import { createClient } from '@supabase/supabase-js'
import https from 'https'

const API_HOST = 'v3.football.api-sports.io'
const LEAGUE_ID = 71
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
            resolve(JSON.parse(body))
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

async function syncAllFixtures() {
  const apiKey = process.env.FOOTBALL_API_KEY
  if (!apiKey) {
    console.error('❌ FOOTBALL_API_KEY not found in environment.')
    process.exit(1)
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Supabase credentials not found in environment.')
    process.exit(1)
  }

  const supabase = createClient(supabaseUrl, supabaseKey)

  console.log('📡 Fetching all 380 fixtures for season 2026 from API-Football...')
  const apiRes = await fetchApiFootball(`/fixtures?league=${LEAGUE_ID}&season=${SEASON_YEAR}`, apiKey)

  if (!apiRes?.response || apiRes.response.length === 0) {
    console.error('❌ No fixtures returned from API-Football.')
    process.exit(1)
  }

  const fixtures = apiRes.response as any[]
  console.log(`✅ Received ${fixtures.length} fixtures from API-Football.`)

  // Pre-load all db fixtures
  const { data: dbFixtures, error: dbErr } = await supabase
    .from('fixtures')
    .select('id, api_fixture_id, kickoff_at, status, round')

  if (dbErr || !dbFixtures) {
    console.error('❌ Error fetching fixtures from Supabase:', dbErr)
    process.exit(1)
  }

  const dbMap = new Map<number, any>()
  dbFixtures.forEach((f) => {
    if (f.api_fixture_id) {
      dbMap.set(Number(f.api_fixture_id), f)
    }
  })

  console.log(`📋 Found ${dbMap.size} matching fixtures in Supabase.`)

  let updatedCount = 0
  let skippedCount = 0

  for (const apiFix of fixtures) {
    const apiId = Number(apiFix.fixture.id)
    const dbFix = dbMap.get(apiId)
    if (!dbFix) {
      skippedCount++
      continue
    }

    const kickoffAt = apiFix.fixture.date
    const status = mapApiFixtureStatus(apiFix.fixture.status.short)
    const homeScore = status === 'scheduled' ? null : apiFix.goals.home
    const awayScore = status === 'scheduled' ? null : apiFix.goals.away

    const { error: updErr } = await supabase
      .from('fixtures')
      .update({
        kickoff_at: kickoffAt,
        status,
        home_score: homeScore,
        away_score: awayScore,
      })
      .eq('id', dbFix.id)

    if (updErr) {
      console.error(`⚠️ Failed to update fixture ${dbFix.id} (API ${apiId}):`, updErr)
    } else {
      updatedCount++
    }
  }

  console.log(`\n🎉 Sincronização de calendário concluída com sucesso!`)
  console.log(`   Atualizadas: ${updatedCount}`)
  console.log(`   Ignoradas:   ${skippedCount}`)
}

syncAllFixtures()
