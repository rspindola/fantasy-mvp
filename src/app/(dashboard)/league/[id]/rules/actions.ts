'use server'

import { createClient } from '@/lib/supabase/server'

export type LeagueRulesData = {
  id: string
  name: string
  inviteCode: string
  scoringMode: 'TOTAL' | 'H2H'
  draftMode: 'MANUAL' | 'AUTO' | 'HYBRID'
  teamCap: number
  pickTimerSeconds: number
  commissionerName: string
}

export async function getLeagueRulesData(leagueId: string): Promise<LeagueRulesData | null> {
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
      pick_timer_seconds,
      commissioner:profiles!leagues_commissioner_id_fkey(display_name)
    `)
    .eq('id', leagueId)
    .single()

  if (error || !league) {
    return null
  }

  return {
    id: league.id,
    name: league.name,
    inviteCode: league.invite_code,
    scoringMode: league.scoring_mode as any,
    draftMode: league.draft_mode as any,
    teamCap: league.team_cap,
    pickTimerSeconds: league.pick_timer_seconds,
    commissionerName: (league.commissioner as any)?.display_name ?? 'Comissário',
  }
}
