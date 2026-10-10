/**
 * Transfer Market & Lineup Closing WhatsApp notification.
 * Alerts league managers when the market is about to close for the upcoming round.
 */

import { createClient } from '@/lib/supabase/server'
import { sendTemplateMessage } from './client'

export interface MarketNotificationResult {
  leagueId: string
  leagueName: string
  round: number
  marketCloseLabel: string
  sentCount: number
  skippedCount: number
  failedCount: number
  details: {
    userName: string
    phoneNumber: string | null
    status: 'sent' | 'skipped_no_phone' | 'failed'
    messageId?: string | null
  }[]
}

/**
 * Formats a market closing timestamp to a friendly pt-BR string:
 * - "Hoje às 16:30"
 * - "Amanhã às 16:30"
 * - "Sáb (10/10) às 16:30"
 */
export function formatMarketCloseLabel(marketCloseTimestamp: number): string {
  const closeDate = new Date(marketCloseTimestamp)
  const today = new Date()

  const isToday =
    closeDate.getDate() === today.getDate() &&
    closeDate.getMonth() === today.getMonth() &&
    closeDate.getFullYear() === today.getFullYear()

  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const isTomorrow =
    closeDate.getDate() === tomorrow.getDate() &&
    closeDate.getMonth() === tomorrow.getMonth() &&
    closeDate.getFullYear() === tomorrow.getFullYear()

  const timeStr = closeDate.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  })

  if (isToday) {
    return `hoje às ${timeStr}`
  } else if (isTomorrow) {
    return `amanhã às ${timeStr}`
  } else {
    const weekday = closeDate.toLocaleDateString('pt-BR', {
      weekday: 'short',
      timeZone: 'America/Sao_Paulo',
    })
    const capitalWeekday = weekday.charAt(0).toUpperCase() + weekday.slice(1).replace('.', '')
    const dayMonth = closeDate.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      timeZone: 'America/Sao_Paulo',
    })
    return `${capitalWeekday} (${dayMonth}) às ${timeStr}`
  }
}

/**
 * Notifies all managers in a league that the transfer/lineup market is closing.
 *
 * @param leagueId - The ID of the fantasy league
 * @param options - force: bypass the "market already closed" check (useful for manual test/trigger)
 */
export async function notifyMarketClosing(
  leagueId: string,
  options?: { force?: boolean }
): Promise<MarketNotificationResult> {
  const templateName =
    process.env.WHATSAPP_MARKET_TEMPLATE_NAME ?? 'market_closing_notification'

  const result: MarketNotificationResult = {
    leagueId,
    leagueName: '',
    round: 1,
    marketCloseLabel: 'em breve',
    sentCount: 0,
    skippedCount: 0,
    failedCount: 0,
    details: [],
  }

  // Skip if WhatsApp credentials are not configured
  if (!process.env.WHATSAPP_PHONE_NUMBER_ID || !process.env.WHATSAPP_ACCESS_TOKEN) {
    console.warn('[WhatsApp] Credentials missing. Cannot send market notification.')
    return result
  }

  try {
    const supabase = await createClient()

    // 1. Fetch league info
    const { data: league, error: leagueErr } = await supabase
      .from('leagues')
      .select('id, name, season_id, status')
      .eq('id', leagueId)
      .single()

    if (leagueErr || !league) {
      console.error(`[WhatsApp] League ${leagueId} not found.`)
      return result
    }

    result.leagueName = league.name

    // 2. Fetch current round from season
    const { data: season } = await supabase
      .from('seasons')
      .select('id, current_round')
      .eq('id', league.season_id)
      .single()

    const currentRound = season?.current_round ?? 1
    result.round = currentRound

    // 3. Find earliest fixture for current round
    const { data: fixtures } = await supabase
      .from('fixtures')
      .select('kickoff_at')
      .eq('season_id', league.season_id)
      .eq('round', currentRound)
      .order('kickoff_at', { ascending: true })
      .limit(1)

    let marketCloseTimestamp: number | null = null
    if (fixtures && fixtures.length > 0 && fixtures[0].kickoff_at) {
      const kickoffTime = new Date(fixtures[0].kickoff_at).getTime()
      // Market closes 30 minutes before first kickoff
      marketCloseTimestamp = kickoffTime - 30 * 60 * 1000
    }

    if (marketCloseTimestamp) {
      result.marketCloseLabel = formatMarketCloseLabel(marketCloseTimestamp)
      const now = Date.now()
      if (now >= marketCloseTimestamp && !options?.force) {
        console.log(`[WhatsApp] Market for league ${leagueId} is already closed. Skipping.`)
        return result
      }
    }

    // 4. Fetch all teams and managers in the league
    const { data: teamsData } = await supabase
      .from('fantasy_teams')
      .select('id, user_id, name')
      .eq('league_id', leagueId)

    const teams = (teamsData as any[]) || []
    if (teams.length === 0) {
      return result
    }

    // 5. Fetch profiles for phone numbers
    const userIds = [...new Set(teams.map((t: any) => t.user_id))]
    const { data: profilesData } = await supabase
      .from('profiles')
      .select('id, display_name, phone_number')
      .in('id', userIds)

    const profiles = (profilesData as any[]) || []
    const profileMap = new Map<string, any>(profiles.map((p: any) => [p.id, p]))

    // 6. Send template message to each manager
    for (const team of teams) {
      const profile = profileMap.get(team.user_id)
      const userName = profile?.display_name || team.name
      const phoneNumber = profile?.phone_number

      if (!phoneNumber) {
        result.skippedCount++
        result.details.push({
          userName,
          phoneNumber: null,
          status: 'skipped_no_phone',
        })
        continue
      }

      const messageId = await sendTemplateMessage({
        to: phoneNumber,
        templateName,
        languageCode: 'pt_BR',
        bodyParameters: [
          userName,                 // {{1}} - Nome do gestor
          league.name,              // {{2}} - Nome da liga
          result.marketCloseLabel,  // {{3}} - Horário de fechamento (ex: "hoje às 16:30")
        ],
      })

      if (messageId) {
        result.sentCount++
        result.details.push({
          userName,
          phoneNumber,
          status: 'sent',
          messageId,
        })
      } else {
        result.failedCount++
        result.details.push({
          userName,
          phoneNumber,
          status: 'failed',
        })
      }
    }

    console.log(
      `[WhatsApp] Market notification finished for league "${league.name}": ` +
      `${result.sentCount} sent, ${result.skippedCount} skipped, ${result.failedCount} failed.`
    )

    return result
  } catch (error) {
    console.error('[WhatsApp] Error sending market closing notification:', error)
    return result
  }
}

/**
 * Iterates through all active leagues and notifies managers if market is closing.
 */
export async function notifyMarketClosingAllActiveLeagues(): Promise<MarketNotificationResult[]> {
  const supabase = await createClient()
  const { data: leagues } = await supabase
    .from('leagues')
    .select('id')
    .neq('status', 'archived')

  if (!leagues || leagues.length === 0) {
    return []
  }

  const results: MarketNotificationResult[] = []
  for (const l of leagues) {
    const res = await notifyMarketClosing(l.id)
    results.push(res)
  }

  return results
}
