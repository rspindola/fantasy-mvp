import { Client } from 'pg'
import { generateBergerMatchups } from '../src/lib/h2h/berger-generator'
import { calculateTeamRoundScore } from '../src/lib/scoring/scoring-engine'
import { processAutoSubstitutions, type LineupPlayerInput } from '../src/lib/lineup/auto-sub'
import { syncRound27RealStats } from './fetch-r27-stats'

interface PlayerCandidate {
  id: string
  name: string
  position: 'GOL' | 'LAT' | 'ZAG' | 'MEI' | 'ATA'
  avgPoints: number
  totalMinutes: number
}

// Strict quotas according to business rules: exactly 24 players per squad
const STRICT_QUOTAS: Record<'GOL' | 'LAT' | 'ZAG' | 'MEI' | 'ATA', number> = {
  GOL: 3,
  LAT: 5,
  ZAG: 5,
  MEI: 7,
  ATA: 4,
}

async function seedDemoLeague() {
  const connectionString =
    process.env.DATABASE_URL ||
    'postgres://postgres.ilinrgasbkhvzujltbhp:pQXA9LMIwHZdqBfK@aws-0-ca-central-1.pooler.supabase.com:6543/postgres'

  console.log('🎮 Criando Liga H2H Turno Único com 12 TIMES e R27 Realizada (Scouts Oficiais)...')
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

    // 3. Reset existing fantasy leagues completely
    console.log('🧹 Resetando dados de ligas anteriores...')
    await client.query(`TRUNCATE leagues CASCADE;`)

    // 4. Sync real Round 27 player scouts from API-Football cache
    await syncRound27RealStats(client, seasonId)

    // 5. Update Round 28 fixtures kickoff_at to future date (48h from now) so market is OPEN
    const futureKickoff = new Date(Date.now() + 48 * 3600 * 1000).toISOString()
    await client.query(
      `UPDATE fixtures SET kickoff_at = $1 WHERE season_id = $2 AND round = 28;`,
      [futureKickoff, seasonId]
    )

    // Set Season current_round = 28 (R27 is completed, R28 is the active round)
    await client.query(`UPDATE seasons SET current_round = 28 WHERE id = $1;`, [seasonId])

    // 6. Create 12-team Demo League
    console.log('🏆 Criando liga "Liga Demo 2026 (Série A)" com 12 times (Código: DEMO2026)...')
    const totalPicks = 12 * 24 // 288 picks
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
        'SINGLE_ROUND', // 12 teams -> 11 rounds (R27 a R37)
        'HYBRID',
        12,
        'active', // Draft completed & active
        seasonId,
        commissionerId,
        10800,
        totalPicks + 1,
        totalPicks,
      ]
    )
    const leagueId = leagueRes.rows[0].id

    // 7. Create 12 Fantasy Teams
    console.log('🛡️  Criando 12 times de demonstração...')
    const teamNames = [
      'Galácticos FC',       // 1. Commissioner
      'Furia Rubro-Negra',   // 2.
      'Verdão Imparável',    // 3.
      'Tricolor de Aço',     // 4.
      'Soberano FC',         // 5.
      'Alvinegro Praiano',   // 6.
      'Imortal Tricolor',    // 7.
      'Gigante da Colina',   // 8.
      'Galo Atômico',        // 9.
      'Furacão da Baixada',  // 10.
      'Malandragem FC',      // 11.
      'Time do Povo',        // 12.
    ]

    const teamIds: string[] = []

    for (let i = 0; i < teamNames.length; i++) {
      const hexIndex = (i + 1).toString().padStart(12, '0')
      const demoUserId = i === 0 ? commissionerId : `00000000-0000-0000-0000-${hexIndex}`

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

    // 8. Fetch active players and Draft 288 players with strict quotas
    console.log('📋 Realizando draft automático de 288 jogadores (12 times × 24 jogadores: 3 GOL, 5 LAT, 5 ZAG, 7 MEI, 4 ATA)...')
    const playersRes = await client.query(`
      SELECT p.id, p.name, p.position, COALESCE(p.avg_points, 0) as avg_points, COALESCE(p.total_minutes, 0) as total_minutes
      FROM real_players p
      WHERE p.is_active = true
      ORDER BY p.avg_points DESC;
    `)

    let availablePlayers: PlayerCandidate[] = playersRes.rows.map((p) => ({
      id: p.id,
      name: p.name,
      position: p.position as any,
      avgPoints: Number(p.avg_points),
      totalMinutes: Number(p.total_minutes),
    }))

    const teamRosters: Record<string, PlayerCandidate[]> = {}
    const teamCounts: Record<string, Record<'GOL' | 'LAT' | 'ZAG' | 'MEI' | 'ATA', number>> = {}

    teamIds.forEach((tId) => {
      teamRosters[tId] = []
      teamCounts[tId] = { GOL: 0, LAT: 0, ZAG: 0, MEI: 0, ATA: 0 }
    })

    let pickNum = 1
    for (let round = 1; round <= 24; round++) {
      const isEven = round % 2 === 0
      const order = isEven ? [...teamIds].reverse() : [...teamIds]

      for (const tId of order) {
        const counts = teamCounts[tId]
        
        // Find best player whose position has not reached the quota
        const candidateIndex = availablePlayers.findIndex(
          (p) => counts[p.position] < STRICT_QUOTAS[p.position]
        )

        if (candidateIndex === -1) {
          throw new Error(`Sem jogador elegível no pick ${pickNum} para completar a cota do time ${tId}`)
        }

        const pickedPlayer = availablePlayers.splice(candidateIndex, 1)[0]
        counts[pickedPlayer.position]++
        teamRosters[tId].push(pickedPlayer)

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

        pickNum++
      }
    }

    // 9. Generate H2H Matchups (Berger algorithm) for 11 rounds (Turno Único: R27 a R37, 66 duelos)
    console.log('⚔️  Gerando confrontos H2H Turno Único para 12 times (11 rodadas: R27 a R37, 66 duelos)...')
    const h2hMatchups = generateBergerMatchups(teamIds, 27, 37)

    for (const m of h2hMatchups) {
      await client.query(
        `
        INSERT INTO h2h_matchups (league_id, fixture_round, home_team_id, away_team_id)
        VALUES ($1, $2, $3, $4);
      `,
        [leagueId, m.fixtureRound, m.homeTeamId, m.awayTeamId]
      )
    }

    // 10. Load Round 27 Real Player Stats map
    const r27StatsRes = await client.query(`
      SELECT pfs.*, p.position, p.name, p.photo_url, rc.short_name as club_short_name, rc.logo_url as club_logo_url
      FROM player_fixture_stats pfs
      JOIN fixtures f ON f.id = pfs.fixture_id
      JOIN real_players p ON p.id = pfs.player_id
      JOIN real_clubs rc ON rc.id = p.club_id
      WHERE f.season_id = $1 AND f.round = 27;
    `, [seasonId])

    const r27StatsMap = new Map<string, any>()
    r27StatsRes.rows.forEach(r => r27StatsMap.set(r.player_id, r))
    console.log(`📊 ${r27StatsMap.size} atletas possuem scouts reais na R27.`)

    // 11. Create Round 27 Lineups, Auto-Substitutions and Official Scoring
    console.log('⚽ Escalando titulares e reservas da R27 com aplicação de Auto-Sub e estatísticas reais...')
    const teamScoresMap = new Map<string, number>()

    for (let tIdx = 0; tIdx < teamIds.length; tIdx++) {
      const tId = teamIds[tIdx]
      const roster = teamRosters[tId]

      const gol = roster.filter((p) => p.position === 'GOL')
      const lat = roster.filter((p) => p.position === 'LAT')
      const zag = roster.filter((p) => p.position === 'ZAG')
      const mei = roster.filter((p) => p.position === 'MEI')
      const ata = roster.filter((p) => p.position === 'ATA')

      // Starters (4-3-3: 1 GOL, 2 LAT, 2 ZAG, 3 MEI, 3 ATA)
      const starters = [
        ...gol.slice(0, 1),
        ...lat.slice(0, 2),
        ...zag.slice(0, 2),
        ...mei.slice(0, 3),
        ...ata.slice(0, 3),
      ]

      // Reserves (5: 1 GOL, 1 LAT, 1 ZAG, 1 MEI, 1 ATA)
      const reserves = [
        ...gol.slice(1, 2),
        ...lat.slice(2, 3),
        ...zag.slice(2, 3),
        ...mei.slice(3, 4),
        ...ata.slice(3, 4),
      ]

      // Captain: Midfielder idx 5 (or Attacker idx 8)
      const captainPlayerId = starters[5]?.id || starters[0].id

      // Insert Round 27 lineup (is_locked: true, completed round)
      const lineupRes = await client.query(
        `
        INSERT INTO lineups (fantasy_team_id, fixture_round, formation, is_locked)
        VALUES ($1, 27, '4-3-3', true)
        RETURNING id;
      `,
        [tId]
      )
      const lineupId = lineupRes.rows[0].id

      // Insert Starters slots
      for (let sIdx = 0; sIdx < starters.length; sIdx++) {
        const p = starters[sIdx]
        const isCaptain = p.id === captainPlayerId
        await client.query(
          `
          INSERT INTO lineup_slots (lineup_id, player_id, slot_position, is_captain, is_starter)
          VALUES ($1, $2, $3, $4, true);
        `,
          [lineupId, p.id, `${p.position}_${sIdx + 1}`, isCaptain]
        )
      }

      // Insert Reserves slots
      for (const resP of reserves) {
        await client.query(
          `
          INSERT INTO lineup_slots (lineup_id, player_id, slot_position, is_captain, is_starter)
          VALUES ($1, $2, $3, false, false);
        `,
          [lineupId, resP.id, `RES_${resP.position}`]
        )
      }

      // Map to LineupPlayerInput for auto-sub engine
      const startersInput: LineupPlayerInput[] = starters.map((p, idx) => {
        const stat = r27StatsMap.get(p.id)
        return {
          playerId: p.id,
          name: p.name,
          position: p.position,
          slotPosition: `${p.position}_${idx + 1}`,
          isCaptain: p.id === captainPlayerId,
          isStarter: true,
          minutes: stat ? stat.minutes : 0,
          points: stat ? Number(stat.computed_points) : 0.0,
          scouts: stat ? {
            goals: stat.goals,
            assists: stat.assists,
            tackles: stat.tackles,
            cleanSheet: stat.clean_sheet,
            saves: stat.saves,
            yellowCards: stat.yellow_cards,
          } : {},
        }
      })

      const reservesInput: LineupPlayerInput[] = reserves.map((p) => {
        const stat = r27StatsMap.get(p.id)
        return {
          playerId: p.id,
          name: p.name,
          position: p.position,
          slotPosition: `RES_${p.position}`,
          isCaptain: false,
          isStarter: false,
          minutes: stat ? stat.minutes : 0,
          points: stat ? Number(stat.computed_points) : 0.0,
          scouts: stat ? {
            goals: stat.goals,
            assists: stat.assists,
            tackles: stat.tackles,
            cleanSheet: stat.clean_sheet,
            saves: stat.saves,
            yellowCards: stat.yellow_cards,
          } : {},
        }
      })

      // Execute official Auto-Sub
      const processed = processAutoSubstitutions(startersInput, reservesInput)

      await client.query(
        `
        INSERT INTO round_scores (fantasy_team_id, fixture_round, total_points, captain_bonus)
        VALUES ($1, 27, $2, $3);
      `,
        [tId, processed.totalPoints, processed.captainBonus]
      )

      teamScoresMap.set(tId, processed.totalPoints)

      // Also create Round 28 Lineup with is_locked = false (Market OPEN)
      const r28LineupRes = await client.query(
        `
        INSERT INTO lineups (fantasy_team_id, fixture_round, formation, is_locked)
        VALUES ($1, 28, '4-3-3', false)
        RETURNING id;
      `,
        [tId]
      )
      const r28LineupId = r28LineupRes.rows[0].id

      for (let sIdx = 0; sIdx < starters.length; sIdx++) {
        const p = starters[sIdx]
        await client.query(
          `
          INSERT INTO lineup_slots (lineup_id, player_id, slot_position, is_captain, is_starter)
          VALUES ($1, $2, $3, $4, true);
        `,
          [r28LineupId, p.id, `${p.position}_${sIdx + 1}`, p.id === captainPlayerId]
        )
      }

      for (const resP of reserves) {
        await client.query(
          `
          INSERT INTO lineup_slots (lineup_id, player_id, slot_position, is_captain, is_starter)
          VALUES ($1, $2, $3, false, false);
        `,
          [r28LineupId, resP.id, `RES_${resP.position}`]
        )
      }
    }

    // 12. Update Round 27 H2H Matchups results
    console.log('🏆 Atualizando resultados dos 6 duelos H2H da Rodada 27 com as pontuações reais...')
    const r27Matchups = await client.query(
      `SELECT id, home_team_id, away_team_id FROM h2h_matchups WHERE league_id = $1 AND fixture_round = 27;`,
      [leagueId]
    )

    for (const m of r27Matchups.rows) {
      const hPts = teamScoresMap.get(m.home_team_id) || 0
      const aPts = teamScoresMap.get(m.away_team_id) || 0
      const res = hPts > aPts ? 'home' : aPts > hPts ? 'away' : 'draw'

      await client.query(
        `UPDATE h2h_matchups SET home_points = $1, away_points = $2, result = $3 WHERE id = $4;`,
        [hPts, aPts, res, m.id]
      )
    }

    console.log('\n🎉 SUCESSO! LIGA DE 12 TIMES CRIADA E RODADA 27 CONCLUÍDA COM PONTUAÇÃO REAL!')
    console.log('--------------------------------------------------------------------------------')
    console.log('📋 Formato: H2H Turno Único (12 times, 11 rodadas de R27 a R37, 66 confrontos)')
    console.log('⚽ Rodada 27: FINALIZADA com scouts 100% REAIS da API-Football e Auto-Sub ativo')
    console.log('🔥 Rodada 28: ABERTA para escalação e mercado aberto (jogos agendados)')
    console.log('👉 Acesse http://localhost:3000/league/' + leagueId + '/standings para conferir!')
  } catch (err) {
    console.error('❌ Erro ao criar Liga Demo:', err)
  } finally {
    await client.end()
  }
}

seedDemoLeague()
