'use server'

import { createClient } from '@/lib/supabase/server'
import { makePickEngine, toggleDraftPauseEngine, startDraftEngine } from '@/lib/draft/engine'
import { generateSnakeOrder } from '@/lib/draft/snake-order'
import { autoPickPlayer } from '@/lib/draft/auto-pick'
import { revalidatePath } from 'next/cache'

export type DraftStateData = {
  leagueId: string
  leagueName: string
  status: string
  isPaused: boolean
  pausedRemainingSeconds?: number | null
  isCommissioner: boolean
  currentPick: number
  totalPicks: number
  pickTimerSeconds: number
  draftMode: 'MANUAL' | 'AUTO' | 'HYBRID'
  turnStartedAt: string | null
  myTeamId: string | null
  currentTurnTeamId: string
  currentTurnTeamName: string
  isMyTurn: boolean
  draftOrder: {
    order: number
    teamId: string
    teamName: string
    isMyTeam: boolean
  }[]
  upcomingPicks: {
    pickNumber: number
    round: number
    teamId: string
    teamName: string
    isMyTurn: boolean
  }[]
  allPicks: {
    pickNumber: number
    round: number
    teamId: string
    teamName: string
    isMyTurn: boolean
    playerName?: string
    playerPosition?: string
  }[]
  clubs: {
    id: string
    name: string
    shortName: string
    logoUrl: string | null
  }[]
  availablePlayers: {
    id: string
    name: string
    position: 'GOL' | 'LAT' | 'ZAG' | 'MEI' | 'ATA'
    clubId: string
    clubName: string
    clubShortName: string
    clubLogoUrl: string | null
    photoUrl: string | null
    avgPoints: number
    totalMinutes: number
    interestCount: number
    isPicked: boolean
    pickedByTeam: string | null
    pickedRound: number | null
    pickedNumber: number | null
  }[]
  myRoster: {
    id: string
    name: string
    position: 'GOL' | 'LAT' | 'ZAG' | 'MEI' | 'ATA'
    clubShortName: string
  }[]
  myWishlist: {
    playerId: string
    playerName: string
    position: string
    clubShortName?: string
    priority: number
  }[]
  recentPicks: {
    pickNumber: number
    round: number
    teamName: string
    playerName: string
    position: string
    isAutoPick: boolean
  }[]
  nextAutoPick?: {
    playerId: string
    playerName: string
    position: 'GOL' | 'LAT' | 'ZAG' | 'MEI' | 'ATA'
    clubName: string
    clubShortName: string
    source: 'wishlist' | 'auto_rank'
    wishlistPriority?: number
  } | null
  allTeamQueues?: {
    teamId: string
    teamName: string
    queue: {
      playerId: string
      playerName: string
      position: string
      clubShortName: string
      priority: number
      isAvailable: boolean
    }[]
  }[]
}

