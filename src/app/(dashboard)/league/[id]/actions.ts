'use server'

import { createClient } from '@/lib/supabase/server'
import { canStartH2H } from '@/lib/league/h2h-validation'
import { startDraftEngine } from '@/lib/draft/engine'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

import { getChampionshipInfo } from '@/lib/api/championship'

export type LeagueDetails = {
  id: string
  name: string
  inviteCode: string
  scoringMode: 'TOTAL' | 'H2H'
  h2hFormat?: 'SINGLE_ROUND' | 'DOUBLE_ROUND'
  draftMode: 'MANUAL' | 'AUTO' | 'HYBRID'
  teamCap: number
  status: 'open' | 'drafting' | 'active' | 'closed'
  commissionerId: string
  isCommissioner: boolean
  pickTimerSeconds: number
  currentPick: number
  totalPicks: number
  bannerImageUrl: string | null
  championshipName: string | null
  championshipLogoUrl: string | null
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
      h2h_format,
      draft_mode,
      team_cap,
      status,
      commissioner_id,
      pick_timer_seconds,
      current_pick,
      total_picks,
      banner_image_url,
      season:seasons (
        name,
        league_api_id
      )
    `)
    .eq('id', leagueId)
    .single()

  if (error || !league) {
    return null
  }

  // Fetch championship details
  const season = (league as any).season
  const apiId = season?.league_api_id
  let championshipName = season?.name || 'Brasileirão Série A'
  let championshipLogoUrl: string | null = null

  if (apiId) {
    try {
      const info = await getChampionshipInfo(apiId)
      championshipName = info.name
      championshipLogoUrl = info.logoUrl
    } catch {
      // fallback
    }
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
    h2hFormat: (league.h2h_format as any) ?? 'DOUBLE_ROUND',
    draftMode: league.draft_mode as any,
    teamCap: league.team_cap,
    status: league.status as any,
    commissionerId: league.commissioner_id,
    isCommissioner: league.commissioner_id === user.id,
    pickTimerSeconds: league.pick_timer_seconds,
    currentPick: league.current_pick,
    totalPicks: league.total_picks,
    bannerImageUrl: (league as any).banner_image_url || null,
    championshipName,
    championshipLogoUrl,
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
    .select('commissioner_id, status, scoring_mode, h2h_format')
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
    throw new Error('A liga precisa de no mínimo 2 times para iniciar o draft')
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
    const format = (league.h2h_format as any) ?? 'DOUBLE_ROUND'
    if (!canStartH2H(numTeams, remainingRounds, format)) {
      throw new Error(
        `Para um campeonato H2H com ${numTeams} times no formato ${format === 'DOUBLE_ROUND' ? 'Ida e Volta' : 'Turno Único'}, restam apenas ${remainingRounds} rodadas na temporada.`
      )
    }
  }

  // Delegate to draft engine
  await startDraftEngine(leagueId)

  revalidatePath(`/league/${leagueId}`)
  redirect(`/league/${leagueId}/draft`)
}
