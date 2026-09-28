export type LeagueStatus = 'open' | 'drafting' | 'active' | 'closed'

const VALID_TRANSITIONS: Record<LeagueStatus, LeagueStatus[]> = {
  open: ['drafting'],
  drafting: ['active', 'open'], // open is fallback if draft is reset/cancelled
  active: ['closed'],
  closed: [],
}

export function canTransitionLeagueStatus(
  currentStatus: LeagueStatus,
  newStatus: LeagueStatus
): boolean {
  return VALID_TRANSITIONS[currentStatus]?.includes(newStatus) ?? false
}
