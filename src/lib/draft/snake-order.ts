export interface PickSlot {
  pickNumber: number // 1..N*24
  round: number // 1..24
  fantasyTeamId: string
}

/**
 * Generates the complete snake pick sequence for N teams across 24 roster rounds.
 * Odd rounds: 0 .. N-1
 * Even rounds: N-1 .. 0
 */
export function generateSnakeOrder(
  shuffledTeamIds: string[],
  totalRounds: number = 24
): PickSlot[] {
  const slots: PickSlot[] = []
  let pickNumber = 1

  for (let round = 1; round <= totalRounds; round++) {
    const isEvenRound = round % 2 === 0
    const teamOrder = isEvenRound
      ? [...shuffledTeamIds].reverse()
      : [...shuffledTeamIds]

    for (const teamId of teamOrder) {
      slots.push({
        pickNumber,
        round,
        fantasyTeamId: teamId,
      })
      pickNumber++
    }
  }

  return slots
}