export async function getDraftRoomData(leagueId: string): Promise<DraftStateData | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  // Fetch league info
  const { data: league } = await supabase
    .from('leagues')
    .select('id, name, status, current_pick, total_picks, pick_timer_seconds, draft_mode, commissioner_id, is_paused, draft_started_at, turn_started_at, paused_remaining_seconds')
    .eq('id', leagueId)
    .single()

  if (!league) return null

  // Auto-pick catchup if HYBRID or AUTO and turn expired
  if (
    league.status === 'drafting' &&
    !league.is_paused &&
    (league.draft_mode === 'HYBRID' || league.draft_mode === 'AUTO') &&
    league.turn_started_at
  ) {
    let currentTurnStartedAt = league.turn_started_at
    let curPick = league.current_pick ?? 1
    let safetyCounter = 5

    while (
      safetyCounter > 0 &&
      currentTurnStartedAt &&
      curPick <= league.total_picks
    ) {
      const elapsedSec = (Date.now() - new Date(currentTurnStartedAt).getTime()) / 1000
      if (elapsedSec < league.pick_timer_seconds) {
        break
      }

      const didPick = await executeAutoPickInternal(supabase, leagueId)
      safetyCounter--
      if (!didPick) break

      const { data: refreshed } = await supabase
        .from('leagues')
        .select('id, name, status, current_pick, total_picks, pick_timer_seconds, draft_mode, commissioner_id, is_paused, draft_started_at, turn_started_at, paused_remaining_seconds')
        .eq('id', leagueId)
        .single()

      if (!refreshed || refreshed.current_pick === curPick) break
      Object.assign(league, refreshed)
      currentTurnStartedAt = refreshed.turn_started_at
      curPick = refreshed.current_pick ?? 1
    }
  }

  // Fetch teams sorted by draft_order
  const { data: teams } = await supabase
    .from('fantasy_teams')
    .select('id, user_id, name, draft_order')
    .eq('league_id', leagueId)
    .order('draft_order', { ascending: true })

  if (!teams || teams.length < 2) return null

  const myTeam = (teams as any[]).find((t: any) => t.user_id === user.id)

  // Fetch draft picks already made in this league
  const { data: picks } = await supabase
    .from('draft_picks')
    .select(`
      pick_number,
      round,
      is_auto_pick,
      picked_at,
      team:fantasy_teams(name),
      player:real_players(id, name, position)
    `)
    .eq('league_id', leagueId)
    .order('pick_number', { ascending: false })

  const maxCompletedPick =
    picks && picks.length > 0
      ? Math.max(...picks.map((p: any) => p.pick_number))
      : 0
  const currentPickNum = Math.max(league.current_pick ?? 1, maxCompletedPick + 1)

  // Compute turn team
  const snakeSlots = generateSnakeOrder(
    (teams as any[]).map((t: any) => t.id),
    24
  )
  const currentSlot = snakeSlots.find((s) => s.pickNumber === currentPickNum)
  const turnTeam = (teams as any[]).find((t: any) => t.id === currentSlot?.fantasyTeamId)

  const pickedPlayerIds = new Set((picks || []).map((p: any) => p.player?.id).filter(Boolean))

  // Fetch my roster players
  const myPicks = (picks || []).filter((p: any) => p.team?.name === myTeam?.name)
  const myRoster = myPicks
    .filter((p: any) => p.player)
    .map((p: any) => ({
      id: p.player.id,
      name: p.player.name,
      position: p.player.position,
      clubShortName: '',
    }))

  // Fetch teams in this league to calculate interest count and pre-draft queues
  const teamIds = (teams as any[]).map((t: any) => t.id)
  const interestMap: Record<string, number> = {}
  let leagueQueues: any[] = []

  if (teamIds.length > 0) {
    const { data: qData } = await supabase
      .from('draft_queues')
      .select(`
        id,
        priority,
        player_id,
        fantasy_team_id,
        player:real_players(
          id,
          name,
          position,
          club:real_clubs(name, short_name)
        )
      `)
      .in('fantasy_team_id', teamIds)
      .order('priority', { ascending: true })

    leagueQueues = qData || []

    for (const q of leagueQueues) {
      interestMap[q.player_id] = (interestMap[q.player_id] || 0) + 1
    }
  }

  // Fetch my wishlist / queue
  let myWishlist: {
    playerId: string
    playerName: string
    position: string
    clubShortName?: string
    priority: number
  }[] = []
  if (myTeam) {
    myWishlist = leagueQueues
      .filter((q: any) => q.fantasy_team_id === myTeam.id && !pickedPlayerIds.has(q.player_id))
      .sort((a: any, b: any) => (a.priority ?? 0) - (b.priority ?? 0))
      .map((q: any) => {
        const p = Array.isArray(q.player) ? q.player[0] : q.player
        const club = Array.isArray(p?.club) ? p?.club[0] : p?.club
        return {
          playerId: q.player_id,
          playerName: p?.name ?? 'Jogador',
          position: p?.position ?? 'MEI',
          clubShortName: club?.short_name ?? '',
          priority: q.priority,
        }
      })
  }

  // Fetch clubs for filter
  const { data: clubsData } = await supabase
    .from('real_clubs')
    .select('id, name, short_name, logo_url')
    .order('name', { ascending: true })

  const clubs = (clubsData || []).map((c: any) => ({
    id: c.id,
    name: c.name,
    shortName: c.short_name,
    logoUrl: c.logo_url ?? null,
  }))

  // Fetch available real players from catalog ordered alphabetically by name
  const { data: players } = await supabase
    .from('real_players')
    .select(`
      id,
      name,
      position,
      photo_url,
      avg_points,
      total_minutes,
      club_id,
      club:real_clubs(id, name, short_name, logo_url)
    `)
    .eq('is_active', true)
    .order('name', { ascending: true })
    .limit(1000)

  // Build a lookup map of all completed picks for quick player metadata
  const pickByPlayerId = new Map<
    string,
    {
      teamName: string
      round: number
      pickNumber: number
    }
  >()

  for (const p of (picks || []) as any[]) {
    const playerId = Array.isArray(p.player) ? p.player[0]?.id : p.player?.id
    const teamName = Array.isArray(p.team) ? p.team[0]?.name : p.team?.name
    if (playerId) {
      pickByPlayerId.set(playerId, {
        teamName: teamName ?? 'Time',
        round: p.round,
        pickNumber: p.pick_number,
      })
    }
  }

  // Map all players including drafted status and team/round details
  const availablePlayers = (players || []).map((p: any) => {
    const pickInfo = pickByPlayerId.get(p.id)
    return {
      id: p.id,
      name: p.name,
      position: p.position as any,
      clubId: p.club?.id ?? p.club_id ?? '',
      clubName: p.club?.name ?? '',
      clubShortName: p.club?.short_name ?? '',
      clubLogoUrl: p.club?.logo_url ?? null,
      photoUrl: p.photo_url ?? null,
      avgPoints: Number(p.avg_points ?? 0),
      totalMinutes: p.total_minutes ?? 0,
      interestCount: interestMap[p.id] ?? 0,
      isPicked: !!pickInfo,
      pickedByTeam: pickInfo?.teamName ?? null,
      pickedRound: pickInfo?.round ?? null,
      pickedNumber: pickInfo?.pickNumber ?? null,
    }
  })

  // Map all completed picks ordered from oldest to newest (pick #1, #2, ...)
  const recentPicks = (picks || [])
    .slice()
    .sort((a: any, b: any) => a.pick_number - b.pick_number)
    .map((p: any) => ({
      pickNumber: p.pick_number,
      round: p.round,
      teamName: p.team?.name ?? 'Time',
      playerName: p.player?.name ?? 'Jogador',
      position: p.player?.position ?? 'MEI',
      isAutoPick: p.is_auto_pick ?? false,
    }))

  const teamMap = new Map<string, any>((teams as any[]).map((t: any) => [t.id, t]))

  const picksByNumber = new Map<number, { playerName?: string; playerPosition?: string }>(
    (picks || []).map((p: any) => [
      p.pick_number,
      {
        playerName: p.player?.name,
        playerPosition: p.player?.position,
      },
    ])
  )

  const allPicks = snakeSlots.map((s) => {
    const t = teamMap.get(s.fantasyTeamId)
    const picked = picksByNumber.get(s.pickNumber)
    return {
      pickNumber: s.pickNumber,
      round: s.round,
      teamId: s.fantasyTeamId,
      teamName: t?.name ?? 'Time',
      isMyTurn: s.fantasyTeamId === myTeam?.id,
      playerName: picked?.playerName,
      playerPosition: picked?.playerPosition,
    }
  })

  const upcomingPicks = allPicks.filter(
    (s) => s.pickNumber >= currentPickNum && s.pickNumber < currentPickNum + 10
  )

  const draftOrder = (teams as any[])
    .filter((t: any) => t.draft_order !== null)
    .sort((a: any, b: any) => (a.draft_order ?? 0) - (b.draft_order ?? 0))
    .map((t: any) => ({
      order: t.draft_order ?? 0,
      teamId: t.id,
      teamName: t.name,
      isMyTeam: t.id === myTeam?.id,
    }))

  const turnStartedAt =
    league.status === 'drafting'
      ? league.turn_started_at ||
        (picks && picks.length > 0 ? picks[0].picked_at : league.draft_started_at)
      : null

  const isCommissioner = league.commissioner_id === user.id

  // Compute next auto-pick player for the team currently on the clock (only for commissioner)
  let nextAutoPick: DraftStateData['nextAutoPick'] = null
  if (isCommissioner && turnTeam && league.status === 'drafting') {
    const turnTeamQueues = leagueQueues
      .filter((q: any) => q.fantasy_team_id === turnTeam.id)
      .sort((a: any, b: any) => a.priority - b.priority)
    const turnQueuedPlayerIds = turnTeamQueues.map((q: any) => q.player_id)

    // Current roster of the turn team
    const turnTeamPicks = (picks || []).filter(
      (p: any) => (Array.isArray(p.team) ? p.team[0]?.name : p.team?.name) === turnTeam.name
    )
    const turnTeamRoster = turnTeamPicks
      .filter((p: any) => p.player)
      .map((p: any) => ({
        position: (Array.isArray(p.player) ? p.player[0]?.position : p.player?.position) as any,
      }))

    const candidates = availablePlayers
      .filter((p: any) => !p.isPicked)
      .map((p: any) => ({
        id: p.id,
        name: p.name,
        position: p.position,
        avgPoints: p.avgPoints,
        totalMinutes: p.totalMinutes,
      }))

    const chosen = autoPickPlayer(candidates, turnTeamRoster, turnQueuedPlayerIds)
    if (chosen) {
      const isFromQueue = turnQueuedPlayerIds.includes(chosen.id)
      const qIndex = turnQueuedPlayerIds.indexOf(chosen.id)
      const chosenPlayerMeta = availablePlayers.find((p: any) => p.id === chosen.id)

      nextAutoPick = {
        playerId: chosen.id,
        playerName: chosen.name,
        position: chosen.position,
        clubName: chosenPlayerMeta?.clubName ?? '',
        clubShortName: chosenPlayerMeta?.clubShortName ?? '',
        source: isFromQueue ? 'wishlist' : 'auto_rank',
        wishlistPriority: isFromQueue && qIndex >= 0 ? qIndex + 1 : undefined,
      }
    }
  }

  // Pre-draft queues of all teams (accessible to commissioner)
  const allTeamQueues = isCommissioner
    ? (teams as any[]).map((t: any) => {
        const teamQueues = leagueQueues
          .filter((q: any) => q.fantasy_team_id === t.id)
          .sort((a: any, b: any) => a.priority - b.priority)
        return {
          teamId: t.id,
          teamName: t.name,
          queue: teamQueues.map((q: any) => {
            const p = Array.isArray(q.player) ? q.player[0] : q.player
            const club = Array.isArray(p?.club) ? p?.club[0] : p?.club
            const isPicked = pickedPlayerIds.has(q.player_id)
            return {
              playerId: q.player_id,
              playerName: p?.name ?? 'Jogador',
              position: p?.position ?? 'MEI',
              clubShortName: club?.short_name ?? '',
              priority: q.priority,
              isAvailable: !isPicked,
            }
          }),
        }
      })
    : []

  return {
    leagueId: league.id,
    leagueName: league.name,
    status: league.status,
    isPaused: league.is_paused ?? false,
    pausedRemainingSeconds: league.paused_remaining_seconds ?? null,
    isCommissioner,
    currentPick: currentPickNum,
    totalPicks: league.total_picks,
    pickTimerSeconds: league.pick_timer_seconds,
    draftMode: (league.draft_mode as 'MANUAL' | 'AUTO' | 'HYBRID') ?? 'MANUAL',
    turnStartedAt,
    myTeamId: myTeam?.id ?? null,
    currentTurnTeamId: turnTeam?.id ?? '',
    currentTurnTeamName: turnTeam?.name ?? 'Aguardando',
    isMyTurn: turnTeam?.id === myTeam?.id,
    draftOrder,
    upcomingPicks,
    allPicks,
    clubs,
    availablePlayers,
    myRoster,
    myWishlist,
    recentPicks,
    nextAutoPick,
    allTeamQueues,
  }
}

