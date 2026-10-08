'use server'

import { createClient } from '@/lib/supabase/server'
import { validateLineup, sortByPosition, type Formation, type LineupSlotItem } from '@/lib/lineup/lineup-engine'
import {
  checkRoundLockStatus,
  generateAutoFallbackLineup,
  autoCompleteLineup,
  ensureLockedRoundLineups,
} from '@/lib/lineup/lock'
import { revalidatePath } from 'next/cache'

export type OpponentInfo = {
  opponentClubId: string
  opponentName: string
  opponentShortName: string
  opponentLogoUrl: string | null
  isHome: boolean
  label: string
}

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
    clubId: string
    clubShortName: string
    clubLogoUrl: string | null
    photoUrl: string | null
    avgPoints: number
    opponent: OpponentInfo | null
  }[]
  starters: {
    playerId: string
    position: 'GOL' | 'LAT' | 'ZAG' | 'MEI' | 'ATA'
    isCaptain: boolean
    slotPosition: string
  }[]
  reserves: {
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

  // If market is locked, automatically ensure all teams have complete 11 starters
  if (lockStatus.isLocked) {
    await ensureLockedRoundLineups(leagueId, currentRound)
  }

  // Fetch fixtures for current round to determine player opponents
  const { data: fixturesData } = await supabase
    .from('fixtures')
    .select(`
      id,
      home_club_id,
      away_club_id,
      kickoff_at,
      home_club:real_clubs!fixtures_home_club_id_fkey(id, name, short_name, logo_url),
      away_club:real_clubs!fixtures_away_club_id_fkey(id, name, short_name, logo_url)
    `)
    .eq('season_id', league.season_id)
    .eq('round', currentRound)

  const clubOpponentMap = new Map<string, OpponentInfo>()
  for (const f of (fixturesData || []) as any[]) {
    if (f.home_club_id && f.away_club_id) {
      clubOpponentMap.set(f.home_club_id, {
        opponentClubId: f.away_club_id,
        opponentName: f.away_club?.name ?? 'Adversário',
        opponentShortName: f.away_club?.short_name ?? 'ADV',
        opponentLogoUrl: f.away_club?.logo_url ?? null,
        isHome: true,
        label: `vs ${f.away_club?.short_name ?? 'ADV'} (C)`,
      })
      clubOpponentMap.set(f.away_club_id, {
        opponentClubId: f.home_club_id,
        opponentName: f.home_club?.name ?? 'Adversário',
        opponentShortName: f.home_club?.short_name ?? 'ADV',
        opponentLogoUrl: f.home_club?.logo_url ?? null,
        isHome: false,
        label: `vs ${f.home_club?.short_name ?? 'ADV'} (F)`,
      })
    }
  }

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
        club_id,
        club:real_clubs(id, short_name, logo_url)
      )
    `)
    .eq('fantasy_team_id', team.id)

  const roster = (rosterData || []).map((r: any) => {
    const clubId = r.player.club?.id || r.player.club_id
    const opponent = clubId ? clubOpponentMap.get(clubId) ?? null : null

    return {
      id: r.player.id,
      name: r.player.name,
      position: r.player.position,
      clubId: clubId ?? '',
      clubShortName: r.player.club?.short_name ?? '',
      clubLogoUrl: r.player.club?.logo_url ?? null,
      photoUrl: r.player.photo_url ?? null,
      avgPoints: Number(r.player.avg_points ?? 0),
      opponent,
    }
  })

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
  let reserves: {
    playerId: string
    position: 'GOL' | 'LAT' | 'ZAG' | 'MEI' | 'ATA'
    isCaptain: boolean
    slotPosition: string
  }[] = []

  if (lineup && lineup.slots && lineup.slots.length > 0) {
    starters = lineup.slots
      .filter((s: any) => s.is_starter)
      .map((s: any) => ({
        playerId: s.player_id,
        position: s.player?.position ?? 'MEI',
        isCaptain: s.is_captain ?? false,
        slotPosition: s.slot_position,
      }))
    reserves = lineup.slots
      .filter((s: any) => !s.is_starter)
      .map((s: any) => ({
        playerId: s.player_id,
        position: s.player?.position ?? 'MEI',
        isCaptain: false,
        slotPosition: s.slot_position,
      }))
  } else if (roster.length > 0) {
    let prevLineupSlots: any[] | null = null
    let prevFormation: Formation | null = null

    if (currentRound > 1) {
      const { data: prevLineup } = await supabase
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
        .eq('fixture_round', currentRound - 1)
        .maybeSingle()

      if (prevLineup && prevLineup.slots && prevLineup.slots.length > 0) {
        prevLineupSlots = prevLineup.slots
        prevFormation = (prevLineup.formation as Formation) || null
      }
    }

    if (prevLineupSlots && prevLineupSlots.length > 0) {
      const existingStarters = prevLineupSlots
        .filter((s: any) => s.is_starter)
        .map((s: any) => ({
          playerId: s.player_id,
          position: s.player?.position ?? 'MEI',
          isCaptain: s.is_captain ?? false,
        }))
      const existingReserves = prevLineupSlots
        .filter((s: any) => !s.is_starter)
        .map((s: any) => ({
          playerId: s.player_id,
          position: s.player?.position ?? 'MEI',
          isCaptain: false,
        }))

      const completed = autoCompleteLineup(
        roster.map((r) => ({ id: r.id, position: r.position, avgPoints: r.avgPoints })),
        prevFormation || '4-3-3',
        existingStarters,
        existingReserves
      )
      formation = completed.formation
      starters = completed.starters.map((s, idx) => ({
        playerId: s.playerId,
        position: s.position,
        isCaptain: s.isCaptain,
        slotPosition: `${s.position}_${idx + 1}`,
      }))
      reserves = (completed.reserves || []).map((s) => ({
        playerId: s.playerId,
        position: s.position,
        isCaptain: false,
        slotPosition: `RES_${s.position}`,
      }))
    } else {
      // Auto populate top starters and reserves for initial visit
      const fallback = generateAutoFallbackLineup(roster)
      formation = fallback.formation
      starters = fallback.starters.map((s: { playerId: string; position: any; isCaptain: boolean }, idx: number) => ({
        playerId: s.playerId,
        position: s.position,
        isCaptain: s.isCaptain,
        slotPosition: `${s.position}_${idx + 1}`,
      }))
      reserves = (fallback.reserves || []).map((s: { playerId: string; position: any }, idx: number) => ({
        playerId: s.playerId,
        position: s.position,
        isCaptain: false,
        slotPosition: `RES_${s.position}`,
      }))
    }
  }

  starters.sort(sortByPosition)
  reserves.sort(sortByPosition)

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
    reserves,
  }
}

export async function saveLineupAction(
  leagueId: string,
  teamId: string,
  fixtureRound: number,
  formation: Formation,
  starters: LineupSlotItem[],
  reserves: LineupSlotItem[] = []
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
    reserves,
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

  // Insert new lineup_slots (starters + reserves)
  const starterRecords = starters.map((s, index) => ({
    lineup_id: lineup.id,
    player_id: s.playerId,
    slot_position: `${s.position}_${index + 1}`,
    is_captain: s.isCaptain,
    is_starter: true,
  }))

  const reserveRecords = reserves.map((s) => ({
    lineup_id: lineup.id,
    player_id: s.playerId,
    slot_position: `RES_${s.position}`,
    is_captain: false,
    is_starter: false,
  }))

  const { error: slotsErr } = await supabase
    .from('lineup_slots')
    .insert([...starterRecords, ...reserveRecords])

  if (slotsErr) {
    console.error('Error saving lineup slots:', slotsErr)
    throw new Error('Erro ao registrar escalação no banco de dados.')
  }

  revalidatePath(`/league/${leagueId}/lineup`)
}
