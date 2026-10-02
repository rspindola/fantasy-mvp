import { Client } from 'pg'
import { calculatePlayerScoring, type PlayerScouts } from '../src/lib/scoring/scoring-engine'

const validPositions = ['GOL', 'LAT', 'ZAG', 'MEI', 'ATA'] as const
type Position = (typeof validPositions)[number]

export async function updatePlayerPosition(options: {
  apiFootballId?: number
  playerId?: string
  name?: string
  newPosition: Position
}) {
  const connectionString =
    process.env.DATABASE_URL ||
    'postgres://postgres.ilinrgasbkhvzujltbhp:pQXA9LMIwHZdqBfK@aws-0-ca-central-1.pooler.supabase.com:6543/postgres'

  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  })

  await client.connect()

  try {
    let whereClause = ''
    const params: any[] = []

    if (options.playerId) {
      whereClause = 'rp.id = $1'
      params.push(options.playerId)
    } else if (options.apiFootballId) {
      whereClause = 'rp.api_football_id = $1'
      params.push(options.apiFootballId)
    } else if (options.name) {
      whereClause = 'rp.name ILIKE $1'
      params.push(`%${options.name}%`)
    } else {
      throw new Error('Informe --apiId, --id ou --name')
    }

    const playerRes = await client.query(
      `
      SELECT rp.id, rp.name, rp.position, rp.api_football_id, rp.avg_points, c.name as club_name
      FROM real_players rp
      JOIN real_clubs c ON c.id = rp.club_id
      WHERE ${whereClause}
      LIMIT 1;
    `,
      params
    )

    if (playerRes.rows.length === 0) {
      throw new Error('Jogador não encontrado!')
    }

    const player = playerRes.rows[0]
    const oldPosition = player.position
    const newPosition = options.newPosition

    console.log(`\n======================================================`)
    console.log(`🔄 Atualizando posição do atleta: ${player.name} (${player.club_name})`)
    console.log(`   API ID: ${player.api_football_id} | DB ID: ${player.id}`)
    console.log(`   Posição Anterior: ${oldPosition} (Média: ${player.avg_points} pts)`)
    console.log(`   Nova Posição:     ${newPosition}`)
    console.log(`======================================================\n`)

    if (oldPosition === newPosition) {
      console.log('ℹ️ O jogador já está com essa posição cadastrada.')
      return
    }

    // 1. Update position in real_players
    await client.query('UPDATE real_players SET position = $1 WHERE id = $2', [
      newPosition,
      player.id,
    ])

    // 2. Fetch all match stats for this player
    const statsRes = await client.query(
      `
      SELECT *
      FROM player_fixture_stats
      WHERE player_id = $1;
    `,
      [player.id]
    )

    console.log(`📋 Recalculando pontuação em ${statsRes.rows.length} partidas disputadas...`)

    let totalPoints = 0

    for (const s of statsRes.rows) {
      const scouts: PlayerScouts = {
        position: newPosition,
        minutes: s.minutes ?? 0,
        goals: s.goals ?? 0,
        assists: s.assists ?? 0,
        shotsOnWoodwork: s.shots_on_woodwork ?? 0,
        shotsOnTarget: s.shots_on_target ?? 0,
        shotsOffTarget: s.shots_off_target ?? 0,
        foulsDrawn: s.fouls_drawn ?? 0,
        penaltiesWon: s.penalties_won ?? 0,
        passesCompleted: s.passes_completed ?? 0,
        passesFailed: s.passes_failed ?? 0,
        offsides: s.offsides ?? 0,
        penaltiesMissed: s.penalties_missed ?? 0,
        cleanSheet: s.clean_sheet ?? false,
        saves: s.saves ?? 0,
        penaltySaves: s.penalty_saves ?? 0,
        tackles: s.tackles ?? 0,
        foulsCommitted: s.fouls_committed ?? 0,
        ownGoals: s.own_goals ?? 0,
        yellowCards: s.yellow_cards ?? 0,
        redCards: s.red_cards ?? 0,
        goalsConceded: s.goals_conceded ?? 0,
        penaltiesCommitted: s.penalties_committed ?? 0,
      }

      const newComputedPoints = calculatePlayerScoring(scouts)
      totalPoints += newComputedPoints

      await client.query(
        `
        UPDATE player_fixture_stats
        SET computed_points = $1
        WHERE id = $2;
      `,
        [newComputedPoints, s.id]
      )
    }

    // 3. Recalculate avg_points in real_players
    const newAvg =
      statsRes.rows.length > 0
        ? parseFloat((totalPoints / statsRes.rows.length).toFixed(2))
        : 0.0

    await client.query(
      `
      UPDATE real_players
      SET avg_points = $1
      WHERE id = $2;
    `,
      [newAvg, player.id]
    )

    console.log(`✅ Sucesso! Posição alterada para ${newPosition}.`)
    console.log(`📊 Média de pontos recalculada: de ${player.avg_points} pts ➔ ${newAvg} pts\n`)
  } finally {
    await client.end()
  }
}

// CLI Execution
if (require.main === module) {
  const args = process.argv.slice(2)
  let apiId: number | undefined
  let playerId: string | undefined
  let name: string | undefined
  let pos: Position | undefined

  for (const arg of args) {
    if (arg.startsWith('--apiId=')) apiId = parseInt(arg.split('=')[1])
    if (arg.startsWith('--id=')) playerId = arg.split('=')[1]
    if (arg.startsWith('--name=')) name = arg.split('=')[1]
    if (arg.startsWith('--pos=')) pos = arg.split('=')[1].toUpperCase() as Position
  }

  if (!pos || !validPositions.includes(pos)) {
    console.error(`❌ Erro: --pos deve ser um dos seguintes: ${validPositions.join(', ')}`)
    process.exit(1)
  }

  updatePlayerPosition({
    apiFootballId: apiId,
    playerId,
    name,
    newPosition: pos,
  }).catch((err) => {
    console.error('❌ Falha na execução:', err)
    process.exit(1)
  })
}
