import { createClient } from '@/lib/supabase/server'
import { generateSnakeOrder } from './snake-order'
import { autoPickPlayer, type PlayerCandidate, type PositionKey } from './auto-pick'
import { generateBergerMatchups } from '@/lib/h2h/berger-generator'
import { h2hRoundsNeeded } from '@/lib/league/h2h-validation'
import { notifyDraftTurn } from '@/lib/whatsapp/draft-notification'

/**
 * Starts the draft for a league:
 * 1. Shuffles fantasy teams to establish initial draft_order (1..N)
 * 2. Sets total_picks = N * 22, current_pick = 1
 * 3. Updates league status to 'drafting'
 */
export async function startDraftEngine(leagueId: string) {
  const supabase = await createClient()

  // Fetch all fantasy teams in league
  const { data: teams, error } = await supabase
    .from('fantasy_teams')
    .select('id')
    .eq('league_id', leagueId)

  if (error || !teams || teams.length < 2) {
    throw new Error('Não há times suficientes para iniciar o draft.')
  }

  // Fisher-Yates shuffle
  const shuffled = [...teams]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }

  // Save draft_order for each team
  for (let index = 0; index < shuffled.length; index++) {
    await supabase
      .from('fantasy_teams')
      .update({ draft_order: index + 1 })
      .eq('id', shuffled[index].id)
  }

  const numTeams = teams.length
  const totalPicks = numTeams * 24

  // Update league status
  const { error: leagueUpdateErr } = await supabase
    .from('leagues')
    .update({
      status: 'drafting',
      current_pick: 1,
      total_picks: totalPicks,
      draft_started_at: new Date().toISOString(),
    })
    .eq('id', leagueId)

  if (leagueUpdateErr) {
    throw new Error('Erro ao atualizar status da liga.')
  }
}

/**
 * Executes a pick during the draft.
 */
export async function makePickEngine(
  leagueId: string,
  userId: string,
  playerId: string,
  isAutoPick: boolean = false
) {
  const supabase = await createClient()

  // 1. Fetch league status & state
  const { data: league, error: lErr } = await supabase
    .from('leagues')
    .select('id, status, current_pick, total_picks, is_paused, commissioner_id')
    .eq('id', leagueId)
    .single()

  if (lErr || !league) throw new Error('Liga não encontrada.')
  if (league.status !== 'drafting') throw new Error('O draft não está em andamento.')
  if (league.is_paused) throw new Error('O draft está temporariamente pausado pelo comissário.')

  // 2. Fetch all teams sorted by draft_order
  const { data: teams, error: tErr } = await supabase
    .from('fantasy_teams')
    .select('id, user_id, name, draft_order')
    .eq('league_id', leagueId)
    .order('draft_order', { ascending: true })

  if (tErr || !teams || teams.length < 2) throw new Error('Erro ao carregar times do draft.')

  const numTeams = teams.length
  const currentPickNum = league.current_pick ?? 1

  // Compute snake order for all picks
  const teamIds = teams.map((t) => t.id)
  const snakeOrder = generateSnakeOrder(teamIds, 24)
  const currentSlot = snakeOrder.find((s) => s.pickNumber === currentPickNum)

  if (!currentSlot) throw new Error('Fim das escolhas do draft.')

  const expectedTeam = teams.find((t) => t.id === currentSlot.fantasyTeamId)
  if (!expectedTeam) throw new Error('Time não encontrado para este slot.')

  const isOwner = expectedTeam.user_id === userId
  const isCommissioner = league.commissioner_id === userId

  // Unless it's an auto-pick, allow team owner OR league commissioner to submit pick
  if (!isAutoPick && !isOwner && !isCommissioner) {
    throw new Error('Não é a sua vez de escolher.')
  }

  // 3. Verify player is available and active
  const { data: player, error: pErr } = await supabase
    .from('real_players')
    .select('id, name, position, is_active')
    .eq('id', playerId)
    .single()

  if (pErr || !player) throw new Error('Jogador não encontrado.')
  if (!player.is_active) throw new Error('Este jogador não está ativo na temporada.')

  // Check if player was already picked in this league
  const { data: existingPick } = await supabase
    .from('draft_picks')
    .select('id')
    .eq('league_id', leagueId)
    .eq('player_id', playerId)
    .single()

  if (existingPick) throw new Error('Este jogador já foi escolhido por outro time nesta liga.')

  // 4. Insert draft pick record
  const { error: insertErr } = await supabase.from('draft_picks').insert({
    league_id: leagueId,
    fantasy_team_id: expectedTeam.id,
    player_id: playerId,
    pick_number: currentPickNum,
    round: currentSlot.round,
    is_auto_pick: isAutoPick,
  })

  if (insertErr) {
    console.error('Error inserting pick:', insertErr)
    throw new Error('Erro ao registrar a escolha no banco de dados.')
  }

  // 5. Advance current_pick or complete draft
  const nextPick = currentPickNum + 1
  if (currentPickNum >= league.total_picks) {
    await completeDraftEngine(leagueId)
  } else {
    await supabase
      .from('leagues')
      .update({ current_pick: nextPick })
      .eq('id', leagueId)

    // 6. Notify next player via WhatsApp (fire-and-forget)
    notifyDraftTurn(leagueId, nextPick).catch((err) =>
      console.error('[Draft] WhatsApp notification failed:', err)
    )
  }

  return {
    pickNumber: currentPickNum,
    round: currentSlot.round,
    teamId: expectedTeam.id,
    teamName: expectedTeam.name,
    playerId: player.id,
    playerName: player.name,
    position: player.position,
  }
}

