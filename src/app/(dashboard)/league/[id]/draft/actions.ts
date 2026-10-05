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
  isCommissioner: boolean
  currentPick: number
  totalPicks: number
  pickTimerSeconds: number
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
    .select('id, name, status, current_pick, total_picks, pick_timer_seconds, commissioner_id, is_paused, draft_started_at')
    .eq('id', leagueId)
    .single()

  if (!league) return null

  // Fetch teams sorted by draft_order
  const { data: teams } = await supabase
    .from('fantasy_teams')
    .select('id, user_id, name, draft_order')
    .eq('league_id', leagueId)
    .order('draft_order', { ascending: true })

  if (!teams || teams.length < 2) return null

  const myTeam = teams.find((t) => t.user_id === user.id)

  // Compute turn team
  const snakeSlots = generateSnakeOrder(
    teams.map((t) => t.id),
    24
  )
  const currentPickNum = league.current_pick ?? 1
  const currentSlot = snakeSlots.find((s) => s.pickNumber === currentPickNum)
  const turnTeam = teams.find((t) => t.id === currentSlot?.fantasyTeamId)

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

  const pickedPlayerIds = new Set((picks || []).map((p: any) => p.player.id))

  // Fetch my roster players
  const myPicks = (picks || []).filter((p: any) => p.team?.name === myTeam?.name)
  const myRoster = myPicks.map((p: any) => ({
    id: p.player.id,
    name: p.player.name,
    position: p.player.position,
    clubShortName: '',
  }))

  // Fetch my wishlist / queue
  let myWishlist: { playerId: string; playerName: string; position: string; priority: number }[] = []
  if (myTeam) {
    const { data: queueData } = await supabase
      .from('draft_queues')
      .select(`
        priority,
        player_id,
        player:real_players(name, position)
      `)
      .eq('fantasy_team_id', myTeam.id)
      .order('priority', { ascending: true })

    if (queueData) {
      myWishlist = queueData
        .filter((q: any) => !pickedPlayerIds.has(q.player_id))
        .map((q: any) => ({
          playerId: q.player_id,
          playerName: q.player?.name ?? 'Jogador',
          position: q.player?.position ?? 'MEI',
          priority: q.priority,
        }))
    }
  }

  // Fetch teams in this league to calculate interest count
  const teamIds = teams.map((t) => t.id)
  const interestMap: Record<string, number> = {}
  if (teamIds.length > 0) {
    const { data: leagueQueues } = await supabase
      .from('draft_queues')
      .select('player_id, fantasy_team_id')
      .in('fantasy_team_id', teamIds)

    for (const q of leagueQueues || []) {
      interestMap[q.player_id] = (interestMap[q.player_id] || 0) + 1
    }
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

  // Fetch available real players from catalog ordered by avg_points desc
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
    .order('avg_points', { ascending: false, nullsFirst: false })
    .limit(1000)

  // Filter out already draft picks and map available
  const availablePlayers = (players || [])
    .filter((p) => !pickedPlayerIds.has(p.id))
    .map((p: any) => ({
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
    }))

  const recentPicks = (picks || []).slice(0, 30).map((p: any) => ({
    pickNumber: p.pick_number,
    round: p.round,
    teamName: p.team?.name ?? 'Time',
    playerName: p.player?.name ?? 'Jogador',
    position: p.player?.position ?? 'MEI',
    isAutoPick: p.is_auto_pick ?? false,
  }))

  const teamMap = new Map(teams.map((t) => [t.id, t]))

  const picksByNumber = new Map(
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

  const draftOrder = teams
    .filter((t) => t.draft_order !== null)
    .sort((a, b) => (a.draft_order ?? 0) - (b.draft_order ?? 0))
    .map((t) => ({
      order: t.draft_order ?? 0,
      teamId: t.id,
      teamName: t.name,
      isMyTeam: t.id === myTeam?.id,
    }))

  const turnStartedAt =
    league.status === 'drafting'
      ? picks && picks.length > 0
        ? picks[0].picked_at
        : league.draft_started_at
      : null

  return {
    leagueId: league.id,
    leagueName: league.name,
    status: league.status,
    isPaused: league.is_paused ?? false,
    isCommissioner: league.commissioner_id === user.id,
    currentPick: currentPickNum,
    totalPicks: league.total_picks,
    pickTimerSeconds: league.pick_timer_seconds,
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

export async function triggerAutoPickAction(leagueId: string) {
  const supabase = await createClient()

  const data = await getDraftRoomData(leagueId)
  if (!data || data.status !== 'drafting' || data.isPaused) return

  // Fetch current turn team's wishlist queue
  const { data: queueData } = await supabase
    .from('draft_queues')
    .select('player_id')
    .eq('fantasy_team_id', data.currentTurnTeamId)
    .order('priority', { ascending: true })

  const queuedPlayerIds = (queueData || []).map((q: any) => q.player_id)

  const candidates = data.availablePlayers.map((p) => ({
    id: p.id,
    name: p.name,
    position: p.position,
    avgPoints: p.avgPoints,
    totalMinutes: p.totalMinutes,
  }))

  const chosen = autoPickPlayer(candidates, data.myRoster, queuedPlayerIds)
  if (chosen) {
    await makePickEngine(leagueId, '', chosen.id, true)
  }
}
