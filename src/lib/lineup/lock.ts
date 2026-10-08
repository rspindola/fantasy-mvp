import { createClient } from '@/lib/supabase/server'
import { FORMATION_REQUIREMENTS, type Formation } from './lineup-engine'

export interface RoundLockStatus {
  isLocked: boolean
  kickoffAt: string | null
  roundNumber: number
}

/**
 * Checks if the market for a given fixture round is locked.
 * Locked when current time >= first fixture kickoff_at of that round.
 */
export async function checkRoundLockStatus(
  seasonId: string,
  fixtureRound: number
): Promise<RoundLockStatus> {
  const supabase = await createClient()

  // Fetch earliest kickoff_at for fixtures in this round
  const { data: fixtures, error } = await supabase
    .from('fixtures')
    .select('kickoff_at')
    .eq('season_id', seasonId)
    .eq('round', fixtureRound)
    .order('kickoff_at', { ascending: true })
    .limit(1)

  if (error || !fixtures || fixtures.length === 0 || !fixtures[0].kickoff_at) {
    // If no fixtures found or no kickoff set, default to unlocked
    return { isLocked: false, kickoffAt: null, roundNumber: fixtureRound }
  }

  const kickoffTime = new Date(fixtures[0].kickoff_at).getTime()
  // Market closes exactly 30 minutes before the first kickoff of the round
  const marketLockTime = kickoffTime - 30 * 60 * 1000
  const now = Date.now()

  return {
    isLocked: now >= marketLockTime,
    kickoffAt: fixtures[0].kickoff_at,
    roundNumber: fixtureRound,
  }
}

/**
 * Generates an automatic fallback starting 11 lineup for a team using 4-3-3 formation.
 */
export function generateAutoFallbackLineup(
  roster: { id: string; position: 'GOL' | 'LAT' | 'ZAG' | 'MEI' | 'ATA'; avgPoints: number }[]
): {
  formation: Formation
  starters: { playerId: string; position: 'GOL' | 'LAT' | 'ZAG' | 'MEI' | 'ATA'; isCaptain: boolean }[]
  reserves: { playerId: string; position: 'GOL' | 'LAT' | 'ZAG' | 'MEI' | 'ATA'; isCaptain: boolean }[]
} {
  const formation: Formation = '4-3-3'
  const reqs = FORMATION_REQUIREMENTS[formation]

  const starters: { playerId: string; position: 'GOL' | 'LAT' | 'ZAG' | 'MEI' | 'ATA'; isCaptain: boolean }[] = []

  // Group roster players by position sorted by avgPoints DESC
  const grouped: Record<string, typeof roster> = { GOL: [], LAT: [], ZAG: [], MEI: [], ATA: [] }
  roster.forEach((p) => grouped[p.position]?.push(p))

  for (const pos of Object.keys(grouped)) {
    grouped[pos].sort((a, b) => b.avgPoints - a.avgPoints)
  }

  // Pick top required players per position
  for (const [pos, count] of Object.entries(reqs)) {
    const pool = grouped[pos] || []
    for (let i = 0; i < count && i < pool.length; i++) {
      starters.push({
        playerId: pool[i].id,
        position: pos as any,
        isCaptain: false,
      })
    }
  }

  // Pick top remaining player per position as reserves (1 for each pos: GOL, LAT, ZAG, MEI, ATA)
  const starterPlayerIds = new Set(starters.map((s) => s.playerId))
  const reserves: { playerId: string; position: 'GOL' | 'LAT' | 'ZAG' | 'MEI' | 'ATA'; isCaptain: boolean }[] = []

  for (const pos of ['GOL', 'LAT', 'ZAG', 'MEI', 'ATA'] as const) {
    const pool = grouped[pos] || []
    const reserveCandidate = pool.find((p) => !starterPlayerIds.has(p.id))
    if (reserveCandidate) {
      reserves.push({
        playerId: reserveCandidate.id,
        position: pos,
        isCaptain: false,
      })
    }
  }

  // Set captain to top avgPoints starter
  let topStarterId: string | null = null
  let topAvg = -Infinity
  for (const s of starters) {
    const p = roster.find((r) => r.id === s.playerId)
    if (p && p.avgPoints > topAvg) {
      topAvg = p.avgPoints
      topStarterId = s.playerId
    }
  }

  if (topStarterId) {
    for (const s of starters) {
      if (s.playerId === topStarterId) {
        s.isCaptain = true
      }
    }
  }

  return { formation, starters, reserves }
}

/**
 * Automatically completes an incomplete lineup (or builds a full one if empty).
 * Preserves already selected starters/reserves/captain, filling any missing positions
 * with the highest avgPoints players available in the roster.
 */
