export interface PickPayload {
  pickNumber: number
  round: number
  teamId: string
  teamName: string
  playerId: string
  playerName: string
  playerPosition: string
  clubShortName: string
  isAutoPick: boolean
}

export interface DraftCompletePayload {
  leagueId: string
  completedAt: string
}

export const DRAFT_EVENTS = {
  PICK_MADE: 'pick_made',
  DRAFT_COMPLETE: 'draft_complete',
}