/**
 * Completes the draft:
 * 1. Copies all draft_picks into roster_players
 * 2. Generates H2H matchups if scoring_mode === 'H2H'
 * 3. Changes league status to 'active'
 */
export async function completeDraftEngine(leagueId: string) {
  const supabase = await createClient()

  // Fetch league info
  const { data: league, error: leagueErr } = await supabase
    .from('leagues')
    .select('scoring_mode, season_id, h2h_format')
    .eq('id', leagueId)
    .single()

  if (leagueErr || !league) throw new Error('Erro ao buscar informações da liga.')

  // Fetch all picks
  const { data: picks, error: picksErr } = await supabase
    .from('draft_picks')
    .select('fantasy_team_id, player_id')
    .eq('league_id', leagueId)

  if (picksErr || !picks) throw new Error('Erro ao buscar escolhas do draft.')

  // Insert into roster_players
  const rosterRecords = picks.map((p) => ({
    fantasy_team_id: p.fantasy_team_id,
    player_id: p.player_id,
  }))

  const { error: rosterErr } = await supabase
    .from('roster_players')
    .insert(rosterRecords)

  if (rosterErr) {
    console.error('Error populating roster_players:', rosterErr)
    throw new Error('Erro ao consolidar elencos da liga.')
  }

  // If H2H, generate matchups using Berger algorithm
  if (league.scoring_mode === 'H2H') {
    const { data: teams } = await supabase
      .from('fantasy_teams')
      .select('id')
      .eq('league_id', leagueId)
      .order('draft_order', { ascending: true })

    if (teams && teams.length >= 2) {
      const teamIds = teams.map((t) => t.id)

      // Get season rounds to schedule all fixtures until tournament end
      const { data: season } = await supabase
        .from('seasons')
        .select('current_round, total_rounds')
        .eq('id', league.season_id)
        .single()

      const startRound = season?.current_round ?? 1
      const roundsNeeded = h2hRoundsNeeded(
        teamIds.length,
        (league.h2h_format as any) ?? 'DOUBLE_ROUND'
      )
      const endRound = startRound + roundsNeeded - 1
      const matchups = generateBergerMatchups(teamIds, startRound, endRound)

      // Insert matchups
      if (matchups.length > 0) {
        const matchupRecords = matchups.map((m) => ({
          league_id: leagueId,
          fixture_round: m.fixtureRound,
          home_team_id: m.homeTeamId,
          away_team_id: m.awayTeamId,
        }))

        const { error: matchupErr } = await supabase
          .from('h2h_matchups')
          .insert(matchupRecords)

        if (matchupErr) {
          console.error('Error generating H2H matchups:', matchupErr)
        }
      }
    }
  }

  // Update status to 'active'
  await supabase
    .from('leagues')
    .update({ status: 'active', is_paused: false })
    .eq('id', leagueId)
}

/**
 * Toggles pause/resume state for a draft. Only commissioner can execute.
 */
export async function toggleDraftPauseEngine(leagueId: string, userId: string): Promise<boolean> {
  const supabase = await createClient()

  const { data: league, error } = await supabase
    .from('leagues')
    .select('commissioner_id, is_paused, status')
    .eq('id', leagueId)
    .single()

  if (error || !league) throw new Error('Liga não encontrada.')
  if (league.commissioner_id !== userId) throw new Error('Apenas o comissário pode pausar o draft.')
  if (league.status !== 'drafting') throw new Error('O draft não está em andamento.')

  const newPauseState = !league.is_paused

  await supabase
    .from('leagues')
    .update({ is_paused: newPauseState })
    .eq('id', leagueId)

  return newPauseState
}