export async function startDraftFromRoomAction(leagueId: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) throw new Error('Não autenticado')

  const { data: league } = await supabase
    .from('leagues')
    .select('commissioner_id, status')
    .eq('id', leagueId)
    .single()

  if (!league) throw new Error('Liga não encontrada')
  if (league.commissioner_id !== user.id) {
    throw new Error('Apenas o comissário pode iniciar o draft')
  }

  await startDraftEngine(leagueId)
  revalidatePath(`/league/${leagueId}/draft`)
}

export async function submitPickAction(leagueId: string, playerId: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) throw new Error('Não autenticado')

  await makePickEngine(leagueId, user.id, playerId, false)
}

export async function toggleDraftPauseAction(leagueId: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) throw new Error('Não autenticado')

  await toggleDraftPauseEngine(leagueId, user.id)
  revalidatePath(`/league/${leagueId}/draft`)
}

export async function addToWishlistAction(fantasyTeamId: string, playerId: string) {
  const supabase = await createClient()

  // Get current max priority
  const { data: current } = await supabase
    .from('draft_queues')
    .select('priority')
    .eq('fantasy_team_id', fantasyTeamId)
    .order('priority', { ascending: false })
    .limit(1)

  const nextPriority = (current?.[0]?.priority ?? 0) + 1

  await supabase.from('draft_queues').insert({
    fantasy_team_id: fantasyTeamId,
    player_id: playerId,
    priority: nextPriority,
  })

  revalidatePath('/league')
}

