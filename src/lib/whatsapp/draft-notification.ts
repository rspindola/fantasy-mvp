/**
 * Draft turn notification via WhatsApp.
 * Notifies the next player that it's their turn to pick,
 * including their wishlist with availability status.
 */

import { createClient } from '@/lib/supabase/server'
import { generateSnakeOrder } from '@/lib/draft/snake-order'
import { sendTemplateMessage } from './client'

const WISHLIST_PREVIEW_COUNT = 5

/**
 * Sends a WhatsApp notification to the user whose turn it is to pick.
 *
 * @param leagueId - The league ID
 * @param pickNumber - The current pick number to notify for
 */
export async function notifyDraftTurn(
  leagueId: string,
  pickNumber: number
): Promise<void> {
  // Skip if WhatsApp is not configured
  if (!process.env.WHATSAPP_PHONE_NUMBER_ID || !process.env.WHATSAPP_ACCESS_TOKEN) {
    return
  }

  const templateName = process.env.WHATSAPP_TEMPLATE_NAME ?? 'draft_turn_notification'

  try {
    const supabase = await createClient()

    // 1. Get league info
    const { data: league } = await supabase
      .from('leagues')
      .select('id, name, total_picks')
      .eq('id', leagueId)
      .single()

    if (!league) return

    // 2. Get all teams in draft order
    const { data: teams } = await supabase
      .from('fantasy_teams')
      .select('id, user_id, name, draft_order')
      .eq('league_id', leagueId)
      .order('draft_order', { ascending: true })

    if (!teams || teams.length < 2) return

    // 3. Find which team has the current pick via snake order
    const teamIds = teams.map((t) => t.id)
    const snakeOrder = generateSnakeOrder(teamIds, 24)
    const currentSlot = snakeOrder.find((s) => s.pickNumber === pickNumber)

    if (!currentSlot) return

    const currentTeam = teams.find((t) => t.id === currentSlot.fantasyTeamId)
    if (!currentTeam) return

    // 4. Get user profile with phone number
    const { data: profile } = await supabase
      .from('profiles')
      .select('display_name, phone_number')
      .eq('id', currentTeam.user_id)
      .single()

    if (!profile?.phone_number) {
      console.log(
        `[WhatsApp] User ${currentTeam.user_id} has no phone number. Skipping notification.`
      )
      return
    }

    // 5. Build wishlist preview
    const wishlistText = await buildWishlistPreview(supabase, currentTeam.id, leagueId)

    // 6. Build the draft URL
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://fantasy.kodly.app'
    const draftUrl = `${siteUrl}/league/${leagueId}/draft`

    // 7. Send WhatsApp message
    await sendTemplateMessage({
      to: profile.phone_number,
      templateName,
      languageCode: 'pt_BR',
      bodyParameters: [
        profile.display_name,      // {{1}} — User's name
        league.name,                // {{2}} — League name
        wishlistText,               // {{3}} — Wishlist preview
        draftUrl,                   // {{4}} — Draft URL
      ],
    })
  } catch (error) {
    // Fire-and-forget: log but don't propagate errors
    console.error('[WhatsApp] Error sending draft notification:', error)
  }
}

/**
 * Builds a text preview of the user's wishlist (draft queue) with availability status.
 * Example output:
 *   "1. Neymar Jr (MEI)\n2. Gabigol (ATA) — ❌ Já escolhido pelo Flamengo FC\n3. Arrascaeta (MEI)"
 */
async function buildWishlistPreview(
  supabase: Awaited<ReturnType<typeof createClient>>,
  fantasyTeamId: string,
  leagueId: string
): Promise<string> {
  // Get the user's draft queue ordered by priority
  const { data: queue } = await supabase
    .from('draft_queues')
    .select('player_id, priority')
    .eq('fantasy_team_id', fantasyTeamId)
    .order('priority', { ascending: true })
    .limit(WISHLIST_PREVIEW_COUNT * 2) // Fetch extra in case some are taken

  if (!queue || queue.length === 0) {
    return 'Nenhum jogador na lista de desejos.'
  }

  // Get player details
  const playerIds = queue.map((q) => q.player_id)
  const { data: players } = await supabase
    .from('real_players')
    .select('id, name, position, club_id')
    .in('id', playerIds)

  if (!players) {
    return 'Nenhum jogador na lista de desejos.'
  }

  // Check which players are already drafted in this league
  const { data: draftedPicks } = await supabase
    .from('draft_picks')
    .select('player_id, fantasy_team_id')
    .eq('league_id', leagueId)
    .in('player_id', playerIds)

  const draftedMap = new Map<string, string>()
  if (draftedPicks) {
    // Get team names for drafted players
    const draftedTeamIds = [...new Set(draftedPicks.map((d) => d.fantasy_team_id))]
    const { data: draftedTeams } = await supabase
      .from('fantasy_teams')
      .select('id, name')
      .in('id', draftedTeamIds)

    const teamNameMap = new Map(draftedTeams?.map((t) => [t.id, t.name]) ?? [])
    for (const pick of draftedPicks) {
      draftedMap.set(pick.player_id, teamNameMap.get(pick.fantasy_team_id) ?? 'outro time')
    }
  }

  // Build the preview lines
  const lines: string[] = []
  let count = 0

  for (const queueItem of queue) {
    if (count >= WISHLIST_PREVIEW_COUNT) break

    const player = players.find((p) => p.id === queueItem.player_id)
    if (!player) continue

    count++
    const draftedBy = draftedMap.get(player.id)

    if (draftedBy) {
      lines.push(`${count}. ${player.name} (${player.position}) — ❌ Escolhido por ${draftedBy}`)
    } else {
      lines.push(`${count}. ${player.name} (${player.position}) — ✅ Disponível`)
    }
  }

  return lines.join('\n')
}
