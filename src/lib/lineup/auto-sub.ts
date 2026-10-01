import { calculateTeamRoundScore } from '@/lib/scoring/scoring-engine'
import { sortByPosition } from './lineup-engine'

export interface LineupPlayerInput {
  playerId: string
  name: string
  clubShortName?: string
  clubLogoUrl?: string | null
  photoUrl?: string | null
  position: 'GOL' | 'LAT' | 'ZAG' | 'MEI' | 'ATA'
  slotPosition: string
  isCaptain: boolean
  isStarter: boolean
  minutes: number
  points: number
  matchStatus?: 'played' | 'benched' | 'not_related' | 'postponed'
  scouts?: Record<string, any>
}

export interface SubstitutionEvent {
  outPlayer: LineupPlayerInput
  inPlayer: LineupPlayerInput
  position: 'GOL' | 'LAT' | 'ZAG' | 'MEI' | 'ATA'
  captainTransferred: boolean
}

export interface ProcessedLineupResult {
  starters: (LineupPlayerInput & {
    subbedOut: boolean
    subbedInBy?: LineupPlayerInput
  })[]
  reserves: (LineupPlayerInput & {
    subbedIn: boolean
    subbedFor?: LineupPlayerInput
  })[]
  activePlayers: LineupPlayerInput[]
  substitutions: SubstitutionEvent[]
  totalPoints: number
  captainBonus: number
}

/**
 * Processes automated substitutions for a team's lineup:
 * - If a starter played 0 minutes (DNP), the bench player of the same position is called.
 * - The bench player enters if they played > 0 minutes.
 * - If the DNP starter was the captain, the captaincy transfers to the subbed-in player.
 */
export function processAutoSubstitutions(
  startersInput: LineupPlayerInput[],
  reservesInput: LineupPlayerInput[]
): ProcessedLineupResult {
  const starters = startersInput.map((s) => ({
    ...s,
    subbedOut: false,
    subbedInBy: undefined as LineupPlayerInput | undefined,
  }))

  const reserves = reservesInput.map((r) => ({
    ...r,
    subbedIn: false,
    subbedFor: undefined as LineupPlayerInput | undefined,
  }))

  const substitutions: SubstitutionEvent[] = []
  const usedReserveIds = new Set<string>()

  for (const starter of starters) {
    // If starter did not play (0 minutes)
    if (starter.minutes === 0) {
      // Find eligible reserve for this exact position who played > 0 minutes and hasn't subbed in yet
      const eligibleReserve = reserves.find(
        (r) =>
          r.position === starter.position &&
          r.minutes > 0 &&
          !usedReserveIds.has(r.playerId)
      )

      if (eligibleReserve) {
        usedReserveIds.add(eligibleReserve.playerId)
        starter.subbedOut = true
        starter.subbedInBy = eligibleReserve

        eligibleReserve.subbedIn = true
        eligibleReserve.subbedFor = starter

        let captainTransferred = false
        if (starter.isCaptain) {
          starter.isCaptain = false
          eligibleReserve.isCaptain = true
          captainTransferred = true
        }

        substitutions.push({
          outPlayer: starter,
          inPlayer: eligibleReserve,
          position: starter.position,
          captainTransferred,
        })
      }
    }
  }

  // Active players whose points count for the team:
  // Starters who were NOT subbed out + Reserves who WERE subbed in
  const activePlayers: LineupPlayerInput[] = [
    ...starters.filter((s) => !s.subbedOut),
    ...reserves.filter((r) => r.subbedIn),
  ]

  const starterScores = activePlayers.map((p) => ({
    points: p.points,
    isCaptain: p.isCaptain,
  }))

  const { totalPoints, captainBonus } = calculateTeamRoundScore(starterScores)

  return {
    starters: [...starters].sort(sortByPosition),
    reserves: [...reserves].sort(sortByPosition),
    activePlayers,
    substitutions,
    totalPoints,
    captainBonus,
  }
}