export async function removeFromWishlistAction(fantasyTeamId: string, playerId: string) {
  const supabase = await createClient()

  await supabase
    .from('draft_queues')
    .delete()
    .eq('fantasy_team_id', fantasyTeamId)
    .eq('player_id', playerId)

  revalidatePath('/league')
}

export async function moveWishlistPriorityAction(
  fantasyTeamId: string,
  playerId: string,
  direction: 'UP' | 'DOWN' | 'TOP'
) {
  const supabase = await createClient()

  const { data: queue } = await supabase
    .from('draft_queues')
    .select('id, player_id, priority')
    .eq('fantasy_team_id', fantasyTeamId)
    .order('priority', { ascending: true })

  if (!queue || queue.length < 2) return

  // Normalize list with 1-indexed order
  const normalized = queue.map((item: any, idx: number) => ({
    ...item,
    normPriority: idx + 1,
  }))

  const currentIndex = normalized.findIndex((q: any) => q.player_id === playerId)
  if (currentIndex === -1) return

  let targetIndex: number
  if (direction === 'UP') {
    targetIndex = currentIndex - 1
  } else if (direction === 'DOWN') {
    targetIndex = currentIndex + 1
  } else {
    targetIndex = 0
  }

  if (targetIndex < 0 || targetIndex >= normalized.length || targetIndex === currentIndex) return

  const [moved] = normalized.splice(currentIndex, 1)
  normalized.splice(targetIndex, 0, moved)

  await Promise.all(
    normalized.map((item: any, idx: number) => {
      const newPriority = idx + 1
      if (item.priority !== newPriority) {
        return supabase
          .from('draft_queues')
          .update({ priority: newPriority })
          .eq('id', item.id)
      }
      return Promise.resolve()
    })
  )

  revalidatePath('/league')
}

