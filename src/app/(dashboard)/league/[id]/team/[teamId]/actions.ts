'use server'

import { createClient } from '@/lib/supabase/server'

export interface TeamRosterPlayer {
  id: string
  name: string
  position: 'GOL' | 'LAT' | 'ZAG' | 'MEI' | 'ATA'
  photoUrl: string | null
  avgPoints: number
  totalMinutes: number
  club: {
    id: string
    name: string
    shortName: string
    logoUrl: string | null
  } | null
  nextMatch: {
    round: number
    opponentShort: string
    opponentLogo: string | null
    isHome: boolean
    status: string
  } | null
}

export interface TeamRosterPageData {
  leagueId: string
  leagueName: string
  scoringMode: 'H2H' | 'TOTAL'
  teamId: string
  teamName: string
  coachName: string
  isMyTeam: boolean
  isCommissioner: boolean
  currentRound: number
  totalRounds: number
  rank?: number
  h2hRecord?: {
    wins: number
    draws: number
    losses: number
    pointsFor: number
    pointsAgainst: number
    pointDifference: number
    h2hPoints: number
  }
  totalPoints?: number
  players: TeamRosterPlayer[]
  countsByPosition: Record<'GOL' | 'LAT' | 'ZAG' | 'MEI' | 'ATA', number>
}

