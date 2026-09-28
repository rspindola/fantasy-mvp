/**
 * Calculates the number of rounds needed for a single round-robin H2H tournament.
 * If N is even, it takes N - 1 rounds.
 * If N is odd, it takes N rounds (where 1 team gets a bye each round).
 */
export function h2hRoundsNeeded(numberOfTeams: number): number {
  if (numberOfTeams < 2) return 0
  return numberOfTeams % 2 === 0 ? numberOfTeams - 1 : numberOfTeams
}

/**
 * Checks if a league can start an H2H tournament given the remaining real rounds in the season.
 */
export function canStartH2H(numberOfTeams: number, remainingRealRounds: number): boolean {
  const needed = h2hRoundsNeeded(numberOfTeams)
  return remainingRealRounds >= needed
}
