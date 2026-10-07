export interface H2HMatchupRecord {
  id: string
  fixtureRound: number
  homeTeamId: string
  homeTeamName: string
  awayTeamId: string
  awayTeamName: string
  homePoints: number | null
  awayPoints: number | null
  result: 'home' | 'away' | 'draw' | null
}

export interface H2HStandingsRow {
  rank: number
  rankVariation: number
  fantasyTeamId: string
  teamName: string
  managerName?: string
  played: number
  h2hPoints: number // 3 for win, 1 for draw
  wins: number
  draws: number
  losses: number
  pointsFor: number // GP
  pointsAgainst: number // GC
  pointDifference: number // SG
  generalScore: number // Pontuação Geral (critério de desempate)
  winRate: number // % Aproveitamento
  recentForm: ('W' | 'D' | 'L')[] // Últimos jogos
}

/**
 * Computes result of an individual H2H matchup.
 */
export function evaluateH2HMatchupResult(
  homePoints: number,
  awayPoints: number
): 'home' | 'away' | 'draw' {
  if (homePoints > awayPoints) return 'home'
  if (awayPoints > homePoints) return 'away'
  return 'draw'
}

/**
 * Calculates H2H standings table from completed matchups history or pre-populates
 * all participating teams with zeroed stats before matches start.
 * Uses Pontuação Geral as tiebreaker when h2hPoints and wins are tied.
 */
export function calculateH2HStandings(
  matchups: H2HMatchupRecord[],
  allTeams?: { id: string; name: string; managerName?: string }[],
  teamGeneralPoints?: Map<string, number> | Record<string, number>,
  skipVariation = false
): H2HStandingsRow[] {
  const map = new Map<
    string,
    {
      fantasyTeamId: string
      teamName: string
      managerName?: string
      h2hPoints: number
      wins: number
      draws: number
      losses: number
      pointsFor: number
      pointsAgainst: number
    }
  >()

  const getOrInit = (id: string, name: string, managerName?: string) => {
    let t = map.get(id)
    if (!t) {
      t = {
        fantasyTeamId: id,
        teamName: name,
        managerName,
        h2hPoints: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        pointsFor: 0,
        pointsAgainst: 0,
      }
      map.set(id, t)
    } else if (managerName && !t.managerName) {
      t.managerName = managerName
    }
    return t
  }

  // Pre-populate if allTeams provided
  if (allTeams) {
    for (const t of allTeams) {
      getOrInit(t.id, t.name, t.managerName)
    }
  }

  // Pre-populate all teams present in matchups so the table is never empty
  for (const m of matchups) {
    getOrInit(m.homeTeamId, m.homeTeamName)
    getOrInit(m.awayTeamId, m.awayTeamName)
  }

  for (const m of matchups) {
    if (m.homePoints === null || m.awayPoints === null || !m.result) continue

    const home = getOrInit(m.homeTeamId, m.homeTeamName)
    const away = getOrInit(m.awayTeamId, m.awayTeamName)

    home.pointsFor += m.homePoints
    home.pointsAgainst += m.awayPoints
    away.pointsFor += m.awayPoints
    away.pointsAgainst += m.homePoints

    if (m.result === 'home') {
      home.h2hPoints += 3
      home.wins += 1
      away.losses += 1
    } else if (m.result === 'away') {
      away.h2hPoints += 3
      away.wins += 1
      home.losses += 1
    } else {
      home.h2hPoints += 1
      home.draws += 1
      away.h2hPoints += 1
      away.draws += 1
    }
  }

  const rows: Omit<H2HStandingsRow, 'rank' | 'rankVariation'>[] = Array.from(map.values()).map((t) => {
    const played = t.wins + t.draws + t.losses
    const winRate = played > 0 ? Math.round((t.h2hPoints / (played * 3)) * 100) : 0

    // Get generalScore
    let generalScore = 0
    if (teamGeneralPoints) {
      if (teamGeneralPoints instanceof Map) {
        generalScore = teamGeneralPoints.get(t.fantasyTeamId) ?? 0
      } else {
        generalScore = (teamGeneralPoints as any)[t.fantasyTeamId] ?? 0
      }
    }

    // Get recent form (last 5 completed matches)
    const teamMatches = matchups
      .filter((m) => (m.homeTeamId === t.fantasyTeamId || m.awayTeamId === t.fantasyTeamId) && m.result)
      .sort((a, b) => a.fixtureRound - b.fixtureRound)

    const recentForm: ('W' | 'D' | 'L')[] = teamMatches
      .map((m) => {
        if (m.result === 'draw') return 'D'
        if (m.homeTeamId === t.fantasyTeamId) {
          return m.result === 'home' ? 'W' : 'L'
        } else {
          return m.result === 'away' ? 'W' : 'L'
        }
      })
      .slice(-5)

    return {
      fantasyTeamId: t.fantasyTeamId,
      teamName: t.teamName,
      managerName: t.managerName,
      played,
      h2hPoints: t.h2hPoints,
      wins: t.wins,
      draws: t.draws,
      losses: t.losses,
      pointsFor: parseFloat(t.pointsFor.toFixed(2)),
      pointsAgainst: parseFloat(t.pointsAgainst.toFixed(2)),
      pointDifference: parseFloat((t.pointsFor - t.pointsAgainst).toFixed(2)),
      generalScore: parseFloat(generalScore.toFixed(2)),
      winRate,
      recentForm,
    }
  })

  // Tiebreakers:
  // 1. h2hPoints
  // 2. wins
  // 3. generalScore (CRITÉRIO DE DESEMPATE SOLICITADO)
  // 4. pointDifference (SG)
  // 5. pointsFor (GP)
  rows.sort((a, b) => {
    if (b.h2hPoints !== a.h2hPoints) {
      return b.h2hPoints - a.h2hPoints
    }
    if (b.wins !== a.wins) {
      return b.wins - a.wins
    }
    if (b.generalScore !== a.generalScore) {
      return b.generalScore - a.generalScore
    }
    if (b.pointDifference !== a.pointDifference) {
      return b.pointDifference - a.pointDifference
    }
    if (b.pointsFor !== a.pointsFor) {
      return b.pointsFor - a.pointsFor
    }
    return a.teamName.localeCompare(b.teamName)
  })

  // Calculate rank variation if applicable
  const prevRankMap = new Map<string, number>()
  if (!skipVariation) {
    const completedRounds = Array.from(
      new Set(matchups.filter((m) => m.result).map((m) => m.fixtureRound))
    ).sort((a, b) => a - b)

    if (completedRounds.length > 1) {
      const lastCompletedRound = completedRounds[completedRounds.length - 1]
      const prevMatchups = matchups.filter((m) => m.fixtureRound < lastCompletedRound)
      const prevStandings = calculateH2HStandings(prevMatchups, allTeams, teamGeneralPoints, true)
      prevStandings.forEach((r) => prevRankMap.set(r.fantasyTeamId, r.rank))
    }
  }

  return rows.map((row, index) => {
    const rank = index + 1
    const prevRank = prevRankMap.get(row.fantasyTeamId)
    const rankVariation = prevRank !== undefined ? prevRank - rank : 0

    return {
      rank,
      rankVariation,
      ...row,
    }
  })
}
