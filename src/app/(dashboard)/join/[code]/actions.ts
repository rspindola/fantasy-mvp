'use server'

import { createClient } from '@/lib/supabase/server'
import { joinLeagueSchema } from '@/lib/validations/league'
import { redirect } from 'next/navigation'

export type JoinLeagueState = {
  error?: string
}

export async function getLeagueByInviteCode(inviteCode: string) {
  const supabase = await createClient()

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
      commissioner:profiles!leagues_commissioner_id_fkey(display_name)
    `)
    .eq('invite_code', inviteCode.toUpperCase())
    .single()

  if (error || !league) {
    return null
  }

  // Count registered teams
  const { count } = await supabase
    .from('fantasy_teams')
    .select('id', { count: 'exact', head: true })
    .eq('league_id', league.id)

  // Check if current user already has a team in this league
  const {
    data: { user },
  } = await supabase.auth.getUser()

  let userTeam: { id: string; name: string } | null = null
  if (user) {
    const { data: team } = await supabase
      .from('fantasy_teams')
      .select('id, name')
      .eq('league_id', league.id)
      .eq('user_id', user.id)
      .maybeSingle()

    if (team) {
      userTeam = team
    }
  }

  return {
    id: league.id,
    name: league.name,
    inviteCode: league.invite_code,
    scoringMode: league.scoring_mode,
    draftMode: league.draft_mode,
    teamCap: league.team_cap,
    status: league.status,
    commissionerName: (league.commissioner as any)?.display_name ?? 'Comissário',
    registeredTeams: count || 0,
    userTeam,
  }
}

export async function joinLeagueAction(
  _prevState: JoinLeagueState,
  formData: FormData
): Promise<JoinLeagueState> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const rawCode = (formData.get('inviteCode') as string) ?? ''
  const rawTeamName = (formData.get('teamName') as string) ?? ''

  const parsed = joinLeagueSchema.safeParse({
    inviteCode: rawCode,
    teamName: rawTeamName,
  })

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' }
  }

  const { inviteCode, teamName } = parsed.data

  // 1. Check league existence and status
  const { data: league, error: leagueError } = await supabase
    .from('leagues')
    .select('id, team_cap, status')
    .eq('invite_code', inviteCode)
    .single()

  if (leagueError || !league) {
    return { error: 'Liga não encontrada com este código de convite.' }
  }

  if (league.status !== 'open') {
    return { error: 'Esta liga não está mais aberta para novas inscrições.' }
  }

  // 2. Check if user already has a team in this league
  const { data: existingTeam } = await supabase
    .from('fantasy_teams')
    .select('id')
    .eq('league_id', league.id)
    .eq('user_id', user.id)
    .single()

  if (existingTeam) {
    // User already joined, redirect directly
    redirect(`/league/${league.id}`)
  }

  // 3. Check capacity limit
  const { count: currentCount } = await supabase
    .from('fantasy_teams')
    .select('id', { count: 'exact', head: true })
    .eq('league_id', league.id)

  const registered = currentCount || 0
  if (registered >= league.team_cap) {
    return { error: `Esta liga atingiu o limite máximo de ${league.team_cap} times.` }
  }

  // 4. Verify player catalog capacity ((registered + 1) * 22 <= active players)
  const { count: activePlayers } = await supabase
    .from('real_players')
    .select('id', { count: 'exact', head: true })
    .eq('is_active', true)

  const needed = (registered + 1) * 24
  if (activePlayers && needed > activePlayers) {
    return { error: 'Não há jogadores ativos suficientes no catálogo para adicionar este time.' }
  }

  // 5. Insert fantasy team
  const { error: insertError } = await supabase.from('fantasy_teams').insert({
    league_id: league.id,
    user_id: user.id,
    name: teamName,
  })

  if (insertError) {
    console.error('Error joining league:', insertError)
    return { error: 'Ocorreu um erro ao registrar seu time. Tente novamente.' }
  }

  redirect(`/league/${league.id}`)
}
