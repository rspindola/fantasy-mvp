'use server'

import { createClient } from '@/lib/supabase/server'
import { canStartH2H } from '@/lib/league/h2h-validation'
import { startDraftEngine } from '@/lib/draft/engine'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

export type LeagueDetails = {
  id: string
  name: string
  inviteCode: string
  scoringMode: 'TOTAL' | 'H2H'
  draftMode: 'MANUAL' | 'AUTO' | 'HYBRID'
  teamCap: number
  status: 'open' | 'drafting' | 'active' | 'closed'
  commissionerId: string
  isCommissioner: boolean
  pickTimerSeconds: number
  currentPick: number
  totalPicks: number
  teams: {
    id: string
    name: string
    userId: string
    displayName: string
    isMe: boolean
  }[]
}

export async function getLeagueDetails(leagueId: string): Promise<LeagueDetails | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: league, error } = await supabase
    .from('leagues')
    .select(`
      id,
      name,
      invite_code,
      scoring_mode,
      draft_mode,
      team_cap,
      status,
      commissioner_id,
      pick_timer_seconds,
      current_pick,
      total_picks
    `)
    .eq('id', leagueId)
    .single()

  if (error || !league) {
    return null
  }

  // Fetch teams in this league
  const { data: teamsData, error: teamsError } = await supabase
    .from('fantasy_teams')
    .select(`
      id,
      name,
      user_id,
      profile:profiles!fantasy_teams_user_id_fkey(display_name)
    `)
    .eq('league_id', leagueId)
    .order('created_at', { ascending: true })

  if (teamsError) {
    console.error('Error fetching league teams:', teamsError)
  }

  const teams = (teamsData || []).map((t: any) => ({
    id: t.id,
    name: t.name,
    userId: t.user_id,
    displayName: t.profile?.display_name ?? 'Jogador',
    isMe: t.user_id === user.id,
  }))

  return {
    id: league.id,
    name: league.name,
    inviteCode: league.invite_code,
    scoringMode: league.scoring_mode as any,
    draftMode: league.draft_mode as any,
    teamCap: league.team_cap,
    status: league.status as any,
    commissionerId: league.commissioner_id,
    isCommissioner: league.commissioner_id === user.id,
    pickTimerSeconds: league.pick_timer_seconds,
    currentPick: league.current_pick,
    totalPicks: league.total_picks,
    teams,
  }
}

export async function startDraftAction(leagueId: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('Não autenticado')
  }

  // Fetch league to verify commissioner
  const { data: league } = await supabase
    .from('leagues')
    .select('commissioner_id, status, scoring_mode')
    .eq('id', leagueId)
    .single()

  if (!league) throw new Error('Liga não encontrada')
  if (league.commissioner_id !== user.id) {
    throw new Error('Apenas o comissário pode iniciar o draft')
  }
  if (league.status !== 'open') {
    throw new Error('Draft já foi iniciado ou encerrado')
  }

  // Count teams
  const { count: teamCount } = await supabase
    .from('fantasy_teams')
    .select('id', { count: 'exact', head: true })
    .eq('league_id', leagueId)

  const numTeams = teamCount || 0
  if (numTeams < 2) {
    throw new Error('A liga precisa de no mínimo 2 teams para iniciar o draft')
  }

  // Validate H2H rounds if applicable
  if (league.scoring_mode === 'H2H') {
    // Get total remaining rounds in season 2026
    const { data: season } = await supabase
      .from('seasons')
      .select('current_round, total_rounds')
      .eq('year', 2026)
      .single()

    const remainingRounds = (season?.total_rounds ?? 38) - (season?.current_round ?? 1) + 1
    if (!canStartH2H(numTeams, remainingRounds)) {
      throw new Error(
        `Para um campeonato H2H com ${numTeams} times, são necessárias ${numTeams % 2 === 0 ? numTeams - 1 : numTeams} rodadas. Restam apenas ${remainingRounds} rodadas na temporada.`
      )
    }
  }

  // Delegate to draft engine
  await startDraftEngine(leagueId)

  revalidatePath(`/league/${leagueId}`)
  redirect(`/league/${leagueId}/draft`)
}
