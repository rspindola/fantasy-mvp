import { Client } from 'pg'
import { processAutoSubstitutions, type LineupPlayerInput } from '../src/lib/lineup/auto-sub'

async function run() {
  const client = new Client({
    connectionString: 'postgres://postgres.ilinrgasbkhvzujltbhp:pQXA9LMIwHZdqBfK@aws-0-ca-central-1.pooler.supabase.com:6543/postgres',
    ssl: { rejectUnauthorized: false }
  })

  await client.connect()
  await client.query('SET search_path TO public;')
  console.log('Connected to DB')

  // Find demo league
  const lRes = await client.query(`SELECT id, name, season_id FROM leagues WHERE name LIKE '%Demo%' LIMIT 1;`)
  if (lRes.rows.length === 0) {
    console.log('No demo league found')
    await client.end()
    return
  }
  const league = lRes.rows[0]
  console.log('League:', league.name, league.id)

  // Find a matchup in round 28
  const mRes = await client.query(`
    SELECT m.id, m.fixture_round, ht.id as home_id, ht.name as home_name, at.id as away_id, at.name as away_name
    FROM h2h_matchups m
    JOIN fantasy_teams ht ON ht.id = m.home_team_id
    JOIN fantasy_teams at ON at.id = m.away_team_id
    WHERE m.league_id = $1 AND m.fixture_round = 28
    LIMIT 1;
  `, [league.id])

  const matchup = mRes.rows[0]
  console.log(`\nMatchup selected: ${matchup.home_name} vs ${matchup.away_name} (Round ${matchup.fixture_round})`)

  // Check lineups for home team
  const homeSlotsRes = await client.query(`
    SELECT ls.is_starter, ls.slot_position, ls.is_captain, p.id as player_id, p.name, p.position
    FROM lineup_slots ls
    JOIN lineups l ON l.id = ls.lineup_id
    JOIN real_players p ON p.id = ls.player_id
    WHERE l.fantasy_team_id = $1 AND l.fixture_round = 28;
  `, [matchup.home_id])

  console.log(`Home team slots count: ${homeSlotsRes.rows.length}`)

  // Simulate an auto-sub test with mock stats where 1 starter didn't play AND was captain
  const startersInput: LineupPlayerInput[] = homeSlotsRes.rows
    .filter(r => r.is_starter)
    .map((r, idx) => ({
      playerId: r.player_id,
      name: r.name,
      position: r.position,
      slotPosition: r.slot_position,
      isCaptain: idx === 2 ? true : false, // Make 3rd starter the captain AND DNP
      isStarter: true,
      minutes: idx === 2 ? 0 : 90, // Force 3rd starter to have 0 minutes (DNP)
      points: idx === 2 ? 0 : 6.0,
      scouts: {}
    }))

  const reservesInput: LineupPlayerInput[] = homeSlotsRes.rows
    .filter(r => !r.is_starter)
    .map(r => ({
      playerId: r.player_id,
      name: r.name,
      position: r.position,
      slotPosition: r.slot_position,
      isCaptain: false,
      isStarter: false,
      minutes: 90,
      points: 7.5,
      scouts: {}
    }))

  console.log('\nRunning processAutoSubstitutions...')
  const result = processAutoSubstitutions(startersInput, reservesInput)

  console.log(`Substitutions performed: ${result.substitutions.length}`)
  result.substitutions.forEach(s => {
    console.log(` -> OUT: ${s.outPlayer.name} (${s.position}, 0 min) <=> IN: ${s.inPlayer.name} (${s.position}, +${s.inPlayer.points} pts, Captain Transferred: ${s.captainTransferred})`)
  })

  console.log(`Total Points: ${result.totalPoints}`)
  console.log(`Captain Bonus: ${result.captainBonus}`)

  await client.end()
}

run().catch(console.error)