export async function reorderWishlistAction(
  fantasyTeamId: string,
  playerIdsInOrder: string[]
) {
  const supabase = await createClient()

  await Promise.all(
    playerIdsInOrder.map((playerId, idx) =>
      supabase
        .from('draft_queues')
        .update({ priority: idx + 1 })
        .eq('fantasy_team_id', fantasyTeamId)
        .eq('player_id', playerId)
    )
  )

  revalidatePath('/league')
}

export async function executeAutoPickInternal(supabase: any, leagueId: string): Promise<boolean> {
  // 1. Fetch league
  const { data: league } = await supabase
    .from('leagues')
    .select('id, status, current_pick, total_picks, is_paused')
    .eq('id', leagueId)
    .single()

  if (!league || league.status !== 'drafting' || league.is_paused) return false

  // 2. Fetch teams sorted by draft_order
  const { data: teams } = await supabase
    .from('fantasy_teams')
    .select('id, name, draft_order')
    .eq('league_id', leagueId)
    .order('draft_order', { ascending: true })

  if (!teams || teams.length < 2) return false

  // Check latest completed pick
  const { data: latestPick } = await supabase
    .from('draft_picks')
    .select('pick_number')
    .eq('league_id', leagueId)
    .order('pick_number', { ascending: false })
    .limit(1)
    .maybeSingle()

  const maxCompleted = latestPick?.pick_number ?? 0
  const currentPickNum = Math.max(league.current_pick ?? 1, maxCompleted + 1)
  if (currentPickNum > league.total_picks) return false

  // Determine current slot
  const teamIds = teams.map((t: any) => t.id)
  const snakeSlots = generateSnakeOrder(teamIds, 24)
  const currentSlot = snakeSlots.find((s) => s.pickNumber === currentPickNum)
  if (!currentSlot) return false

  const turnTeamId = currentSlot.fantasyTeamId

  // 3. Fetch current team's queue
  const { data: queueData } = await supabase
    .from('draft_queues')
    .select('player_id')
    .eq('fantasy_team_id', turnTeamId)
    .order('priority', { ascending: true })

  const queuedPlayerIds = (queueData || []).map((q: any) => q.player_id)

  // 4. Fetch current team's roster
  const { data: turnTeamPicks } = await supabase
    .from('draft_picks')
    .select('player:real_players(id, name, position)')
    .eq('league_id', leagueId)
    .eq('fantasy_team_id', turnTeamId)

  const turnTeamRoster = (turnTeamPicks || [])
    .filter((p: any) => p.player)
    .map((p: any) => ({
      id: p.player.id,
      name: p.player.name,
      position: p.player.position,
      clubShortName: '',
    }))

  // 5. Fetch already picked player IDs in this league
  const { data: allPicks } = await supabase
    .from('draft_picks')
    .select('player_id')
    .eq('league_id', leagueId)

  const pickedPlayerIds = new Set((allPicks || []).map((p: any) => p.player_id))

  // 6. Fetch unpicked active players
  const { data: allPlayers } = await supabase
    .from('real_players')
    .select('id, name, position, is_active')
    .eq('is_active', true)

  const unpickedPlayers = (allPlayers || []).filter((p: any) => !pickedPlayerIds.has(p.id))

  // Fetch season stats for unpicked players
  const unpickedIds = unpickedPlayers.map((p: any) => p.id)
  const statsMap: Record<string, { avgPoints: number; totalMinutes: number }> = {}

  if (unpickedIds.length > 0) {
    const { data: statsRows } = await supabase
      .from('player_season_stats')
      .select('player_id, avg_points, total_minutes')
      .in('player_id', unpickedIds)

    for (const row of statsRows || []) {
      statsMap[row.player_id] = {
        avgPoints: Number(row.avg_points ?? 0),
        totalMinutes: Number(row.total_minutes ?? 0),
      }
    }
  }

  const candidates = unpickedPlayers.map((p: any) => ({
    id: p.id,
    name: p.name,
    position: p.position as any,
    avgPoints: statsMap[p.id]?.avgPoints ?? 0,
    totalMinutes: statsMap[p.id]?.totalMinutes ?? 0,
  }))

  const chosen = autoPickPlayer(candidates, turnTeamRoster, queuedPlayerIds)
  if (chosen) {
    await makePickEngine(leagueId, '', chosen.id, true)
    return true
  }

  return false
}

export async function triggerAutoPickAction(leagueId: string) {
  try {
    const supabase = await createClient()
    await executeAutoPickInternal(supabase, leagueId)
  } catch (err: any) {
    console.error('[triggerAutoPickAction] Error executing auto-pick:', err?.message || err)
  }
}