export function autoCompleteLineup(
  roster: { id: string; position: 'GOL' | 'LAT' | 'ZAG' | 'MEI' | 'ATA'; avgPoints: number }[],
  existingFormation: Formation = '4-3-3',
  existingStarters: { playerId: string; position: 'GOL' | 'LAT' | 'ZAG' | 'MEI' | 'ATA'; isCaptain: boolean }[] = [],
  existingReserves: { playerId: string; position: 'GOL' | 'LAT' | 'ZAG' | 'MEI' | 'ATA'; isCaptain: boolean }[] = []
): {
  formation: Formation
  starters: { playerId: string; position: 'GOL' | 'LAT' | 'ZAG' | 'MEI' | 'ATA'; isCaptain: boolean }[]
  reserves: { playerId: string; position: 'GOL' | 'LAT' | 'ZAG' | 'MEI' | 'ATA'; isCaptain: boolean }[]
} {
  const formation = existingFormation || '4-3-3'
  const reqs = FORMATION_REQUIREMENTS[formation]

  // Validate existing starters against roster
  const validStarterIds = new Set(roster.map((r) => r.id))
  const cleanExistingStarters = existingStarters.filter((s) => validStarterIds.has(s.playerId))

  // Count existing starters by position and keep up to allowed count
  const posCounts: Record<string, number> = { GOL: 0, LAT: 0, ZAG: 0, MEI: 0, ATA: 0 }
  const starters: { playerId: string; position: 'GOL' | 'LAT' | 'ZAG' | 'MEI' | 'ATA'; isCaptain: boolean }[] = []

  for (const s of cleanExistingStarters) {
    if ((posCounts[s.position] || 0) < reqs[s.position]) {
      posCounts[s.position] = (posCounts[s.position] || 0) + 1
      starters.push({ ...s })
    }
  }

  const assignedPlayerIds = new Set(starters.map((s) => s.playerId))

  // Group remaining roster players by position sorted by avgPoints DESC
  const groupedRemaining: Record<string, typeof roster> = { GOL: [], LAT: [], ZAG: [], MEI: [], ATA: [] }
  roster.forEach((p) => {
    if (!assignedPlayerIds.has(p.id)) {
      groupedRemaining[p.position]?.push(p)
    }
  })
  for (const pos of Object.keys(groupedRemaining)) {
    groupedRemaining[pos].sort((a, b) => b.avgPoints - a.avgPoints)
  }

  // Fill missing starter positions
  for (const [pos, count] of Object.entries(reqs)) {
    const currentCount = posCounts[pos] || 0
    const needed = count - currentCount
    const pool = groupedRemaining[pos] || []

    for (let i = 0; i < needed && i < pool.length; i++) {
      starters.push({
        playerId: pool[i].id,
        position: pos as any,
        isCaptain: false,
      })
      assignedPlayerIds.add(pool[i].id)
    }
  }

  // Ensure Captain
  const hasCaptain = starters.some((s) => s.isCaptain)
  if (!hasCaptain && starters.length > 0) {
    let topStarterId: string | null = null
    let topAvg = -Infinity
    for (const s of starters) {
      const p = roster.find((r) => r.id === s.playerId)
      if (p && p.avgPoints > topAvg) {
        topAvg = p.avgPoints
        topStarterId = s.playerId
      }
    }
    if (topStarterId) {
      for (const s of starters) {
        if (s.playerId === topStarterId) {
          s.isCaptain = true
          break
        }
      }
    } else {
      starters[0].isCaptain = true
    }
  }

  // Reserves
  const cleanExistingReserves = existingReserves.filter(
    (r) => validStarterIds.has(r.playerId) && !assignedPlayerIds.has(r.playerId)
  )
  const reserves: { playerId: string; position: 'GOL' | 'LAT' | 'ZAG' | 'MEI' | 'ATA'; isCaptain: boolean }[] = []
  const reservePositionsFilled = new Set<string>()

  for (const r of cleanExistingReserves) {
    if (!reservePositionsFilled.has(r.position)) {
      reservePositionsFilled.add(r.position)
      reserves.push({ ...r, isCaptain: false })
      assignedPlayerIds.add(r.playerId)
    }
  }

  // Fill remaining reserve positions (1 for each: GOL, LAT, ZAG, MEI, ATA)
  for (const pos of ['GOL', 'LAT', 'ZAG', 'MEI', 'ATA'] as const) {
    if (!reservePositionsFilled.has(pos)) {
      const pool = groupedRemaining[pos]?.filter((p) => !assignedPlayerIds.has(p.id)) || []
      if (pool.length > 0) {
        reserves.push({
          playerId: pool[0].id,
          position: pos,
          isCaptain: false,
        })
        assignedPlayerIds.add(pool[0].id)
      }
    }
  }

  return { formation, starters, reserves }
}

/**
 * Checks all teams in a league for a given fixture round.
 * If the market is locked (or if force=true), automatically completes any lineup with fewer than 11 starters
 * using previous round lineup if available, or generating a fallback 4-3-3, and saves it into Supabase.
 */
