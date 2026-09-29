import { describe, it, expect } from 'vitest'
import { h2hRoundsNeeded, canStartH2H } from '@/lib/league/h2h-validation'
import { generateInviteCode } from '@/lib/league/invite'
import { canTransitionLeagueStatus } from '@/lib/league/state-machine'
import { createLeagueSchema, joinLeagueSchema } from '@/lib/validations/league'

describe('H2H Validation', () => {
  it('calculates rounds needed for even number of teams', () => {
    expect(h2hRoundsNeeded(2)).toBe(1)
    expect(h2hRoundsNeeded(8)).toBe(7)
    expect(h2hRoundsNeeded(10)).toBe(9)
    expect(h2hRoundsNeeded(20)).toBe(19)
  })

  it('calculates rounds needed for odd number of teams', () => {
    expect(h2hRoundsNeeded(3)).toBe(3)
    expect(h2hRoundsNeeded(9)).toBe(9)
    expect(h2hRoundsNeeded(15)).toBe(15)
  })

  it('calculates rounds needed for double round-robin (Ida e Volta)', () => {
    expect(h2hRoundsNeeded(4, 'DOUBLE_ROUND')).toBe(6)
    expect(h2hRoundsNeeded(10, 'DOUBLE_ROUND')).toBe(18)
    expect(h2hRoundsNeeded(20, 'DOUBLE_ROUND')).toBe(38)
  })

  it('validates if H2H can start with remaining rounds and format', () => {
    expect(canStartH2H(10, 38, 'SINGLE_ROUND')).toBe(true)
    expect(canStartH2H(10, 9, 'SINGLE_ROUND')).toBe(true)
    expect(canStartH2H(10, 8, 'SINGLE_ROUND')).toBe(false)
    expect(canStartH2H(12, 10, 'SINGLE_ROUND')).toBe(false)
    expect(canStartH2H(4, 6, 'DOUBLE_ROUND')).toBe(true)
    expect(canStartH2H(4, 5, 'DOUBLE_ROUND')).toBe(false)
    expect(canStartH2H(20, 38, 'DOUBLE_ROUND')).toBe(true)
  })
})

describe('Invite Code Generator', () => {
  it('generates an 8-character string without ambiguous characters', () => {
    const code = generateInviteCode()
    expect(code).toHaveLength(8)
    expect(code).toMatch(/^[2-9A-HJ-NP-Z]{8}$/)
  })

  it('generates unique codes', () => {
    const codes = new Set(Array.from({ length: 100 }, () => generateInviteCode()))
    expect(codes.size).toBe(100)
  })
})

describe('League State Machine', () => {
  it('allows valid state transitions', () => {
    expect(canTransitionLeagueStatus('open', 'drafting')).toBe(true)
    expect(canTransitionLeagueStatus('drafting', 'active')).toBe(true)
    expect(canTransitionLeagueStatus('active', 'closed')).toBe(true)
  })

  it('rejects invalid state transitions', () => {
    expect(canTransitionLeagueStatus('open', 'active')).toBe(false)
    expect(canTransitionLeagueStatus('closed', 'open')).toBe(false)
    expect(canTransitionLeagueStatus('active', 'open')).toBe(false)
  })
})

describe('League Validation Schemas', () => {
  it('validates create league schema successfully', () => {
    const validData = {
      name: 'Liga dos Campeões',
      teamCap: 10,
      scoringMode: 'H2H',
      draftMode: 'HYBRID',
      pickTimerSeconds: 90,
    }
    const result = createLeagueSchema.safeParse(validData)
    expect(result.success).toBe(true)
  })

  it('rejects invalid teamCap', () => {
    const invalidData = {
      name: 'Liga Teste',
      teamCap: 1, // min is 2
      scoringMode: 'TOTAL',
      draftMode: 'MANUAL',
      pickTimerSeconds: 90,
    }
    const result = createLeagueSchema.safeParse(invalidData)
    expect(result.success).toBe(false)
  })

  it('validates join league schema', () => {
    const valid = joinLeagueSchema.safeParse({
      inviteCode: 'abc12345',
      teamName: 'Meu Time FC',
    })
    expect(valid.success).toBe(true)
    if (valid.success) {
      expect(valid.data.inviteCode).toBe('ABC12345')
    }
  })
})
