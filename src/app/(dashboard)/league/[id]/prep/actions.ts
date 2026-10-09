'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export type PrepClubData = {
  id: string
  name: string
  shortName: string
  logoUrl: string | null
}

export type PrepPlayerData = {
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
}

export type WishlistItemData = {
  playerId: string
  playerName: string
  position: 'GOL' | 'LAT' | 'ZAG' | 'MEI' | 'ATA'
  clubShortName: string
  clubLogoUrl: string | null
  photoUrl: string | null
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
  clubs: PrepClubData[]
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

  // 3. Fetch all teams in this league to calculate interest count
  const { data: leagueTeams } = await supabase
    .from('fantasy_teams')
    .select('id')
    .eq('league_id', leagueId)

  const teamIds = (leagueTeams || []).map((t: any) => t.id)

  // 4. Fetch all draft queues for this league
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

  // 5. Fetch user's current wishlist / queue
  const { data: queueData } = await supabase
    .from('draft_queues')
    .select(`
      priority,
      player_id,
      player:real_players(
        id,
        name,
        position,
        photo_url,
        club:real_clubs(short_name, logo_url)
      )
    `)
    .eq('fantasy_team_id', myTeam.id)
    .order('priority', { ascending: true })

  const myWishlist: WishlistItemData[] = (queueData || []).map((q: any) => ({
    playerId: q.player_id,
    playerName: q.player?.name ?? 'Jogador',
    position: (q.player?.position as any) ?? 'MEI',
    clubShortName: q.player?.club?.short_name ?? '',
    clubLogoUrl: q.player?.club?.logo_url ?? null,
    photoUrl: q.player?.photo_url ?? null,
    priority: q.priority,
  }))

  // 6. Fetch clubs for filter
  const { data: clubsData } = await supabase
    .from('real_clubs')
    .select('id, name, short_name, logo_url')
    .order('name', { ascending: true })

  const clubs: PrepClubData[] = (clubsData || []).map((c: any) => ({
    id: c.id,
    name: c.name,
    shortName: c.short_name,
    logoUrl: c.logo_url ?? null,
  }))

  // 7. Fetch available active real players ordered by avg_points desc
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

  const availablePlayers: PrepPlayerData[] = (players || []).map((p: any) => ({
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

  return {
    leagueId: league.id,
    leagueName: league.name,
    status: league.status,
    myTeamId: myTeam.id,
    myTeamName: myTeam.name,
    availablePlayers,
    myWishlist,
    clubs,
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

  const currentIndex = (queue as any[]).findIndex((q: any) => q.player_id === playerId)
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
