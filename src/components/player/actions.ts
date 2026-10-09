'use server'

import { createClient } from '@/lib/supabase/server'

export type PlayerDetailScoutsSummary = {
  totalPoints: number
  avgPoints: number
  matchesPlayed: number
  totalMinutes: number
  goals: number
  assists: number
  shotsOnTarget: number
  shotsOffTarget: number
  shotsOnWoodwork: number
  foulsDrawn: number
  passesCompleted: number
  passesFailed: number
  penaltiesWon: number
  penaltiesMissed: number
  cleanSheet: number
  saves: number
  penaltySaves: number
  tackles: number
  foulsCommitted: number
  yellowCards: number
  redCards: number
  ownGoals: number
  goalsConceded: number
  penaltiesCommitted: number
}

export type PlayerRoundHistoryItem = {
  round: number
  fixtureDate: string | null
  status: 'scheduled' | 'live' | 'FT' | 'postponed'
  isHome: boolean
  opponentClub: {
    id: string
    name: string
    shortName: string
    logoUrl: string | null
  }
  scoreText: string | null
  minutes: number
  points: number
  scouts: {
    goals: number
    assists: number
    shotsOnTarget: number
    shotsOffTarget: number
    shotsOnWoodwork: number
    cleanSheet: boolean
    saves: number
    penaltySaves: number
    tackles: number
    foulsDrawn: number
    foulsCommitted: number
    yellowCards: number
    redCards: number
    passesCompleted: number
    passesFailed: number
  }
}

export type ScoutBreakdownItem = {
  code: string
  label: string
  count: number
  unitPoints: number
  totalPoints: number
  isPositive: boolean
}

export type PlayerRoundDetail = {
  round: number
  fixtureDate: string | null
  status: 'scheduled' | 'live' | 'FT' | 'postponed'
  homeClub: {
    id: string
    name: string
    shortName: string
    logoUrl: string | null
  }
  awayClub: {
    id: string
    name: string
    shortName: string
    logoUrl: string | null
  }
  homeScore: number | null
  awayScore: number | null
  scoreText: string | null
  isHome: boolean
  opponentClub: {
    id: string
    name: string
    shortName: string
    logoUrl: string | null
  }
  minutes: number
  points: number
  hasStats: boolean
  scouts: {
    goals: number
    assists: number
    shotsOnTarget: number
    shotsOffTarget: number
    shotsOnWoodwork: number
    foulsDrawn: number
    passesCompleted: number
    passesFailed: number
    offsides: number
    penaltiesWon: number
    penaltiesMissed: number
    cleanSheet: boolean
    saves: number
    penaltySaves: number
    tackles: number
    foulsCommitted: number
    yellowCards: number
    redCards: number
    ownGoals: number
    goalsConceded: number
    penaltiesCommitted: number
  }
  breakdown: ScoutBreakdownItem[]
}

export type UpcomingFixtureItem = {
  round: number
  kickoffAt: string | null
  status: 'scheduled' | 'live' | 'FT' | 'postponed'
  isHome: boolean
  opponentClub: {
    id: string
    name: string
    shortName: string
    logoUrl: string | null
  }
}

export type PlayerDetailData = {
  player: {
    id: string
    name: string
    position: 'GOL' | 'LAT' | 'ZAG' | 'MEI' | 'ATA'
    photoUrl: string | null
    avgPoints: number
    totalMinutes: number
  }
  club: {
    id: string
    name: string
    shortName: string
    logoUrl: string | null
  }
  owner: {
    fantasyTeamId: string
    teamName: string
    managerName: string
  } | null
  targetRound?: number
  roundDetail?: PlayerRoundDetail | null
  summary: PlayerDetailScoutsSummary
  history: PlayerRoundHistoryItem[]
  upcoming: UpcomingFixtureItem[]
}