export async function ensureLockedRoundLineups(
  leagueId: string,
  fixtureRound: number,
  options?: { force?: boolean; supabaseClient?: any }
): Promise<{ teamsAutoCompleted: number }> {
  const supabase = options?.supabaseClient || (await createClient())

  // 1. Get league and verify lock status
  const { data: league } = await supabase
    .from('leagues')
    .select('id, season_id')
    .eq('id', leagueId)
    .single()

  if (!league) return { teamsAutoCompleted: 0 }

  if (!options?.force) {
    const lockStatus = await checkRoundLockStatus(league.season_id, fixtureRound)
    if (!lockStatus.isLocked) {
      // Market is not locked yet - managers can still set their own lineups
      return { teamsAutoCompleted: 0 }
    }
  }

  // 2. Fetch all teams in the league
  const { data: teams } = await supabase
    .from('fantasy_teams')
    .select('id, name')
    .eq('league_id', leagueId)

  if (!teams || teams.length === 0) return { teamsAutoCompleted: 0 }

  let count = 0

  for (const team of teams) {
    // Check existing lineup for this round
    const { data: existingLineup } = await supabase
      .from('lineups')
      .select('id, formation')
      .eq('fantasy_team_id', team.id)
      .eq('fixture_round', fixtureRound)
      .maybeSingle()

    let startersCount = 0
    let existingSlots: any[] = []
    let formationToUse: Formation = (existingLineup?.formation as Formation) || '4-3-3'

    if (existingLineup) {
      const { data: slots } = await supabase
        .from('lineup_slots')
        .select('player_id, slot_position, is_captain, is_starter, player:real_players(position)')
        .eq('lineup_id', existingLineup.id)

      existingSlots = slots || []
      startersCount = existingSlots.filter((s: any) => s.is_starter).length
    }

    // If already has 11 starters, skip
    if (startersCount >= 11) {
      continue
    }

    // If team has no slots for this round, check if they had a lineup in previous round (carry-over)
    if (existingSlots.length === 0 && fixtureRound > 1) {
      const { data: prevLineup } = await supabase
        .from('lineups')
        .select('id, formation')
        .eq('fantasy_team_id', team.id)
        .eq('fixture_round', fixtureRound - 1)
        .maybeSingle()

      if (prevLineup) {
        if (!existingLineup?.formation && prevLineup.formation) {
          formationToUse = prevLineup.formation as Formation
        }
        const { data: prevSlots } = await supabase
          .from('lineup_slots')
          .select('player_id, slot_position, is_captain, is_starter, player:real_players(position)')
          .eq('lineup_id', prevLineup.id)

        if (prevSlots && prevSlots.length > 0) {
          existingSlots = prevSlots
        }
      }
    }

    // Fetch team roster
    const { data: rosterRows } = await supabase
      .from('roster_players')
      .select(`
        player:real_players(
          id,
          position,
          avg_points
        )
      `)
      .eq('fantasy_team_id', team.id)

    const roster = (rosterRows || [])
      .map((r: any) => ({
        id: r.player?.id,
        position: r.player?.position,
        avgPoints: Number(r.player?.avg_points ?? 0),
      }))
      .filter((r: any) => r.id && r.position)

    if (roster.length === 0) continue

    const existingStarters = existingSlots
      .filter((s: any) => s.is_starter)
      .map((s: any) => ({
        playerId: s.player_id,
        position: s.player?.position,
        isCaptain: s.is_captain ?? false,
      }))

    const existingReserves = existingSlots
      .filter((s: any) => !s.is_starter)
      .map((s: any) => ({
        playerId: s.player_id,
        position: s.player?.position,
        isCaptain: false,
      }))

    const completed = autoCompleteLineup(
      roster,
      formationToUse,
      existingStarters,
      existingReserves
    )

    // Upsert lineup
    const { data: savedLineup, error: lErr } = await supabase
      .from('lineups')
      .upsert(
        {
          fantasy_team_id: team.id,
          fixture_round: fixtureRound,
          formation: completed.formation,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'fantasy_team_id,fixture_round' }
      )
      .select('id')
      .single()

    if (lErr || !savedLineup) {
      if (lErr) console.error(`[ensureLockedRoundLineups] Error saving lineup for ${team.id}:`, lErr)
      continue
    }

    // Delete old slots and insert new
    await supabase.from('lineup_slots').delete().eq('lineup_id', savedLineup.id)

    const starterRecords = completed.starters.map((s, idx) => ({
      lineup_id: savedLineup.id,
      player_id: s.playerId,
      slot_position: `${s.position}_${idx + 1}`,
      is_captain: s.isCaptain,
      is_starter: true,
    }))

    const reserveRecords = completed.reserves.map((s) => ({
      lineup_id: savedLineup.id,
      player_id: s.playerId,
      slot_position: `RES_${s.position}`,
      is_captain: false,
      is_starter: false,
    }))

    const { error: insErr } = await supabase.from('lineup_slots').insert([...starterRecords, ...reserveRecords])
    if (insErr) {
      console.error(`[ensureLockedRoundLineups] Error inserting slots for ${team.id}:`, insErr)
      continue
    }

    count++
  }

  return { teamsAutoCompleted: count }
}

/**
 * Creates or ensures initial lineups for all teams in a league for a given fixture round,
 * regardless of whether the market is currently locked.
 */
export async function populateInitialLineupsForLeague(
  leagueId: string,
  fixtureRound: number
): Promise<{ teamsAutoCompleted: number }> {
  return ensureLockedRoundLineups(leagueId, fixtureRound, { force: true })
}

