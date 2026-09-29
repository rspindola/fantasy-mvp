export interface H2HMatchupSlot {
  fixtureRound: number
  homeTeamId: string
  awayTeamId: string
}

/**
 * Generates round-robin H2H matchups using Berger circle algorithm.
 * If teamIds count N is odd, adds a dummy 'BYE' team (1 team rests per round).
 * If endRound is provided, continues cycling through the schedule (inverting home/away
 * on alternating cycles) until all rounds up to endRound are generated.
 */
export function generateBergerMatchups(
  teamIds: string[],
  startRound: number = 1,
  endRound?: number
): H2HMatchupSlot[] {
  if (teamIds.length < 2) return []

  const teams = [...teamIds]
  const isOdd = teams.length % 2 !== 0

  if (isOdd) {
    teams.push('BYE')
  }

  const numTeams = teams.length
  const cycleRounds = numTeams - 1
  const half = numTeams / 2

  // Generate canonical single round-robin cycle (relative rounds: 0..cycleRounds-1)
  const canonicalRounds: { home: string; away: string }[][] = []
  let teamList = [...teams]

  for (let r = 0; r < cycleRounds; r++) {
    const roundMatches: { home: string; away: string }[] = []
    for (let i = 0; i < half; i++) {
      const home = teamList[i]
      const away = teamList[numTeams - 1 - i]

      if (home !== 'BYE' && away !== 'BYE') {
        if (r % 2 === 0) {
          roundMatches.push({ home, away })
        } else {
          roundMatches.push({ home: away, away: home })
        }
      }
    }
    canonicalRounds.push(roundMatches)

    // Rotate array elements (keep index 0 fixed, rotate 1..N-1)
    teamList = [
      teamList[0],
      teamList[numTeams - 1],
      ...teamList.slice(1, numTeams - 1),
    ]
  }

  const maxRound = endRound !== undefined && endRound >= startRound
    ? endRound
    : startRound + cycleRounds - 1

  const matchups: H2HMatchupSlot[] = []
  let currentRound = startRound
  let cycleIndex = 0

  while (currentRound <= maxRound) {
    for (let r = 0; r < cycleRounds && currentRound <= maxRound; r++) {
      const matches = canonicalRounds[r]
      const invertHomeAway = cycleIndex % 2 === 1

      for (const m of matches) {
        matchups.push({
          fixtureRound: currentRound,
          homeTeamId: invertHomeAway ? m.away : m.home,
          awayTeamId: invertHomeAway ? m.home : m.away,
        })
      }

      currentRound++
    }
    cycleIndex++
  }

  return matchups
}