function buildScoutBreakdown(
  position: 'GOL' | 'LAT' | 'ZAG' | 'MEI' | 'ATA',
  st: any
): ScoutBreakdownItem[] {
  if (!st) return []
  const items: ScoutBreakdownItem[] = []

  const add = (code: string, label: string, count: number, unitPoints: number) => {
    if (!count || count <= 0) return
    const totalPoints = Number((count * unitPoints).toFixed(2))
    items.push({
      code,
      label,
      count,
      unitPoints,
      totalPoints,
      isPositive: totalPoints >= 0,
    })
  }

  // Attack
  add('G', 'Gol Marcado', st.goals ?? 0, 8.0)
  add('A', 'Assistência', st.assists ?? 0, 4.0)
  add('FT', 'Finalização na Trave', st.shots_on_woodwork ?? 0, 3.0)
  add('FD', 'Finalização Defendida', st.shots_on_target ?? 0, 1.2)
  add('FF', 'Finalização para Fora', st.shots_off_target ?? 0, 0.8)
  add('FS', 'Falta Sofrida', st.fouls_drawn ?? 0, 0.5)
  add('PS', 'Pênalti Sofrido', st.penalties_won ?? 0, 1.0)
  add('PC', 'Passe Certo', st.passes_completed ?? 0, 0.1)
  add('PE', 'Passe Incompleto', st.passes_failed ?? 0, -0.1)
  add('I', 'Impedimento', st.offsides ?? 0, -0.1)
  add('PP', 'Pênalti Perdido', st.penalties_missed ?? 0, -4.0)

  // Defense
  if (position === 'GOL' || position === 'LAT' || position === 'ZAG') {
    if (st.clean_sheet) {
      add('SG', 'Sem Sofrer Gol (SG)', 1, 5.0)
    }
  }
  if (position === 'GOL') {
    add('DP', 'Defesa de Pênalti', st.penalty_saves ?? 0, 7.0)
    add('DE', 'Defesa Difícil', st.saves ?? 0, 1.3)
    add('GS', 'Gol Sofrido', st.goals_conceded ?? 0, -1.0)
  }
  add('DS', 'Desarme', st.tackles ?? 0, 1.5)
  add('FC', 'Falta Cometida', st.fouls_committed ?? 0, -0.3)
  add('CA', 'Cartão Amarelo', st.yellow_cards ?? 0, -1.0)
  add('CV', 'Cartão Vermelho', st.red_cards ?? 0, -3.0)
  add('GC', 'Gol Contra', st.own_goals ?? 0, -3.0)
  add('PEN_C', 'Pênalti Cometido', st.penalties_committed ?? 0, -1.0)

  return items
}

