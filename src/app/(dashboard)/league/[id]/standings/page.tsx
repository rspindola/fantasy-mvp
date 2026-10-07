'use client'

import { useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'

export default function StandingsPage() {
  const params = useParams()
  const router = useRouter()
  const leagueId = params.id as string

  useEffect(() => {
    if (leagueId) {
      router.replace(`/league/${leagueId}`)
    }
  }, [leagueId, router])

  return (
    <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-secondary)' }}>
      Redirecionando para a tela inicial da liga...
    </div>
  )
}
