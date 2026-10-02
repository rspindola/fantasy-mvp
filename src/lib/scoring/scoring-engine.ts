export interface PlayerScouts {
  position: 'GOL' | 'LAT' | 'ZAG' | 'MEI' | 'ATA'
  minutes: number
  goals: number
  assists: number
  shotsOnWoodwork: number
  shotsOnTarget: number
  shotsOffTarget: number
  foulsDrawn: number
  penaltiesWon: number
  passesCompleted?: number
  passesFailed: number
  offsides: number
  penaltiesMissed: number
  cleanSheet: boolean
  saves: number
  penaltySaves: number
  tackles: number
  foulsCommitted: number
  ownGoals: number
  yellowCards: number
  redCards: number
  goalsConceded: number
  penaltiesCommitted: number
}

export const SCOUT_POINTS = {
  // Attack
  G: 8.0, // Gol
  A: 4.0, // Assistência
  FT: 3.0, // Finalização na trave
  FD: 1.2, // Finalização defendida
  FF: 0.8, // Finalização para fora
  FS: 0.5, // Falta sofrida
  PS: 1.0, // Pênalti sofrido
  PC: 0.1, // Passe completo / certo
  PE: -0.1, // Passe incompleto / errado
  I: -0.1, // Impedimento
  PP: -4.0, // Pênalti perdido

  // Defense
  SG: 5.0, // Jogo sem sofrer gol (GOL, ZAG, LAT)
  DP: 7.0, // Defesa de pênalti (GOL)
  DE: 1.3, // Defesa difícil (GOL)
  DS: 1.5, // Desarme
  FC: -0.3, // Falta cometida
  GC: -3.0, // Gol contra
  CA: -1.0, // Cartão amarelo
  CV: -3.0, // Cartão vermelho
  GS: -1.0, // Gol sofrido (GOL)
  PEN_C: -1.0, // Pênalti cometido
}

/**
 * Calculates raw Cartola FC fantasy points for a player based on stats and position rules.
 */
export function calculatePlayerScoring(scouts: PlayerScouts): number {
  if (scouts.minutes === 0) return 0.0

  let pts = 0.0

  // Attack Scouts
  pts += (scouts.goals || 0) * SCOUT_POINTS.G
  pts += (scouts.assists || 0) * SCOUT_POINTS.A
  pts += (scouts.shotsOnWoodwork || 0) * SCOUT_POINTS.FT
  pts += (scouts.shotsOnTarget || 0) * SCOUT_POINTS.FD
  pts += (scouts.shotsOffTarget || 0) * SCOUT_POINTS.FF
  pts += (scouts.foulsDrawn || 0) * SCOUT_POINTS.FS
  pts += (scouts.penaltiesWon || 0) * SCOUT_POINTS.PS
  pts += (scouts.passesCompleted || 0) * SCOUT_POINTS.PC
  pts += (scouts.passesFailed || 0) * SCOUT_POINTS.PE
  pts += (scouts.offsides || 0) * SCOUT_POINTS.I
  pts += (scouts.penaltiesMissed || 0) * SCOUT_POINTS.PP

  // Defense Scouts
  pts += (scouts.tackles || 0) * SCOUT_POINTS.DS
  pts += (scouts.foulsCommitted || 0) * SCOUT_POINTS.FC
  pts += (scouts.ownGoals || 0) * SCOUT_POINTS.GC
  pts += (scouts.yellowCards || 0) * SCOUT_POINTS.CA
  pts += (scouts.redCards || 0) * SCOUT_POINTS.CV
  pts += (scouts.penaltiesCommitted || 0) * SCOUT_POINTS.PEN_C

  // Position-specific Defense Scouts
  if (scouts.position === 'GOL') {
    pts += (scouts.saves || 0) * SCOUT_POINTS.DE
    pts += (scouts.penaltySaves || 0) * SCOUT_POINTS.DP
    pts += (scouts.goalsConceded || 0) * SCOUT_POINTS.GS
    if (scouts.cleanSheet) pts += SCOUT_POINTS.SG
  } else if (scouts.position === 'ZAG' || scouts.position === 'LAT') {
    if (scouts.cleanSheet) pts += SCOUT_POINTS.SG
  }

  return parseFloat(pts.toFixed(2))
}

/**
 * Calculates total round points for a team given 11 starter scores and captain.
 * Captain receives 1.5x multiplier.
 */
export function calculateTeamRoundScore(
  starters: { points: number; isCaptain: boolean }[]
): { totalPoints: number; captainBonus: number } {
  let rawSum = 0
  let captainBonus = 0

  for (const s of starters) {
    rawSum += s.points
    if (s.isCaptain) {
      captainBonus = parseFloat((s.points * 0.5).toFixed(2))
    }
  }

  const totalPoints = parseFloat((rawSum + captainBonus).toFixed(2))

  return { totalPoints, captainBonus }
}