export async function getPlayerDetailModalData(
  playerId: string,
  leagueId?: string,
  targetRound?: number
): Promise<PlayerDetailData | null> {
  const supabase = await createClient()

  // 1. Fetch player & club info
  const { data: player, error: playerError } = await supabase
    .from('real_players')
    .select(`
      id,
      name,
      position,
      photo_url,
      avg_points,
      total_minutes,
      club:real_clubs!inner(
        id,
        name,
        short_name,
        logo_url,
        season_id
      )
    `)
    .eq('id', playerId)
    .single()

  if (playerError || !player) {
    console.error('Error fetching player detail:', playerError)
    return null
  }

  const club = player.club as any

  // 2. Fetch fantasy owner in current league if leagueId provided
  let owner: PlayerDetailData['owner'] = null
  if (leagueId) {
    const { data: rosterEntry } = await supabase
      .from('roster_players')
      .select(`
        fantasy_team:fantasy_teams!inner(
          id,
          name,
          league_id,
          profile:profiles!fantasy_teams_user_id_fkey(display_name)
        )
      `)
      .eq('player_id', playerId)
      .eq('fantasy_team.league_id', leagueId)
      .maybeSingle()

    if (rosterEntry?.fantasy_team) {
      const ft = rosterEntry.fantasy_team as any
      owner = {
        fantasyTeamId: ft.id,
        teamName: ft.name,
        managerName: ft.profile?.display_name ?? 'Técnico',
      }
    }
  }

  // 3. Fetch all fixtures for this player's club in this season
  const { data: allClubFixtures } = await supabase
    .from('fixtures')
    .select(`
      id,
      round,
      kickoff_at,
      status,
      home_club_id,
      away_club_id,
      home_score,
      away_score,
      homeClub:real_clubs!fixtures_home_club_id_fkey(id, name, short_name, logo_url),
      awayClub:real_clubs!fixtures_away_club_id_fkey(id, name, short_name, logo_url)
    `)
    .eq('season_id', club.season_id)
    .or(`home_club_id.eq.${club.id},away_club_id.eq.${club.id}`)
    .order('round', { ascending: true })

  const clubFixtures = allClubFixtures || []

  // 4. Fetch player's stats across all fixtures
  const fixtureIds = clubFixtures.map((f: any) => f.id)
  const { data: statsData } = await supabase
    .from('player_fixture_stats')
    .select('*')
    .eq('player_id', playerId)
    .in('fixture_id', fixtureIds)

  const statsByFixtureId = new Map<string, any>()
  ;(statsData || []).forEach((st: any) => {
    statsByFixtureId.set(st.fixture_id, st)
  })

  // 5. Build summary
  const summary: PlayerDetailScoutsSummary = {
    totalPoints: 0,
    avgPoints: 0,
    matchesPlayed: 0,
    totalMinutes: 0,
    goals: 0,
    assists: 0,
    shotsOnTarget: 0,
    shotsOffTarget: 0,
    shotsOnWoodwork: 0,
    foulsDrawn: 0,
    passesCompleted: 0,
    passesFailed: 0,
    penaltiesWon: 0,
    penaltiesMissed: 0,
    cleanSheet: 0,
    saves: 0,
    penaltySaves: 0,
    tackles: 0,
    foulsCommitted: 0,
    yellowCards: 0,
    redCards: 0,
    ownGoals: 0,
    goalsConceded: 0,
    penaltiesCommitted: 0,
  }

  ;(statsData || []).forEach((st: any) => {
    const pts = Number(st.computed_points ?? 0)
    summary.totalPoints += pts
    const mins = st.minutes ?? 0
    summary.totalMinutes += mins
    if (mins > 0) summary.matchesPlayed += 1

    summary.goals += st.goals ?? 0
    summary.assists += st.assists ?? 0
    summary.shotsOnTarget += st.shots_on_target ?? 0
    summary.shotsOffTarget += st.shots_off_target ?? 0
    summary.shotsOnWoodwork += st.shots_on_woodwork ?? 0
    summary.foulsDrawn += st.fouls_drawn ?? 0
    summary.passesCompleted += st.passes_completed ?? 0
    summary.passesFailed += st.passes_failed ?? 0
    summary.penaltiesWon += st.penalties_won ?? 0
    summary.penaltiesMissed += st.penalties_missed ?? 0
    if (st.clean_sheet) summary.cleanSheet += 1
    summary.saves += st.saves ?? 0
    summary.penaltySaves += st.penalty_saves ?? 0
    summary.tackles += st.tackles ?? 0
    summary.foulsCommitted += st.fouls_committed ?? 0
    summary.yellowCards += st.yellow_cards ?? 0
    summary.redCards += st.red_cards ?? 0
    summary.ownGoals += st.own_goals ?? 0
    summary.goalsConceded += st.goals_conceded ?? 0
    summary.penaltiesCommitted += st.penalties_committed ?? 0
  })

  summary.avgPoints =
    summary.matchesPlayed > 0 ? Number((summary.totalPoints / summary.matchesPlayed).toFixed(2)) : 0
  summary.totalPoints = Number(summary.totalPoints.toFixed(2))

  // 6. Build Round-by-Round History (completed or played fixtures)
  const history: PlayerRoundHistoryItem[] = []
  const upcoming: UpcomingFixtureItem[] = []

  clubFixtures.forEach((f: any) => {
    const isHome = f.home_club_id === club.id
    const opponentClub = isHome ? f.awayClub : f.homeClub
    const stat = statsByFixtureId.get(f.id)

    if (f.status === 'FT' || f.status === 'live' || stat) {
      let scoreText: string | null = null
      if (f.home_score !== null && f.away_score !== null) {
        scoreText = isHome
          ? `${f.home_score} - ${f.away_score}`
          : `${f.away_score} - ${f.home_score}`
      }

      history.push({
        round: f.round,
        fixtureDate: f.kickoff_at,
        status: f.status,
        isHome,
        opponentClub: {
          id: opponentClub.id,
          name: opponentClub.name,
          shortName: opponentClub.short_name,
          logoUrl: opponentClub.logo_url,
        },
        scoreText,
        minutes: stat?.minutes ?? 0,
        points: Number(stat?.computed_points ?? 0),
        scouts: {
          goals: stat?.goals ?? 0,
          assists: stat?.assists ?? 0,
          shotsOnTarget: stat?.shots_on_target ?? 0,
          shotsOffTarget: stat?.shots_off_target ?? 0,
          shotsOnWoodwork: stat?.shots_on_woodwork ?? 0,
          cleanSheet: Boolean(stat?.clean_sheet),
          saves: stat?.saves ?? 0,
          penaltySaves: stat?.penalty_saves ?? 0,
          tackles: stat?.tackles ?? 0,
          foulsDrawn: stat?.fouls_drawn ?? 0,
          foulsCommitted: stat?.fouls_committed ?? 0,
          yellowCards: stat?.yellow_cards ?? 0,
          redCards: stat?.red_cards ?? 0,
          passesCompleted: stat?.passes_completed ?? 0,
          passesFailed: stat?.passes_failed ?? 0,
        },
      })
    } else if (f.status === 'scheduled' || f.status === 'postponed') {
      upcoming.push({
        round: f.round,
        kickoffAt: f.kickoff_at,
        status: f.status,
        isHome,
        opponentClub: {
          id: opponentClub.id,
          name: opponentClub.name,
          shortName: opponentClub.short_name,
          logoUrl: opponentClub.logo_url,
        },
      })
    }
  })

  // Sort history descending by round (most recent first)
  history.sort((a, b) => b.round - a.round)
  // Take next 5 upcoming fixtures
  const upcomingSliced = upcoming.slice(0, 5)

  // 7. Build roundDetail for targetRound (or latest active/relevant fixture)
  const selectedRoundFixture = targetRound
    ? clubFixtures.find((f: any) => f.round === targetRound)
    : clubFixtures.find((f: any) => f.status === 'live') ||
      [...clubFixtures].reverse().find((f: any) => f.status === 'FT' && statsByFixtureId.has(f.id)) ||
      clubFixtures.find((f: any) => f.status === 'scheduled')

  let roundDetail: PlayerRoundDetail | null = null
  if (selectedRoundFixture) {
    const rawHome = selectedRoundFixture.homeClub as any
    const homeClub = Array.isArray(rawHome) ? rawHome[0] : rawHome
    const rawAway = selectedRoundFixture.awayClub as any
    const awayClub = Array.isArray(rawAway) ? rawAway[0] : rawAway
    const isHome = selectedRoundFixture.home_club_id === club.id
    const opponentClub = isHome ? awayClub : homeClub

    const st = statsByFixtureId.get(selectedRoundFixture.id)
    let scoreText: string | null = null
    if (selectedRoundFixture.home_score !== null && selectedRoundFixture.away_score !== null) {
      scoreText = `${selectedRoundFixture.home_score} x ${selectedRoundFixture.away_score}`
    }

    const scouts = {
      goals: st?.goals ?? 0,
      assists: st?.assists ?? 0,
      shotsOnTarget: st?.shots_on_target ?? 0,
      shotsOffTarget: st?.shots_off_target ?? 0,
      shotsOnWoodwork: st?.shots_on_woodwork ?? 0,
      foulsDrawn: st?.fouls_drawn ?? 0,
      passesCompleted: st?.passes_completed ?? 0,
      passesFailed: st?.passes_failed ?? 0,
      offsides: st?.offsides ?? 0,
      penaltiesWon: st?.penalties_won ?? 0,
      penaltiesMissed: st?.penalties_missed ?? 0,
      cleanSheet: Boolean(st?.clean_sheet),
      saves: st?.saves ?? 0,
      penaltySaves: st?.penalty_saves ?? 0,
      tackles: st?.tackles ?? 0,
      foulsCommitted: st?.fouls_committed ?? 0,
      yellowCards: st?.yellow_cards ?? 0,
      redCards: st?.red_cards ?? 0,
      ownGoals: st?.own_goals ?? 0,
      goalsConceded: st?.goals_conceded ?? 0,
      penaltiesCommitted: st?.penalties_committed ?? 0,
    }

    const breakdown = buildScoutBreakdown(player.position as any, st)

    roundDetail = {
      round: selectedRoundFixture.round,
      fixtureDate: selectedRoundFixture.kickoff_at,
      status: selectedRoundFixture.status,
      homeClub: {
        id: homeClub?.id ?? '',
        name: homeClub?.name ?? '',
        shortName: homeClub?.short_name ?? '',
        logoUrl: homeClub?.logo_url ?? null,
      },
      awayClub: {
        id: awayClub?.id ?? '',
        name: awayClub?.name ?? '',
        shortName: awayClub?.short_name ?? '',
        logoUrl: awayClub?.logo_url ?? null,
      },
      homeScore: selectedRoundFixture.home_score,
      awayScore: selectedRoundFixture.away_score,
      scoreText,
      isHome,
      opponentClub: {
        id: opponentClub?.id ?? '',
        name: opponentClub?.name ?? '',
        shortName: opponentClub?.short_name ?? '',
        logoUrl: opponentClub?.logo_url ?? null,
      },
      minutes: st?.minutes ?? 0,
      points: Number(st?.computed_points ?? 0),
      hasStats: Boolean(st),
      scouts,
      breakdown,
    }
  }

  return {
    player: {
      id: player.id,
      name: player.name,
      position: player.position as any,
      photoUrl: player.photo_url,
      avgPoints: summary.avgPoints || Number(player.avg_points ?? 0),
      totalMinutes: summary.totalMinutes || (player.total_minutes ?? 0),
    },
    club: {
      id: club.id,
      name: club.name,
      shortName: club.short_name,
      logoUrl: club.logo_url,
    },
    owner,
    targetRound,
    roundDetail,
    summary,
    history,
    upcoming: upcomingSliced,
  }
}
