import Link from 'next/link'
import { getMyLeagues } from './actions'
import { LeagueGrid } from '@/components/league/LeagueGrid'
import styles from './page.module.css'

export default async function DashboardPage() {
  const leagues = await getMyLeagues()

  return (
    <div className={styles.container}>
      {/* Top Hero Section */}
      <div className={styles.topSection}>
        <div className={styles.greeting}>
          <span className={styles.seasonBadge}>Temporada 2025/2026 Oficial</span>
          <h1 className={styles.title}>Painel do Jogador</h1>
          <p className={styles.subtitle}>
            Gerencie suas ligas ativas, dispute confrontos diretos ou entre em uma nova competição agora mesmo.
          </p>
        </div>

        <div className={styles.actionControls}>
          <form action="/join" method="GET" className={styles.joinForm}>
            <div className={styles.joinInputWrapper}>
              <svg className={styles.joinIcon} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.35-4.35" />
              </svg>
              <input
                type="text"
                name="code"
                placeholder="Código da Liga"
                maxLength={8}
                required
                className={styles.joinInput}
              />
            </div>
            <button type="submit" className={styles.joinSubmitBtn}>
              Entrar
            </button>
          </form>

          <Link href="/league/create" className={styles.createBtn}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="16" />
              <line x1="8" y1="12" x2="16" y2="12" />
            </svg>
            Criar Nova Liga
          </Link>
        </div>
      </div>

      {/* Leagues List & Grid with Filter Tabs */}
      <LeagueGrid initialLeagues={leagues} />
    </div>
  )
}
