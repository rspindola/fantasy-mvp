'use server'

import { createClient } from '@/lib/supabase/server'
import { validateLineup, type Formation, type LineupSlotItem } from '@/lib/lineup/lineup-engine'
import { checkRoundLockStatus } from '@/lib/lineup/lock'
import { revalidatePath } from 'next/cache'

export type LineupPageData = {
  leagueId: string
  leagueName: string
  teamId: string
  teamName: string
  seasonId: string
  currentRound: number
  isLocked: boolean
  kickoffAt: string | null
  formation: Formation
  roster: {
    id: string
    name: string
    position: 'GOL' | 'LAT' | 'ZAG' | 'MEI' | 'ATA'
    clubShortName: string
    photoUrl: string | null
    avgPoints: number
  }[]
  starters: {
    playerId: string
    position: 'GOL' | 'LAT' | 'ZAG' | 'MEI' | 'ATA'
    isCaptain: boolean
    slotPosition: string
  }[]
}

export async function getLineupData(leagueId: string): Promise<LineupPageData | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  // Fetch league info
  const { data: league } = await supabase
    .from('leagues')
    .select('id, name, season_id')
    .eq('id', leagueId)
    .single()

  if (!league) return null

  // Fetch season info
  const { data: season } = await supabase
    .from('seasons')
    .select('id, current_round')
    .eq('id', league.season_id)
    .single()

  const currentRound = season?.current_round ?? 1

  // Fetch user's team in league
  const { data: team } = await supabase
    .from('fantasy_teams')
    .select('id, name')
    .eq('league_id', leagueId)
    .eq('user_id', user.id)
    .single()

  if (!team) return null

  // Check market lock status
  const lockStatus = await checkRoundLockStatus(league.season_id, currentRound)

  // Fetch user roster players
  const { data: rosterData } = await supabase
    .from('roster_players')
    .select(`
      player:real_players(
        id,
        name,
        position,
        photo_url,
        avg_points,
        club:real_clubs(short_name)
      )
    `)
    .eq('fantasy_team_id', team.id)

  const roster = (rosterData || []).map((r: any) => ({
    id: r.player.id,
    name: r.player.name,
    position: r.player.position,
    clubShortName: r.player.club?.short_name ?? '',
    photoUrl: r.player.photo_url ?? null,
    avgPoints: Number(r.player.avg_points ?? 0),
  }))

  // Fetch existing lineup for current round
  const { data: lineup } = await supabase
    .from('lineups')
    .select(`
      id,
      formation,
      slots:lineup_slots(
        player_id,
        slot_position,
        is_captain,
        is_starter,
        player:real_players(position)
      )
    `)
    .eq('fantasy_team_id', team.id)
    .eq('fixture_round', currentRound)
    .single()

  let formation: Formation = (lineup?.formation as Formation) || '4-3-3'
  let starters: {
    playerId: string
    position: 'GOL' | 'LAT' | 'ZAG' | 'MEI' | 'ATA'
    isCaptain: boolean
    slotPosition: string
  }[] = []

  if (lineup && lineup.slots) {
    starters = lineup.slots
      .filter((s: any) => s.is_starter)
      .map((s: any) => ({
        playerId: s.player_id,
        position: s.player?.position ?? 'MEI',
        isCaptain: s.is_captain ?? false,
        slotPosition: s.slot_position,
      }))
  }

  return {
    leagueId,
    leagueName: league.name,
    teamId: team.id,
    teamName: team.name,
    seasonId: league.season_id,
    currentRound,
    isLocked: lockStatus.isLocked,
    kickoffAt: lockStatus.kickoffAt,
    formation,
    roster,
    starters,
  }
}

export async function saveLineupAction(
  leagueId: string,
  teamId: string,
  fixtureRound: number,
  formation: Formation,
  starters: LineupSlotItem[]
) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) throw new Error('Não autenticado.')

  // Check market lock status
  const { data: league } = await supabase
    .from('leagues')
    .select('season_id')
    .eq('id', leagueId)
    .single()

  if (!league) throw new Error('Liga não encontrada.')

  const lockStatus = await checkRoundLockStatus(league.season_id, fixtureRound)
  if (lockStatus.isLocked) {
    throw new Error('O mercado para esta rodada já está FECHADO. Não é possível alterar a escalação.')
  }

  // Fetch roster player IDs
  const { data: rosterData } = await supabase
    .from('roster_players')
    .select('player_id')
    .eq('fantasy_team_id', teamId)

  const rosterPlayerIds = (rosterData || []).map((r: any) => r.player_id)

  // Validate lineup against formation and rules
  const valResult = validateLineup({
    formation,
    starters,
    rosterPlayerIds,
  })

  if (!valResult.isValid) {
    throw new Error(valResult.errors[0] || 'Escalação inválida.')
  }

  // Upsert lineup record
  const { data: lineup, error: lineupErr } = await supabase
    .from('lineups')
    .upsert(
      {
        fantasy_team_id: teamId,
        fixture_round: fixtureRound,
        formation,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'fantasy_team_id,fixture_round' }
    )
    .select('id')
    .single()

  if (lineupErr || !lineup) {
    console.error('Error saving lineup:', lineupErr)
    throw new Error('Erro ao salvar escalação.')
  }

  // Clear previous lineup_slots for this lineup
  await supabase.from('lineup_slots').delete().eq('lineup_id', lineup.id)

  // Insert new lineup_slots
  const slotRecords = starters.map((s, index) => ({
    lineup_id: lineup.id,
    player_id: s.playerId,
    slot_position: `${s.position}_${index + 1}`,
    is_captain: s.isCaptain,
    is_starter: true,
  }))

  const { error: slotsErr } = await supabase.from('lineup_slots').insert(slotRecords)
  if (slotsErr) {
    console.error('Error saving lineup slots:', slotsErr)
    throw new Error('Erro ao registrar titulares no banco de dados.')
  }

  revalidatePath(`/league/${leagueId}/lineup`)
}
