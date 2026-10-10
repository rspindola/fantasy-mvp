import { NextResponse } from 'next/server'
import {
  notifyMarketClosing,
  notifyMarketClosingAllActiveLeagues,
} from '@/lib/whatsapp/market-notification'

/**
 * Route handler for automated market closing WhatsApp notifications.
 * Can be called via cron job (e.g., Vercel Cron, GitHub Actions, external cron).
 *
 * Query parameters:
 * - leagueId: (optional) specify a single league to notify
 * - force: (optional) "true" to send even if market closing time has already passed
 *
 * Headers:
 * - Authorization: Bearer <CRON_SECRET> (if CRON_SECRET is configured in env)
 */
export async function GET(request: Request) {
  // Check CRON_SECRET authorization if configured
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const { searchParams } = new URL(request.url)
  const leagueId = searchParams.get('leagueId')
  const force = searchParams.get('force') === 'true'

  try {
    if (leagueId) {
      const result = await notifyMarketClosing(leagueId, { force })
      return NextResponse.json({ success: true, mode: 'single_league', result })
    }

    const results = await notifyMarketClosingAllActiveLeagues()
    return NextResponse.json({ success: true, mode: 'all_leagues', count: results.length, results })
  } catch (error: any) {
    console.error('[Cron Market Alert] Error:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Internal error' },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  return GET(request)
}
