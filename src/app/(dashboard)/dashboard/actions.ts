'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export type LeagueSummary = {
  id: string
  name: string
  inviteCode: string
  scoringMode: 'TOTAL' | 'H2H'
  draftMode: 'MANUAL' | 'AUTO' | 'HYBRID'
  teamCap: number
  status: 'open' | 'drafting' | 'active' | 'closed'
  commissionerId: string
  isCommissioner: boolean
  teamName: string
  teamCount: number
  createdAt: string
}

export async function getMyLeagues(): Promise<LeagueSummary[]> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Get user's fantasy teams with their leagues
  const { data: teams, error } = await supabase
    .from('fantasy_teams')
    .select(`
      id,
      name,
      league:leagues (
        id,
        name,
        invite_code,
        scoring_mode,
        draft_mode,
        team_cap,
        status,
        commissioner_id,
        created_at
      )
    `)
    .eq('user_id', user.id)

  if (error || !teams) {
    console.error('Error fetching user leagues:', error)
    return []
  }

  // Get team count for each league
  const leagueIds = teams.map((t: any) => t.league.id)
  
  const teamCounts: Record<string, number> = {}
  if (leagueIds.length > 0) {
    const { data: countData } = await supabase
      .from('fantasy_teams')
      .select('league_id')
      .in('league_id', leagueIds)

    if (countData) {
      countData.forEach((row: any) => {
        teamCounts[row.league_id] = (teamCounts[row.league_id] || 0) + 1
      })
    }
  }

  return teams.map((t: any) => {
    const l = t.league
    return {
      id: l.id,
      name: l.name,
      inviteCode: l.invite_code,
      scoringMode: l.scoring_mode,
      draftMode: l.draft_mode,
      teamCap: l.team_cap,
      status: l.status,
      commissionerId: l.commissioner_id,
      isCommissioner: l.commissioner_id === user.id,
      teamName: t.name,
      teamCount: teamCounts[l.id] || 1,
      createdAt: l.created_at,
    }
  })
}
