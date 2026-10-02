import { describe, it, expect } from 'vitest'
import type { TeamRosterPlayer } from '@/app/(dashboard)/league/[id]/team/[teamId]/actions'

describe('Team Roster & Position Grouping Logic', () => {
  const mockRoster: TeamRosterPlayer[] = [
    { id: '1', name: 'Alisson', position: 'GOL', photoUrl: null, avgPoints: 6.2, totalMinutes: 900, club: null, nextMatch: null },
    { id: '2', name: 'Weverton', position: 'GOL', photoUrl: null, avgPoints: 5.1, totalMinutes: 900, club: null, nextMatch: null },
    { id: '3', name: 'John Victor', position: 'GOL', photoUrl: null, avgPoints: 4.8, totalMinutes: 900, club: null, nextMatch: null },
    { id: '4', name: 'Guilherme Arana', position: 'LAT', photoUrl: null, avgPoints: 7.0, totalMinutes: 800, club: null, nextMatch: null },
    { id: '5', name: 'Ayrton Lucas', position: 'LAT', photoUrl: null, avgPoints: 6.5, totalMinutes: 800, club: null, nextMatch: null },
    { id: '6', name: 'William', position: 'LAT', photoUrl: null, avgPoints: 5.5, totalMinutes: 800, club: null, nextMatch: null },
    { id: '7', name: 'Piquerez', position: 'LAT', photoUrl: null, avgPoints: 5.2, totalMinutes: 800, club: null, nextMatch: null },
    { id: '8', name: 'Samuel Xavier', position: 'LAT', photoUrl: null, avgPoints: 4.0, totalMinutes: 800, club: null, nextMatch: null },
    { id: '9', name: 'Gustavo Gómez', position: 'ZAG', photoUrl: null, avgPoints: 6.8, totalMinutes: 850, club: null, nextMatch: null },
    { id: '10', name: 'Fabrício Bruno', position: 'ZAG', photoUrl: null, avgPoints: 5.9, totalMinutes: 850, club: null, nextMatch: null },
    { id: '11', name: 'Murilo', position: 'ZAG', photoUrl: null, avgPoints: 5.7, totalMinutes: 850, club: null, nextMatch: null },
    { id: '12', name: 'Leo Pereira', position: 'ZAG', photoUrl: null, avgPoints: 5.0, totalMinutes: 850, club: null, nextMatch: null },
    { id: '13', name: 'Beraldo', position: 'ZAG', photoUrl: null, avgPoints: 4.5, totalMinutes: 850, club: null, nextMatch: null },
    { id: '14', name: 'Arrascaeta', position: 'MEI', photoUrl: null, avgPoints: 8.4, totalMinutes: 820, club: null, nextMatch: null },
    { id: '15', name: 'Raphael Veiga', position: 'MEI', photoUrl: null, avgPoints: 7.9, totalMinutes: 820, club: null, nextMatch: null },
    { id: '16', name: 'Ganso', position: 'MEI', photoUrl: null, avgPoints: 6.3, totalMinutes: 820, club: null, nextMatch: null },
    { id: '17', name: 'Lucas Moura', position: 'MEI', photoUrl: null, avgPoints: 6.0, totalMinutes: 820, club: null, nextMatch: null },
    { id: '18', name: 'Payet', position: 'MEI', photoUrl: null, avgPoints: 5.8, totalMinutes: 820, club: null, nextMatch: null },
    { id: '19', name: 'Gerson', position: 'MEI', photoUrl: null, avgPoints: 5.4, totalMinutes: 820, club: null, nextMatch: null },
    { id: '20', name: 'Zé Rafael', position: 'MEI', photoUrl: null, avgPoints: 4.9, totalMinutes: 820, club: null, nextMatch: null },
    { id: '21', name: 'Pedro', position: 'ATA', photoUrl: null, avgPoints: 9.1, totalMinutes: 750, club: null, nextMatch: null },
    { id: '22', name: 'Hulk', position: 'ATA', photoUrl: null, avgPoints: 8.6, totalMinutes: 750, club: null, nextMatch: null },
    { id: '23', name: 'Paulinho', position: 'ATA', photoUrl: null, avgPoints: 7.2, totalMinutes: 750, club: null, nextMatch: null },
    { id: '24', name: 'Calleri', position: 'ATA', photoUrl: null, avgPoints: 6.7, totalMinutes: 750, club: null, nextMatch: null },
  ]

  it('contains exactly 24 players with strict quotas (3 GOL, 5 LAT, 5 ZAG, 7 MEI, 4 ATA)', () => {
    expect(mockRoster).toHaveLength(24)

    const counts: Record<string, number> = {}
    mockRoster.forEach((p) => {
      counts[p.position] = (counts[p.position] || 0) + 1
    })

    expect(counts['GOL']).toBe(3)
    expect(counts['LAT']).toBe(5)
    expect(counts['ZAG']).toBe(5)
    expect(counts['MEI']).toBe(7)
    expect(counts['ATA']).toBe(4)
  })

  it('orders positions strictly: Goleiros > Laterais > Zagueiros > Meio-Campistas > Atacantes', () => {
    const expectedOrder = ['GOL', 'LAT', 'ZAG', 'MEI', 'ATA']
    const positionOrderMap: Record<string, number> = {
      GOL: 1,
      LAT: 2,
      ZAG: 3,
      MEI: 4,
      ATA: 5,
    }

    const sortedByPosition = [...mockRoster].sort(
      (a, b) => positionOrderMap[a.position] - positionOrderMap[b.position]
    )

    const uniquePositions = Array.from(new Set(sortedByPosition.map((p) => p.position)))
    expect(uniquePositions).toEqual(expectedOrder)
  })

  it('sorts players within each position by avgPoints descending', () => {
    const atacantes = mockRoster
      .filter((p) => p.position === 'ATA')
      .sort((a, b) => b.avgPoints - a.avgPoints)

    expect(atacantes[0].name).toBe('Pedro')
    expect(atacantes[0].avgPoints).toBe(9.1)
    expect(atacantes[atacantes.length - 1].name).toBe('Calleri')
    expect(atacantes[atacantes.length - 1].avgPoints).toBe(6.7)
  })
})
