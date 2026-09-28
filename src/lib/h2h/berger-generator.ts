export interface H2HMatchupSlot {
  fixtureRound: number
  homeTeamId: string
  awayTeamId: string
}

/**
 * Generates single round-robin H2H matchups using Berger circle algorithm.
 * If teamIds count N is odd, adds a dummy 'BYE' team (1 team rests per round).
 */
export function generateBergerMatchups(
  teamIds: string[],
  startRound: number = 1
): H2HMatchupSlot[] {
  if (teamIds.length < 2) return []

  const teams = [...teamIds]
  const isOdd = teams.length % 2 !== 0

  if (isOdd) {
    teams.push('BYE')
  }

  const numTeams = teams.length
  const numRounds = numTeams - 1
  const half = numTeams / 2

  const matchups: H2HMatchupSlot[] = []

  let teamList = [...teams]

  for (let r = 0; r < numRounds; r++) {
    const currentRound = startRound + r

    for (let i = 0; i < half; i++) {
      const home = teamList[i]
      const away = teamList[numTeams - 1 - i]

      // Filter out BYE matches
      if (home !== 'BYE' && away !== 'BYE') {
        // Alternate home/away for balance
        if (r % 2 === 0) {
          matchups.push({ fixtureRound: currentRound, homeTeamId: home, awayTeamId: away })
        } else {
          matchups.push({ fixtureRound: currentRound, homeTeamId: away, awayTeamId: home })
        }
      }
    }

    // Rotate array elements (keep index 0 fixed, rotate 1..N-1)
    teamList = [
      teamList[0],
      teamList[numTeams - 1],
      ...teamList.slice(1, numTeams - 1),
    ]
  }

  return matchups
}
