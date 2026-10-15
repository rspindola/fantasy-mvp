import https from 'https'

export interface ChampionshipInfo {
  id: number
  name: string
  logoUrl: string | null
  country?: string | null
}

const championshipCache = new Map<number, ChampionshipInfo>()

// Default fallbacks for major leagues
const FALLBACK_CHAMPIONSHIPS: Record<number, ChampionshipInfo> = {
  71: {
    id: 71,
    name: 'Brasileirão Série A',
    logoUrl: 'https://media.api-sports.io/football/leagues/71.png',
    country: 'Brazil',
  },
  39: {
    id: 39,
    name: 'Premier League',
    logoUrl: 'https://media.api-sports.io/football/leagues/39.png',
    country: 'England',
  },
  140: {
    id: 140,
    name: 'La Liga',
    logoUrl: 'https://media.api-sports.io/football/leagues/140.png',
    country: 'Spain',
  },
  78: {
    id: 78,
    name: 'Bundesliga',
    logoUrl: 'https://media.api-sports.io/football/leagues/78.png',
    country: 'Germany',
  },
  61: {
    id: 61,
    name: 'Ligue 1',
    logoUrl: 'https://media.api-sports.io/football/leagues/61.png',
    country: 'France',
  },
  135: {
    id: 135,
    name: 'Serie A',
    logoUrl: 'https://media.api-sports.io/football/leagues/135.png',
    country: 'Italy',
  },
  2: {
    id: 2,
    name: 'UEFA Champions League',
    logoUrl: 'https://media.api-sports.io/football/leagues/2.png',
    country: 'World',
  },
}

function fetchLeagueFromApiFootball(leagueId: number, apiKey: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'v3.football.api-sports.io',
      path: `/leagues?id=${leagueId}`,
      headers: {
        'x-apisports-key': apiKey,
      },
      timeout: 5000,
    }

    const req = https.get(options, (res) => {
      let body = ''
      res.on('data', (chunk) => (body += chunk))
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body)
          resolve(parsed)
        } catch (e) {
          reject(e)
        }
      })
    })

    req.on('error', reject)
    req.on('timeout', () => {
      req.destroy()
      reject(new Error('API-Football request timed out'))
    })
  })
}

/**
 * Fetches championship information (name and logo) from API-Football,
 * with caching and graceful fallbacks.
 */
export async function getChampionshipInfo(leagueApiId: number): Promise<ChampionshipInfo> {
  if (championshipCache.has(leagueApiId)) {
    return championshipCache.get(leagueApiId)!
  }

  const fallback = FALLBACK_CHAMPIONSHIPS[leagueApiId] || {
    id: leagueApiId,
    name: `Campeonato #${leagueApiId}`,
    logoUrl: `https://media.api-sports.io/football/leagues/${leagueApiId}.png`,
    country: null,
  }

  const apiKey = process.env.FOOTBALL_API_KEY
  if (!apiKey) {
    championshipCache.set(leagueApiId, fallback)
    return fallback
  }

  try {
    const data = await fetchLeagueFromApiFootball(leagueApiId, apiKey)
    const item = data?.response?.[0]

    if (item && item.league) {
      let name = item.league.name
      // Special naming refinement for Brazilian league
      if (leagueApiId === 71 && item.country?.name === 'Brazil') {
        name = 'Brasileirão Série A'
      }

      const info: ChampionshipInfo = {
        id: leagueApiId,
        name: name || fallback.name,
        logoUrl: item.league.logo || fallback.logoUrl,
        country: item.country?.name || fallback.country,
      }

      championshipCache.set(leagueApiId, info)
      return info
    }
  } catch (err) {
    console.warn(`Failed to fetch championship from API-Football for ID ${leagueApiId}:`, err)
  }

  championshipCache.set(leagueApiId, fallback)
  return fallback
}
