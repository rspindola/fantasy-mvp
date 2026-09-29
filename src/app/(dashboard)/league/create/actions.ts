'use server'

import { createClient } from '@/lib/supabase/server'
import { createLeagueSchema, type CreateLeagueInput } from '@/lib/validations/league'
import { generateInviteCode } from '@/lib/league/invite'
import { canStartH2H, h2hRoundsNeeded, type H2HFormat } from '@/lib/league/h2h-validation'
import { redirect } from 'next/navigation'

export type CreateLeagueState = {
  error?: string
  fieldErrors?: Record<string, string[]>
}

export type SeasonInfo = {
  currentRound: number
  totalRounds: number
  remainingRounds: number
}

export async function getSeasonInfoAction(): Promise<SeasonInfo> {
  const supabase = await createClient()
  const { data: season } = await supabase
    .from('seasons')
    .select('current_round, total_rounds')
    .eq('year', 2026)
    .single()

  const currentRound = season?.current_round ?? 1
  const totalRounds = season?.total_rounds ?? 38
  const remainingRounds = Math.max(0, totalRounds - currentRound + 1)

  return {
    currentRound,
    totalRounds,
    remainingRounds,
  }
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
    h2hFormat: formData.get('h2hFormat') || 'DOUBLE_ROUND',
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

  const { name, teamCap, scoringMode, h2hFormat, draftMode, pickTimerSeconds } = parsed.data

  // 1. Fetch active season (Brasileirão 2026)
  const { data: season, error: seasonError } = await supabase
    .from('seasons')
    .select('id, current_round, total_rounds')
    .eq('year', 2026)
    .single()

  if (seasonError || !season) {
    return { error: 'Temporada ativa não encontrada. Entre em contato com o suporte.' }
  }

  const currentRound = season.current_round ?? 1
  const totalRounds = season.total_rounds ?? 38
  const remainingRounds = Math.max(0, totalRounds - currentRound + 1)

  // 2. Validate H2H duration against remaining rounds
  if (scoringMode === 'H2H') {
    const needed = h2hRoundsNeeded(teamCap, h2hFormat)
    if (!canStartH2H(teamCap, remainingRounds, h2hFormat)) {
      const formatLabel =
        h2hFormat === 'DOUBLE_ROUND' ? 'Ida e Volta (Turno e Returno)' : 'Turno Único'
      return {
        error: `Não é possível criar a liga H2H: com ${teamCap} times e formato ${formatLabel}, seriam necessárias ${needed} rodadas, mas restam apenas ${remainingRounds} rodadas no Brasileirão (da R${currentRound} à R${totalRounds}). Reduza o número de times ou selecione Turno Único.`,
      }
    }
  }

  // 3. Count active players to ensure teamCap * 24 is valid
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

  // 4. Generate unique invite code
  const inviteCode = generateInviteCode()

  // 5. Create league record
  const { data: league, error: createError } = await supabase
    .from('leagues')
    .insert({
      name,
      invite_code: inviteCode,
      scoring_mode: scoringMode,
      h2h_format: scoringMode === 'H2H' ? h2hFormat : null,
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

  // 6. Automatically create commissioner's fantasy team
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
