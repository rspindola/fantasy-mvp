'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export type PrepPlayerData = {
  id: string
  name: string
  position: 'GOL' | 'LAT' | 'ZAG' | 'MEI' | 'ATA'
  clubName: string
  clubShortName: string
  logoUrl: string | null
  avgPoints: number
  totalMinutes: number
}

export type WishlistItemData = {
  playerId: string
  playerName: string
  position: 'GOL' | 'LAT' | 'ZAG' | 'MEI' | 'ATA'
  clubShortName: string
  priority: number
}

export type PrepRoomData = {
  leagueId: string
  leagueName: string
  status: string
  myTeamId: string
  myTeamName: string
  availablePlayers: PrepPlayerData[]
  myWishlist: WishlistItemData[]
}

export async function getPrepRoomData(leagueId: string): Promise<PrepRoomData | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  // 1. Fetch league info
  const { data: league } = await supabase
    .from('leagues')
    .select('id, name, status')
    .eq('id', leagueId)
    .single()

  if (!league) return null

  // 2. Fetch current user's team in this league
  const { data: myTeam } = await supabase
    .from('fantasy_teams')
    .select('id, name')
    .eq('league_id', leagueId)
    .eq('user_id', user.id)
    .single()

  if (!myTeam) return null

  // 3. Fetch user's current wishlist / queue
  const { data: queueData } = await supabase
    .from('draft_queues')
    .select(`
      priority,
      player_id,
      player:real_players(
        id,
        name,
        position,
        club:real_clubs(short_name)
      )
    `)
    .eq('fantasy_team_id', myTeam.id)
    .order('priority', { ascending: true })

  const myWishlist: WishlistItemData[] = (queueData || []).map((q: any) => ({
    playerId: q.player_id,
    playerName: q.player?.name ?? 'Jogador',
    position: (q.player?.position as any) ?? 'MEI',
    clubShortName: q.player?.club?.short_name ?? '',
    priority: q.priority,
  }))

  // 4. Fetch available active real players ordered by avg_points desc
  const { data: players } = await supabase
    .from('real_players')
    .select(`
      id,
      name,
      position,
      avg_points,
      total_minutes,
      club:real_clubs(name, short_name, logo_url)
    `)
    .eq('is_active', true)
    .order('avg_points', { ascending: false, nullsFirst: false })
    .limit(1000)

  const availablePlayers: PrepPlayerData[] = (players || []).map((p: any) => ({
    id: p.id,
    name: p.name,
    position: p.position as any,
    clubName: p.club?.name ?? '',
    clubShortName: p.club?.short_name ?? '',
    logoUrl: p.club?.logo_url ?? null,
    avgPoints: Number(p.avg_points ?? 0),
    totalMinutes: p.total_minutes ?? 0,
  }))

  return {
    leagueId: league.id,
    leagueName: league.name,
    status: league.status,
    myTeamId: myTeam.id,
    myTeamName: myTeam.name,
    availablePlayers,
    myWishlist,
  }
}

export async function addToWishlistAction(fantasyTeamId: string, playerId: string) {
  const supabase = await createClient()

  // Get current max priority for this team
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
  direction: 'UP' | 'DOWN'
) {
  const supabase = await createClient()

  const { data: queue } = await supabase
    .from('draft_queues')
    .select('id, player_id, priority')
    .eq('fantasy_team_id', fantasyTeamId)
    .order('priority', { ascending: true })

  if (!queue || queue.length < 2) return

  const currentIndex = queue.findIndex((q) => q.player_id === playerId)
  if (currentIndex === -1) return

  const targetIndex = direction === 'UP' ? currentIndex - 1 : currentIndex + 1
  if (targetIndex < 0 || targetIndex >= queue.length) return

  const currentItem = queue[currentIndex]
  const targetItem = queue[targetIndex]

  // Swap their priorities
  await supabase
    .from('draft_queues')
    .update({ priority: targetItem.priority })
    .eq('id', currentItem.id)

  await supabase
    .from('draft_queues')
    .update({ priority: currentItem.priority })
    .eq('id', targetItem.id)

  revalidatePath('/league')
}
