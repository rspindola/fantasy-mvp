export interface TeamScoreRecord {
  fantasyTeamId: string
  teamName: string
  managerName: string
  fixtureRound: number
  totalPoints: number
  captainBonus: number
}

export interface TotalStandingsRow {
  rank: number
  fantasyTeamId: string
  teamName: string
  managerName: string
  cumulativePoints: number
  roundsWon: number
  totalCaptainBonus: number
}

/**
 * Calculates TOTAL accumulated standings leaderboard given round scores history.
 */
export function calculateTotalStandings(
  scoresHistory: TeamScoreRecord[]
): TotalStandingsRow[] {
  const map = new Map<
    string,
    {
      fantasyTeamId: string
      teamName: string
      managerName: string
      cumulativePoints: number
      totalCaptainBonus: number
      roundPointsMap: Map<number, number>
    }
  >()

  // 1. Group points by team
  for (const record of scoresHistory) {
    let teamData = map.get(record.fantasyTeamId)
    if (!teamData) {
      teamData = {
        fantasyTeamId: record.fantasyTeamId,
        teamName: record.teamName,
        managerName: record.managerName,
        cumulativePoints: 0,
        totalCaptainBonus: 0,
        roundPointsMap: new Map(),
      }
      map.set(record.fantasyTeamId, teamData)
    }

    teamData.cumulativePoints += record.totalPoints
    teamData.totalCaptainBonus += record.captainBonus
    teamData.roundPointsMap.set(record.fixtureRound, record.totalPoints)
  }

  // 2. Calculate rounds won (roundsWon)
  const roundWinners = new Map<number, { maxPoints: number; winnerTeamIds: string[] }>()

  for (const teamData of map.values()) {
    for (const [round, points] of teamData.roundPointsMap.entries()) {
      let rw = roundWinners.get(round)
      if (!rw) {
        rw = { maxPoints: points, winnerTeamIds: [teamData.fantasyTeamId] }
        roundWinners.set(round, rw)
      } else {
        if (points > rw.maxPoints) {
          rw.maxPoints = points
          rw.winnerTeamIds = [teamData.fantasyTeamId]
        } else if (points === rw.maxPoints) {
          rw.winnerTeamIds.push(teamData.fantasyTeamId)
        }
      }
    }
  }

  const roundsWonMap = new Map<string, number>()
  for (const rw of roundWinners.values()) {
    for (const winnerId of rw.winnerTeamIds) {
      roundsWonMap.set(winnerId, (roundsWonMap.get(winnerId) || 0) + 1)
    }
  }

  // 3. Build array and sort
  const rows: Omit<TotalStandingsRow, 'rank'>[] = Array.from(map.values()).map((t) => ({
    fantasyTeamId: t.fantasyTeamId,
    teamName: t.teamName,
    managerName: t.managerName,
    cumulativePoints: parseFloat(t.cumulativePoints.toFixed(2)),
    totalCaptainBonus: parseFloat(t.totalCaptainBonus.toFixed(2)),
    roundsWon: roundsWonMap.get(t.fantasyTeamId) || 0,
  }))

  rows.sort((a, b) => {
    if (b.cumulativePoints !== a.cumulativePoints) {
      return b.cumulativePoints - a.cumulativePoints
    }
    if (b.roundsWon !== a.roundsWon) {
      return b.roundsWon - a.roundsWon
    }
    if (b.totalCaptainBonus !== a.totalCaptainBonus) {
      return b.totalCaptainBonus - a.totalCaptainBonus
    }
    return a.teamName.localeCompare(b.teamName)
  })

  // Assign 1-indexed ranks
  return rows.map((row, index) => ({
    rank: index + 1,
    ...row,
  }))
}
