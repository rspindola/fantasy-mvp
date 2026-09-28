'use server'

import { createClient } from '@/lib/supabase/server'
import { createLeagueSchema, type CreateLeagueInput } from '@/lib/validations/league'
import { generateInviteCode } from '@/lib/league/invite'
import { redirect } from 'next/navigation'

export type CreateLeagueState = {
  error?: string
  fieldErrors?: Record<string, string[]>
}

export async function createLeagueAction(
  _prevState: CreateLeagueState,
  formData: FormData
): Promise<CreateLeagueState> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const rawInput = {
    name: formData.get('name'),
    teamCap: Number(formData.get('teamCap')),
    scoringMode: formData.get('scoringMode'),
    draftMode: formData.get('draftMode'),
    pickTimerSeconds: Number(formData.get('pickTimerSeconds')),
  }

  const teamName = (formData.get('teamName') as string)?.trim() || 'Meu Time'

  const parsed = createLeagueSchema.safeParse(rawInput)

  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {}
    parsed.error.issues.forEach((err) => {
      const field = err.path[0] as string
      if (field) {
        fieldErrors[field] = fieldErrors[field] || []
        fieldErrors[field].push(err.message)
      }
    })
    return { error: 'Por favor, corrija os erros do formulário.', fieldErrors }
  }

  const { name, teamCap, scoringMode, draftMode, pickTimerSeconds } = parsed.data

  // 1. Fetch active season (Brasileirão 2026)
  const { data: season, error: seasonError } = await supabase
    .from('seasons')
    .select('id')
    .eq('year', 2026)
    .single()

  if (seasonError || !season) {
    return { error: 'Temporada ativa não encontrada. Entre em contato com o suporte.' }
  }

  // 2. Count active players to ensure teamCap * 22 is valid
  const { count: activePlayersCount, error: countError } = await supabase
    .from('real_players')
    .select('id', { count: 'exact', head: true })
    .eq('is_active', true)

  if (countError || !activePlayersCount) {
    return { error: 'Erro ao verificar catálogo de jogadores.' }
  }

  const requiredPlayers = teamCap * 24
  if (requiredPlayers > activePlayersCount) {
    return {
      error: `Não há jogadores suficientes (${activePlayersCount} disponíveis) para ${teamCap} times de 24 jogadores (${requiredPlayers} necessários). Reduza o limite de times.`,
    }
  }

  // 3. Generate unique invite code
  const inviteCode = generateInviteCode()

  // 4. Create league record
  const { data: league, error: createError } = await supabase
    .from('leagues')
    .insert({
      name,
      invite_code: inviteCode,
      scoring_mode: scoringMode,
      draft_mode: draftMode,
      team_cap: teamCap,
      status: 'open',
      season_id: season.id,
      commissioner_id: user.id,
      pick_timer_seconds: pickTimerSeconds,
    })
    .select('id')
    .single()

  if (createError || !league) {
    console.error('Error creating league:', createError)
    return { error: 'Falha ao criar liga no banco de dados. Tente novamente.' }
  }

  // 5. Automatically create commissioner's fantasy team
  const { error: teamError } = await supabase.from('fantasy_teams').insert({
    league_id: league.id,
    user_id: user.id,
    name: teamName,
  })

  if (teamError) {
    console.error('Error creating commissioner team:', teamError)
    return { error: 'Liga criada, mas ocorreu um erro ao registrar seu time.' }
  }

  redirect(`/league/${league.id}`)
}
