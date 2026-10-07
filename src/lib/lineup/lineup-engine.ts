export type Formation = '3-4-3' | '3-5-2' | '4-3-3' | '4-4-2' | '4-5-1' | '5-3-2' | '5-4-1'

export interface PositionRequirements {
  GOL: number
  LAT: number
  ZAG: number
  MEI: number
  ATA: number
}

export const FORMATION_REQUIREMENTS: Record<Formation, PositionRequirements> = {
  '3-4-3': { GOL: 1, LAT: 0, ZAG: 3, MEI: 4, ATA: 3 },
  '3-5-2': { GOL: 1, LAT: 0, ZAG: 3, MEI: 5, ATA: 2 },
  '4-3-3': { GOL: 1, LAT: 2, ZAG: 2, MEI: 3, ATA: 3 },
  '4-4-2': { GOL: 1, LAT: 2, ZAG: 2, MEI: 4, ATA: 2 },
  '4-5-1': { GOL: 1, LAT: 2, ZAG: 2, MEI: 5, ATA: 1 },
  '5-3-2': { GOL: 1, LAT: 2, ZAG: 3, MEI: 3, ATA: 2 },
  '5-4-1': { GOL: 1, LAT: 2, ZAG: 3, MEI: 4, ATA: 1 },
}

export interface FormationInfo {
  id: Formation
  name: string
  defenders: number // bottom blue dots
  midfielders: number // middle grey dots
  attackers: number // top blue dots
}

export const FORMATIONS_LIST: FormationInfo[] = [
  { id: '3-4-3', name: '3-4-3', defenders: 3, midfielders: 4, attackers: 3 },
  { id: '3-5-2', name: '3-5-2', defenders: 3, midfielders: 5, attackers: 2 },
  { id: '4-3-3', name: '4-3-3', defenders: 4, midfielders: 3, attackers: 3 },
  { id: '4-4-2', name: '4-4-2', defenders: 4, midfielders: 4, attackers: 2 },
  { id: '4-5-1', name: '4-5-1', defenders: 4, midfielders: 5, attackers: 1 },
  { id: '5-3-2', name: '5-3-2', defenders: 5, midfielders: 3, attackers: 2 },
  { id: '5-4-1', name: '5-4-1', defenders: 5, midfielders: 4, attackers: 1 },
]

export const POSITION_ORDER: Record<string, number> = {
  GOL: 1,
  LAT: 2,
  ZAG: 3,
  MEI: 4,
  ATA: 5,
}

export function sortByPosition<T extends { position: string }>(a: T, b: T): number {
  const orderA = POSITION_ORDER[a.position] ?? 99
  const orderB = POSITION_ORDER[b.position] ?? 99
  return orderA - orderB
}

export interface LineupSlotItem {
  playerId: string
  position: 'GOL' | 'LAT' | 'ZAG' | 'MEI' | 'ATA'
  isCaptain: boolean
  isStarter: boolean
}

export interface ValidateLineupInput {
  formation: Formation
  starters: LineupSlotItem[]
  reserves?: LineupSlotItem[]
  rosterPlayerIds: string[]
}

export interface LineupValidationResult {
  isValid: boolean
  errors: string[]
}

/**
 * Validates a proposed starting 11 lineup and reserves against formation requirements, captain rule, and roster ownership.
 */
export function validateLineup(input: ValidateLineupInput): LineupValidationResult {
  const errors: string[] = []

  // 1. Must have exactly 11 starters
  if (input.starters.length !== 11) {
    errors.push(`A escalação precisa ter exatamente 11 titulares (encontrados: ${input.starters.length}).`)
  }

  // 2. Must have exactly 1 captain
  const captainCount = input.starters.filter((s) => s.isCaptain).length
  if (captainCount !== 1) {
    errors.push(`A escalação precisa ter exatamente 1 capitão (encontrados: ${captainCount}).`)
  }

  // 3. All starters and reserves must be in user's roster
  const rosterSet = new Set(input.rosterPlayerIds)
  const allSlots = [...input.starters, ...(input.reserves || [])]
  const invalidRosterPlayers = allSlots.filter((s) => !rosterSet.has(s.playerId))
  if (invalidRosterPlayers.length > 0) {
    errors.push('Existem jogadores na escalação que não pertencem ao seu elenco.')
  }

  // 4. Starters and reserves must not overlap
  const starterIds = new Set(input.starters.map((s) => s.playerId))
  if (input.reserves) {
    const overlapping = input.reserves.filter((r) => starterIds.has(r.playerId))
    if (overlapping.length > 0) {
      errors.push('Um jogador não pode ser titular e reserva ao mesmo tempo.')
    }
  }

  // 5. Validate position counts for starters against formation requirements
  const reqs = FORMATION_REQUIREMENTS[input.formation]
  if (reqs) {
    const counts: Record<string, number> = { GOL: 0, LAT: 0, ZAG: 0, MEI: 0, ATA: 0 }
    input.starters.forEach((s) => {
      counts[s.position] = (counts[s.position] || 0) + 1
    })

    for (const [pos, required] of Object.entries(reqs)) {
      if (counts[pos] !== required) {
        errors.push(
          `Formação ${input.formation} exige ${required} de ${pos}, mas foram escalados ${counts[pos]}.`
        )
      }
    }
  } else {
    errors.push('Formação tática inválida.')
  }

  return {
    isValid: errors.length === 0,
    errors,
  }
}