export async function getTeamRosterData(
  leagueId: string,
  teamId: string
): Promise<TeamRosterPageData | null> {
  const supabase = await createClient()

  // 1. Auth user check
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return null
  }

  // 2. Fetch league info
  const { data: league, error: leagueErr } = await supabase
    .from('leagues')
    .select('id, name, scoring_mode, commissioner_id, season_id')
    .eq('id', leagueId)
    .single()

  if (leagueErr || !league) {
    return null
  }

  // 3. Fetch Season info
  const { data: season } = await supabase
    .from('seasons')
    .select('current_round, total_rounds')
    .eq('id', league.season_id)
    .single()

  const currentRound = season?.current_round ?? 29
  const totalRounds = season?.total_rounds ?? 38

  // 4. Fetch target team
  const { data: team, error: teamErr } = await supabase
    .from('fantasy_teams')
    .select(`
      id,
      name,
      user_id,
      profiles (
        display_name
      )
    `)
    .eq('id', teamId)
    .eq('league_id', leagueId)
    .single()

  if (teamErr || !team) {
    return null
  }

  const coachName = (team.profiles as any)?.display_name ?? 'Técnico'
  const isMyTeam = team.user_id === user.id
  const isCommissioner = team.user_id === league.commissioner_id

  // 5. Fetch Standings metrics
  let rank: number | undefined
  let h2hRecord: TeamRosterPageData['h2hRecord']
  let totalPoints: number | undefined

  if (league.scoring_mode === 'H2H') {
    const { data: h2hStandings } = await supabase
      .from('h2h_matchups')
      .select(`
        home_team_id,
        away_team_id,
        home_points,
        away_points,
        round,
        is_completed
      `)
      .eq('league_id', leagueId)
      .eq('is_completed', true)

    // Calculate ranking for this team
    if (h2hStandings) {
      const records: Record<
        string,
        {
          wins: number
          draws: number
          losses: number
          pointsFor: number
          pointsAgainst: number
          pointDifference: number
          h2hPoints: number
        }
      > = {}

      h2hStandings.forEach((m) => {
        if (m.home_points === null || m.away_points === null) return

        if (!records[m.home_team_id]) {
          records[m.home_team_id] = { wins: 0, draws: 0, losses: 0, pointsFor: 0, pointsAgainst: 0, pointDifference: 0, h2hPoints: 0 }
        }
        if (!records[m.away_team_id]) {
          records[m.away_team_id] = { wins: 0, draws: 0, losses: 0, pointsFor: 0, pointsAgainst: 0, pointDifference: 0, h2hPoints: 0 }
        }

        const hp = Number(m.home_points)
        const ap = Number(m.away_points)

        records[m.home_team_id].pointsFor += hp
        records[m.home_team_id].pointsAgainst += ap
        records[m.home_team_id].pointDifference = records[m.home_team_id].pointsFor - records[m.home_team_id].pointsAgainst

        records[m.away_team_id].pointsFor += ap
        records[m.away_team_id].pointsAgainst += hp
        records[m.away_team_id].pointDifference = records[m.away_team_id].pointsFor - records[m.away_team_id].pointsAgainst

        if (hp > ap) {
          records[m.home_team_id].wins += 1
          records[m.home_team_id].h2hPoints += 3
          records[m.away_team_id].losses += 1
        } else if (ap > hp) {
          records[m.away_team_id].wins += 1
          records[m.away_team_id].h2hPoints += 3
          records[m.home_team_id].losses += 1
        } else {
          records[m.home_team_id].draws += 1
          records[m.home_team_id].h2hPoints += 1
          records[m.away_team_id].draws += 1
          records[m.away_team_id].h2hPoints += 1
        }
      })

      h2hRecord = records[teamId]
      if (h2hRecord) {
        totalPoints = Number(h2hRecord.pointsFor.toFixed(1))
      }

      // Order teams by h2hPoints desc, then pointDifference desc
      const sortedTeams = Object.keys(records).sort((a, b) => {
        if (records[b].h2hPoints !== records[a].h2hPoints) {
          return records[b].h2hPoints - records[a].h2hPoints
        }
        return records[b].pointDifference - records[a].pointDifference
      })
      const foundIdx = sortedTeams.indexOf(teamId)
      if (foundIdx !== -1) {
        rank = foundIdx + 1
      }
    }
  }

  // 6. Fetch Fixtures for Current Round to map next opponents
  const { data: fixtures } = await supabase
    .from('fixtures')
    .select(`
      id,
      round,
      status,
      home_club_id,
      away_club_id,
      home_club:real_clubs!fixtures_home_club_id_fkey(short_name, logo_url),
      away_club:real_clubs!fixtures_away_club_id_fkey(short_name, logo_url)
    `)
    .eq('season_id', league.season_id)
    .eq('round', currentRound)

  const clubNextMatchMap = new Map<
    string,
    {
      round: number
      opponentShort: string
      opponentLogo: string | null
      isHome: boolean
      status: string
    }
  >()

  if (fixtures) {
    fixtures.forEach((fix) => {
      const homeClub = fix.home_club as any
      const awayClub = fix.away_club as any

      if (fix.home_club_id && awayClub) {
        clubNextMatchMap.set(fix.home_club_id, {
          round: fix.round,
          opponentShort: awayClub.short_name,
          opponentLogo: awayClub.logo_url,
          isHome: true,
          status: fix.status,
        })
      }
      if (fix.away_club_id && homeClub) {
        clubNextMatchMap.set(fix.away_club_id, {
          round: fix.round,
          opponentShort: homeClub.short_name,
          opponentLogo: homeClub.logo_url,
          isHome: false,
          status: fix.status,
        })
      }
    })
  }

  // 7. Fetch All Roster Players
  const { data: rosterRows, error: rosterErr } = await supabase
    .from('roster_players')
    .select(`
      player:real_players!roster_players_player_id_fkey(
        id,
        name,
        position,
        photo_url,
        avg_points,
        total_minutes,
        club:real_clubs(
          id,
          name,
          short_name,
          logo_url
        )
      )
    `)
    .eq('fantasy_team_id', teamId)

  if (rosterErr || !rosterRows) {
    return null
  }

  const players: TeamRosterPlayer[] = []

  for (const r of rosterRows) {
    const p = r.player as any
    if (!p) continue

    const club = p.club as any
    const nextMatch = club?.id ? clubNextMatchMap.get(club.id) : null

    players.push({
      id: p.id,
      name: p.name,
      position: p.position as any,
      photoUrl: p.photo_url,
      avgPoints: Number(p.avg_points ?? 0),
      totalMinutes: Number(p.total_minutes ?? 0),
      club: club
        ? {
            id: club.id,
            name: club.name,
            shortName: club.short_name,
            logoUrl: club.logo_url,
          }
        : null,
      nextMatch: nextMatch ?? null,
    })
  }

  const countsByPosition: Record<'GOL' | 'LAT' | 'ZAG' | 'MEI' | 'ATA', number> = {
    GOL: 0,
    LAT: 0,
    ZAG: 0,
    MEI: 0,
    ATA: 0,
  }

  players.forEach((p) => {
    if (countsByPosition[p.position] !== undefined) {
      countsByPosition[p.position]++
    }
  })

  return {
    leagueId,
    leagueName: league.name,
    scoringMode: league.scoring_mode as any,
    teamId,
    teamName: team.name,
    coachName,
    isMyTeam,
    isCommissioner,
    currentRound,
    totalRounds,
    rank,
    h2hRecord,
    totalPoints,
    players,
    countsByPosition,
  }
}
