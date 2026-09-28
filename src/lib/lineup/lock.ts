import { createClient } from '@/lib/supabase/server'
import { FORMATION_REQUIREMENTS, type Formation } from './lineup-engine'

export interface RoundLockStatus {
  isLocked: boolean
  kickoffAt: string | null
  roundNumber: number
}

/**
 * Checks if the market for a given fixture round is locked.
 * Locked when current time >= first fixture kickoff_at of that round.
 */
export async function checkRoundLockStatus(
  seasonId: string,
  fixtureRound: number
): Promise<RoundLockStatus> {
  const supabase = await createClient()

  // Fetch earliest kickoff_at for fixtures in this round
  const { data: fixtures, error } = await supabase
    .from('fixtures')
    .select('kickoff_at')
    .eq('season_id', seasonId)
    .eq('round', fixtureRound)
    .order('kickoff_at', { ascending: true })
    .limit(1)

  if (error || !fixtures || fixtures.length === 0 || !fixtures[0].kickoff_at) {
    // If no fixtures found or no kickoff set, default to unlocked
    return { isLocked: false, kickoffAt: null, roundNumber: fixtureRound }
  }

  const kickoffTime = new Date(fixtures[0].kickoff_at).getTime()
  const now = Date.now()

  return {
    isLocked: now >= kickoffTime,
    kickoffAt: fixtures[0].kickoff_at,
    roundNumber: fixtureRound,
  }
}

/**
 * Generates an automatic fallback starting 11 lineup for a team using 4-3-3 formation.
 */
export function generateAutoFallbackLineup(
  roster: { id: string; position: 'GOL' | 'LAT' | 'ZAG' | 'MEI' | 'ATA'; avgPoints: number }[]
): {
  formation: Formation
  starters: { playerId: string; position: 'GOL' | 'LAT' | 'ZAG' | 'MEI' | 'ATA'; isCaptain: boolean }[]
} {
  const formation: Formation = '4-3-3'
  const reqs = FORMATION_REQUIREMENTS[formation]

  const starters: { playerId: string; position: 'GOL' | 'LAT' | 'ZAG' | 'MEI' | 'ATA'; isCaptain: boolean }[] = []

  // Group roster players by position sorted by avgPoints DESC
  const grouped: Record<string, typeof roster> = { GOL: [], LAT: [], ZAG: [], MEI: [], ATA: [] }
  roster.forEach((p) => grouped[p.position]?.push(p))

  for (const pos of Object.keys(grouped)) {
    grouped[pos].sort((a, b) => b.avgPoints - a.avgPoints)
  }

  // Pick top required players per position
  for (const [pos, count] of Object.entries(reqs)) {
    const pool = grouped[pos] || []
    for (let i = 0; i < count && i < pool.length; i++) {
      starters.push({
        playerId: pool[i].id,
        position: pos as any,
        isCaptain: false,
      })
    }
  }

  // Assign captain to highest avgPoints player among starters
  if (starters.length > 0) {
    let topStarter = starters[0]
    let maxPts = -1
    starters.forEach((s) => {
      const p = roster.find((r) => r.id === s.playerId)
      if (p && p.avgPoints > maxPts) {
        maxPts = p.avgPoints
        topStarter = s
      }
    })
    topStarter.isCaptain = true
  }

  return { formation, starters }
}
