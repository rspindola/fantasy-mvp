export interface PlayerCandidate {
  id: string
  name: string
  position: 'GOL' | 'LAT' | 'ZAG' | 'MEI' | 'ATA'
  avgPoints: number
  totalMinutes: number
}

export const TARGET_POSITIONS = {
  GOL: 2,
  LAT_MIN: 2,
  ZAG_MIN: 2,
  DEF_TOTAL: 8, // ZAG + LAT combined max 8
  MEI: 8,
  ATA: 6,
}

export type PositionKey = 'GOL' | 'LAT' | 'ZAG' | 'MEI' | 'ATA'

export const ROSTER_SIZE = 24

/**
 * Calculates position deficits and availability for a team's current roster.
 */
export function getPositionDeficits(
  currentRoster: { position: PositionKey }[]
): Record<PositionKey, number> {
  const counts: Record<PositionKey, number> = {
    GOL: 0,
    LAT: 0,
    ZAG: 0,
    MEI: 0,
    ATA: 0,
  }

  for (const player of currentRoster) {
    if (counts[player.position] !== undefined) {
      counts[player.position]++
    }
  }

  const defTotal = counts.LAT + counts.ZAG

  // Calculate deficits vs minimum requirements
  const deficits: Record<PositionKey, number> = {
    GOL: Math.max(0, TARGET_POSITIONS.GOL - counts.GOL),
    LAT: Math.max(0, TARGET_POSITIONS.LAT_MIN - counts.LAT),
    ZAG: Math.max(0, TARGET_POSITIONS.ZAG_MIN - counts.ZAG),
    MEI: Math.max(0, TARGET_POSITIONS.MEI - counts.MEI),
    ATA: Math.max(0, TARGET_POSITIONS.ATA - counts.ATA),
  }

  // If minimums for LAT & ZAG are met but total DEF < 8, both LAT & ZAG still have remaining slots
  if (deficits.LAT === 0 && deficits.ZAG === 0 && defTotal < TARGET_POSITIONS.DEF_TOTAL) {
    const remainingDef = TARGET_POSITIONS.DEF_TOTAL - defTotal
    deficits.LAT = remainingDef
    deficits.ZAG = remainingDef
  }

  // If position quota is completely full, set deficit to 0
  if (counts.GOL >= TARGET_POSITIONS.GOL) deficits.GOL = 0
  if (counts.MEI >= TARGET_POSITIONS.MEI) deficits.MEI = 0
  if (counts.ATA >= TARGET_POSITIONS.ATA) deficits.ATA = 0
  if (defTotal >= TARGET_POSITIONS.DEF_TOTAL) {
    deficits.LAT = 0
    deficits.ZAG = 0
  }

  return deficits
}

/**
 * Selects the best available player for a team based on positional deficit, avg points, and minutes.
 * If queuedPlayerIds (wishlist) is provided, checks preferred players first in priority order.
 */
export function autoPickPlayer(
  availablePlayers: PlayerCandidate[],
  currentRoster: { position: PositionKey }[],
  queuedPlayerIds: string[] = []
): PlayerCandidate | null {
  if (availablePlayers.length === 0) return null

  const deficits = getPositionDeficits(currentRoster)

  // 1. Check Wishlist / Draft Queue first
  if (queuedPlayerIds.length > 0) {
    for (const qPlayerId of queuedPlayerIds) {
      const candidate = availablePlayers.find((p) => p.id === qPlayerId)
      if (candidate) {
        // Ensure picking candidate does not exceed position capacity
        if (deficits[candidate.position] > 0) {
          return candidate
        }
      }
    }
  }

  // 2. Fallback to standard Auto-Pick algorithm
  const sortedPositionsByDeficit = (Object.keys(deficits) as PositionKey[]).sort(
    (a, b) => deficits[b] - deficits[a]
  )

  const highestDeficitPos = sortedPositionsByDeficit[0]
  const hasDeficit = deficits[highestDeficitPos] > 0

  let eligiblePool = availablePlayers

  if (hasDeficit) {
    // Filter available players for positions that have deficit > 0
    const deficitPositions = (Object.keys(deficits) as PositionKey[]).filter(
      (pos) => deficits[pos] > 0
    )
    const matchingInDeficit = availablePlayers.filter((p) =>
      deficitPositions.includes(p.position)
    )
    if (matchingInDeficit.length > 0) {
      eligiblePool = matchingInDeficit
    }
  }

  // Sort candidates by avgPoints DESC, totalMinutes DESC, name ASC
  const sorted = [...eligiblePool].sort((a, b) => {
    if (b.avgPoints !== a.avgPoints) {
      return b.avgPoints - a.avgPoints
    }
    if (b.totalMinutes !== a.totalMinutes) {
      return b.totalMinutes - a.totalMinutes
    }
    return a.name.localeCompare(b.name)
  })

  return sorted[0] ?? null
}
