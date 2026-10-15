'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

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
  bannerImageUrl: string | null
  championshipName: string | null
  championshipLogoUrl: string | null
}

import { getChampionshipInfo } from '@/lib/api/championship'

export async function getMyLeagues(): Promise<LeagueSummary[]> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

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
        created_at,
        banner_image_url,
        season:seasons (
          name,
          league_api_id
        )
      )
    `)
    .eq('user_id', user.id)

  if (error || !teams) {
    console.error('Error fetching user leagues:', error)
    return []
  }

  const leagueIds = teams.map((t: any) => t.league?.id).filter(Boolean)

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

  return Promise.all(
    teams.map(async (t: any) => {
      const l = t.league
      const season = l.season
      const apiId = season?.league_api_id

      let championshipName = season?.name || 'Brasileirão Série A'
      let championshipLogoUrl: string | null = null

      if (apiId) {
        try {
          const info = await getChampionshipInfo(apiId)
          championshipName = info.name
          championshipLogoUrl = info.logoUrl
        } catch {
          // fallback to season.name
        }
      }

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
        bannerImageUrl: l.banner_image_url || null,
        championshipName,
        championshipLogoUrl,
      }
    })
  )
}

export async function uploadLeagueBannerAction(
  leagueId: string,
  formData: FormData
): Promise<{ success: boolean; url?: string; error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { success: false, error: 'Não autenticado' }
  }

  const { data: league } = await supabase
    .from('leagues')
    .select('commissioner_id')
    .eq('id', leagueId)
    .single()

  if (!league || league.commissioner_id !== user.id) {
    return { success: false, error: 'Apenas o comissário pode alterar o banner' }
  }

  const file = formData.get('banner') as File
  if (!file || file.size === 0) {
    return { success: false, error: 'Nenhum arquivo selecionado' }
  }

  if (file.size > 5 * 1024 * 1024) {
    return { success: false, error: 'Arquivo muito grande. Máximo: 5MB' }
  }

  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
  const allowed = ['jpg', 'jpeg', 'png', 'webp', 'gif']
  if (!allowed.includes(ext)) {
    return { success: false, error: 'Formato inválido. Use JPG, PNG, WebP ou GIF' }
  }

  const filePath = `${leagueId}/banner.${ext}`

  const { error: uploadError } = await supabase.storage
    .from('league-banners')
    .upload(filePath, file, { upsert: true, contentType: file.type })

  if (uploadError) {
    console.error('Upload error:', uploadError)
    return { success: false, error: `Erro ao fazer upload: ${uploadError.message}` }
  }

  const { data: publicUrlData } = supabase.storage
    .from('league-banners')
    .getPublicUrl(filePath)

  const publicUrl = publicUrlData.publicUrl

  await supabase
    .from('leagues')
    .update({ banner_image_url: publicUrl })
    .eq('id', leagueId)

  revalidatePath('/dashboard')
  revalidatePath(`/league/${leagueId}`)

  return { success: true, url: publicUrl }
}
