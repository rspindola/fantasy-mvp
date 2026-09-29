import { Client } from 'pg'
import { generateBergerMatchups } from '../src/lib/h2h/berger-generator'
import { calculatePlayerScoring, calculateTeamRoundScore } from '../src/lib/scoring/scoring-engine'
import { autoPickPlayer, type PlayerCandidate } from '../src/lib/draft/auto-pick'

async function seedDemoLeague() {
  const connectionString =
    process.env.DATABASE_URL ||
    'postgres://postgres.ilinrgasbkhvzujltbhp:pQXA9LMIwHZdqBfK@aws-0-ca-central-1.pooler.supabase.com:6543/postgres'

  console.log('🎮 Criando Liga de Demonstração Interativa com Mercado ABERTO...')
  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } })

  try {
    await client.connect()

    // 1. Fetch Season 2026
    const seasonRes = await client.query(`SELECT id FROM seasons WHERE year = 2026 LIMIT 1;`)
    if (seasonRes.rows.length === 0) {
      throw new Error('Season 2026 não encontrada! Execute npm run seed:api primeiro.')
    }
    const seasonId = seasonRes.rows[0].id

    // 2. Fetch active user profile for commissioner
    const userRes = await client.query(`
      SELECT id FROM profiles WHERE display_name NOT LIKE 'Técnico %' ORDER BY created_at ASC LIMIT 1;
    `)
    let commissionerId: string

    if (userRes.rows.length > 0) {
      commissionerId = userRes.rows[0].id
    } else {
      const anyUserRes = await client.query(`SELECT id FROM profiles ORDER BY created_at ASC LIMIT 1;`)
      if (anyUserRes.rows.length > 0) {
        commissionerId = anyUserRes.rows[0].id
      } else {
        const newUserId = '00000000-0000-0000-0000-000000000001'
        await client.query(`
          INSERT INTO profiles (id, display_name)
          VALUES ('${newUserId}', 'Técnico Demo')
          ON CONFLICT (id) DO NOTHING;
        `)
        commissionerId = newUserId
      }
    }

    // 3. Clear any previous DEMO league
    await client.query(`DELETE FROM leagues WHERE invite_code = 'DEMO2026';`)

    // 4. Update Round 28 fixtures kickoff_at to future date (48h from now) so market is OPEN (lock is 30m before kickoff)
    const futureKickoff = new Date(Date.now() + 48 * 3600 * 1000).toISOString()
    await client.query(
      `UPDATE fixtures SET kickoff_at = $1 WHERE season_id = $2 AND round = 28;`,
      [futureKickoff, seasonId]
    )

    // 5. Create Demo League
    console.log('🏆 Criando liga "Liga Demo 2026" (Código: DEMO2026)...')
    const leagueRes = await client.query(
      `
      INSERT INTO leagues (
        name, invite_code, scoring_mode, h2h_format, draft_mode, team_cap, status,
        season_id, commissioner_id, pick_timer_seconds, current_pick, total_picks
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING id;
    `,
      [
        'Liga Demo 2026 (Série A)',
        'DEMO2026',
        'H2H',
        'DOUBLE_ROUND',
        'HYBRID',
        4,
        'active', // Draft completed & active
        seasonId,
        commissionerId,
        10800, // 3h
        97,
        96, // 4 teams * 24 players = 96 picks
      ]
    )
    const leagueId = leagueRes.rows[0].id

    // 6. Create 4 Fantasy Teams
    console.log('🛡️  Criando 4 times de demonstração...')
    const teamNames = [
      'Galácticos FC',
      'Furia Rubro-Negra',
      'Verdão Imparável',
      'Tricolor de Aço',
    ]

    const teamIds: string[] = []

    for (let i = 0; i < teamNames.length; i++) {
      const demoUserId = i === 0 ? commissionerId : `00000000-0000-0000-0000-00000000000${i + 1}`

      if (i > 0) {
        await client.query(
          `
          INSERT INTO auth.users (id, email, instance_id, aud, role)
          VALUES ($1, $2, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated')
          ON CONFLICT (id) DO NOTHING;
        `,
          [demoUserId, `demo_user_${i + 1}@fantasy.com`]
        )

        await client.query(
          `
          INSERT INTO profiles (id, display_name)
          VALUES ($1, $2)
          ON CONFLICT (id) DO NOTHING;
        `,
          [demoUserId, `Técnico ${teamNames[i]}`]
        )
      }

      const res = await client.query(
        `
        INSERT INTO fantasy_teams (league_id, user_id, name, draft_order)
        VALUES ($1, $2, $3, $4)
        RETURNING id;
      `,
        [leagueId, demoUserId, teamNames[i], i + 1]
      )
      teamIds.push(res.rows[0].id)
    }

    // 7. Fetch active players from catalog and draft using autoPickPlayer
    const playersRes = await client.query(`
      SELECT id, name, position, COALESCE(avg_points, 0) as avg_points, COALESCE(total_minutes, 0) as total_minutes FROM real_players WHERE is_active = true ORDER BY avg_points DESC;
    `)
    let availablePlayers: PlayerCandidate[] = playersRes.rows.map((p) => ({
      id: p.id,
      name: p.name,
      position: p.position as any,
      avgPoints: Number(p.avg_points),
      totalMinutes: Number(p.total_minutes),
    }))

    console.log('📋 Realizando draft automático de 96 jogadores com regras de posição (2 GOL, 8 DEF [min 2 LAT, min 2 ZAG], 8 MEI, 6 ATA por time)...')

    const teamRosters: Record<string, PlayerCandidate[]> = {
      [teamIds[0]]: [],
      [teamIds[1]]: [],
      [teamIds[2]]: [],
      [teamIds[3]]: [],
    }

    let pickNum = 1
    for (let round = 1; round <= 24; round++) {
      const isEven = round % 2 === 0
      const order = isEven ? [...teamIds].reverse() : [...teamIds]

      for (const tId of order) {
        const currentRoster = teamRosters[tId]
        const pickedPlayer = autoPickPlayer(availablePlayers, currentRoster)

        if (!pickedPlayer) {
          throw new Error(`Sem jogador disponível para autoPick no pick ${pickNum}`)
        }

        availablePlayers = availablePlayers.filter((p) => p.id !== pickedPlayer.id)

        await client.query(
          `
          INSERT INTO draft_picks (league_id, fantasy_team_id, player_id, pick_number, round, is_auto_pick)
          VALUES ($1, $2, $3, $4, $5, false);
        `,
          [leagueId, tId, pickedPlayer.id, pickNum, round]
        )

        await client.query(
          `
          INSERT INTO roster_players (fantasy_team_id, player_id)
          VALUES ($1, $2);
        `,
          [tId, pickedPlayer.id]
        )

        teamRosters[tId].push(pickedPlayer)
        pickNum++
      }
    }

    // 8. Generate H2H Matchups (Berger algorithm) for 6 rounds (Ida e Volta: R28 a R33)
    console.log('⚔️  Gerando confrontos H2H Ida e Volta (6 rodadas: R28 a R33)...')
    const h2hMatchups = generateBergerMatchups(teamIds, 28, 33)

    for (const m of h2hMatchups) {
      await client.query(
        `
        INSERT INTO h2h_matchups (league_id, fixture_round, home_team_id, away_team_id)
        VALUES ($1, $2, $3, $4);
      `,
        [leagueId, m.fixtureRound, m.homeTeamId, m.awayTeamId]
      )
    }

    // 9. Create Lineups (Market OPEN) and Calculate Round 28 Scores
    console.log('⚽ Escalando titulares (4-3-3: 1G, 2L, 2Z, 3M, 3A) e 5 reservas...')

    for (const tId of teamIds) {
      const roster = teamRosters[tId]
      const gol = roster.filter((p) => p.position === 'GOL')
      const lat = roster.filter((p) => p.position === 'LAT')
      const zag = roster.filter((p) => p.position === 'ZAG')
      const mei = roster.filter((p) => p.position === 'MEI')
      const ata = roster.filter((p) => p.position === 'ATA')

      const starters = [
        ...gol.slice(0, 1),
        ...lat.slice(0, 2),
        ...zag.slice(0, 2),
        ...mei.slice(0, 3),
        ...ata.slice(0, 3),
      ]

      const reserves = [
        ...gol.slice(1, 2),
        ...lat.slice(2, 3),
        ...zag.slice(2, 3),
        ...mei.slice(3, 4),
        ...ata.slice(3, 4),
      ]

      // Insert lineup with is_locked = false (Market OPEN)
      const lineupRes = await client.query(
        `
        INSERT INTO lineups (fantasy_team_id, fixture_round, formation, is_locked)
        VALUES ($1, 28, '4-3-3', false)
        RETURNING id;
      `,
        [tId]
      )
      const lineupId = lineupRes.rows[0].id

      const starterScores: { points: number; isCaptain: boolean }[] = []

      // Insert Starters
      for (let idx = 0; idx < starters.length; idx++) {
        const player = starters[idx]
        const isCaptain = idx === 5 // Pick top midfielder (idx 5) as captain

        await client.query(
          `
          INSERT INTO lineup_slots (lineup_id, player_id, slot_position, is_captain, is_starter)
          VALUES ($1, $2, $3, $4, true);
        `,
          [lineupId, player.id, `${player.position}_${idx + 1}`, isCaptain]
        )

        const pts = calculatePlayerScoring({
          position: player.position as any,
          minutes: 90,
          goals: player.position === 'ATA' ? 1 : 0,
          assists: player.position === 'MEI' ? 1 : 0,
          shotsOnWoodwork: 0,
          shotsOnTarget: 1,
          shotsOffTarget: 1,
          foulsDrawn: 2,
          penaltiesWon: 0,
          passesFailed: 3,
          offsides: 0,
          penaltiesMissed: 0,
          cleanSheet: player.position === 'ZAG' || player.position === 'LAT' || player.position === 'GOL',
          saves: player.position === 'GOL' ? 4 : 0,
          penaltySaves: 0,
          tackles: 2,
          foulsCommitted: 1,
          ownGoals: 0,
          yellowCards: 0,
          redCards: 0,
          goalsConceded: 0,
          penaltiesCommitted: 0,
        })

        starterScores.push({ points: pts, isCaptain })
      }

      // Insert Reserves
      for (const resPlayer of reserves) {
        await client.query(
          `
          INSERT INTO lineup_slots (lineup_id, player_id, slot_position, is_captain, is_starter)
          VALUES ($1, $2, $3, false, false);
        `,
          [lineupId, resPlayer.id, `RES_${resPlayer.position}`]
        )
      }

      const scoreResult = calculateTeamRoundScore(starterScores)

      await client.query(
        `
        INSERT INTO round_scores (fantasy_team_id, fixture_round, total_points, captain_bonus)
        VALUES ($1, 28, $2, $3);
      `,
        [tId, scoreResult.totalPoints, scoreResult.captainBonus]
      )
    }

    // 10. Update H2H matchups results for Round 28
    const r28ScoresRes = await client.query(`
      SELECT fantasy_team_id, total_points FROM round_scores WHERE fixture_round = 28;
    `)
    const scoresMap = new Map<string, number>()
    r28ScoresRes.rows.forEach((row) => scoresMap.set(row.fantasy_team_id, Number(row.total_points)))

    const r28Matchups = await client.query(`
      SELECT id, home_team_id, away_team_id FROM h2h_matchups WHERE league_id = $1 AND fixture_round = 28;
    `, [leagueId])

    for (const m of r28Matchups.rows) {
      const hPts = scoresMap.get(m.home_team_id) || 0
      const aPts = scoresMap.get(m.away_team_id) || 0
      const res = hPts > aPts ? 'home' : aPts > hPts ? 'away' : 'draw'

      await client.query(
        `
        UPDATE h2h_matchups SET home_points = $1, away_points = $2, result = $3 WHERE id = $4;
      `,
        [hPts, aPts, res, m.id]
      )
    }

    console.log('🎉 LIGA DEMO RE-CRIADA COM MERCADO ABERTO!')
    console.log('👉 Acesse http://localhost:3000/dashboard para testar a escalação agora!')

  } catch (err) {
    console.error('❌ Erro ao criar Liga Demo:', err)
  } finally {
    await client.end()
  }
}

seedDemoLeague()
