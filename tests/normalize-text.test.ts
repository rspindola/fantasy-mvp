import { describe, it, expect } from 'vitest'
import { normalizeText } from '@/lib/utils/format'

describe('normalizeText', () => {
  it('matches searches with and without accents (e.g. Rene and Renê)', () => {
    const playerWithAccent = 'Renê'
    const playerWithoutAccent = 'Rene'

    const queryWithoutAccent = 'Rene'
    const queryWithAccent = 'Renê'

    // Searching 'Rene' should match both 'Renê' and 'Rene'
    expect(normalizeText(playerWithAccent).includes(normalizeText(queryWithoutAccent))).toBe(true)
    expect(normalizeText(playerWithoutAccent).includes(normalizeText(queryWithoutAccent))).toBe(true)

    // Searching 'Renê' should match both 'Renê' and 'Rene'
    expect(normalizeText(playerWithAccent).includes(normalizeText(queryWithAccent))).toBe(true)
    expect(normalizeText(playerWithoutAccent).includes(normalizeText(queryWithAccent))).toBe(true)
  })

  it('normalizes common brazilian names and club names with accents', () => {
    expect(normalizeText('São Paulo')).toBe('sao paulo')
    expect(normalizeText('Grêmio')).toBe('gremio')
    expect(normalizeText('Cássio')).toBe('cassio')
    expect(normalizeText('Éverton Cebolinha')).toBe('everton cebolinha')
  })

  it('handles empty strings and nullish values safely', () => {
    expect(normalizeText('')).toBe('')
    expect(normalizeText(null)).toBe('')
    expect(normalizeText(undefined)).toBe('')
  })
})
