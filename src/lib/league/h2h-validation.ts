export type H2HFormat = 'SINGLE_ROUND' | 'DOUBLE_ROUND'

/**
 * Calculates the number of rounds needed for an H2H tournament:
 * - SINGLE_ROUND (Turno Único): N-1 (even) or N (odd)
 * - DOUBLE_ROUND (Ida e Volta): 2 * (N-1) (even) or 2 * N (odd)
 */
export function h2hRoundsNeeded(
  numberOfTeams: number,
  format: H2HFormat = 'SINGLE_ROUND'
): number {
  if (numberOfTeams < 2) return 0
  const single = numberOfTeams % 2 === 0 ? numberOfTeams - 1 : numberOfTeams
  return format === 'DOUBLE_ROUND' ? single * 2 : single
}

/**
 * Calculates the maximum number of teams that can participate in an H2H tournament
 * given remaining rounds and format.
 */
export function maxH2HTeams(
  remainingRealRounds: number,
  format: H2HFormat = 'SINGLE_ROUND'
): number {
  if (remainingRealRounds < 1) return 0
  const maxCycles = format === 'DOUBLE_ROUND' ? Math.floor(remainingRealRounds / 2) : remainingRealRounds
  const maxTeams = maxCycles + 1
  return Math.min(20, Math.max(0, maxTeams))
}

/**
 * Checks if a league can start an H2H tournament given the remaining real rounds in the season.
 */
export function canStartH2H(
  numberOfTeams: number,
  remainingRealRounds: number,
  format: H2HFormat = 'SINGLE_ROUND'
): boolean {
  const needed = h2hRoundsNeeded(numberOfTeams, format)
  return remainingRealRounds >= needed
}
