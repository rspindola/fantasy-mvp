import Link from 'next/link'
import { getMyLeagues } from './actions'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import styles from './page.module.css'

function getStatusBadge(status: string) {
  switch (status) {
    case 'open':
      return <Badge variant="status">Aberto</Badge>
    case 'drafting':
      return <Badge variant="MEI">Em Draft</Badge>
    case 'active':
      return <Badge variant="GOL">Ativa</Badge>
    case 'closed':
      return <Badge variant="default">Encerrada</Badge>
    default:
      return <Badge variant="default">{status}</Badge>
  }
}

export default async function DashboardPage() {
  const leagues = await getMyLeagues()

  return (
    <div className={styles.container}>
      {/* Top Header & Actions */}
      <div className={styles.topSection}>
        <div className={styles.greeting}>
          <h1 className={styles.title}>Painel do Jogador</h1>
          <p className={styles.subtitle}>
            Gerencie suas ligas ou entre em uma nova competição.
          </p>
        </div>

        <div className={styles.actionControls}>
          <form action="/join" method="GET" className={styles.joinForm}>
            <input
              type="text"
              name="code"
              placeholder="Código da Liga"
              maxLength={8}
              required
              className={styles.joinInput}
            />
            <Button variant="primary" size="md" type="submit">
              Entrar na Liga
            </Button>
          </form>
        </div>
      </div>

      {/* Minhas Ligas Section */}
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>Minhas Ligas</h2>
        <span className={styles.leagueCount}>{leagues.length} {leagues.length === 1 ? 'liga' : 'ligas'}</span>
      </div>

      {leagues.length === 0 ? (
        <div className={styles.emptyState}>
          <span className={styles.emptyIcon}>🏆</span>
          <h3 className={styles.emptyTitle}>Você ainda não está em nenhuma liga</h3>
          <p className={styles.emptyText}>
            A criação de novas ligas está temporariamente suspensa. Insira o código de convite fornecido pelo comissário para entrar na liga.
          </p>
        </div>
      ) : (
        <div className={styles.grid}>
          {leagues.map((league) => (
            <Link
              key={league.id}
              href={`/league/${league.id}`}
              className={styles.card}
            >
              <div className={styles.cardTop}>
                <div className={styles.cardHeader}>
                  <h3 className={styles.leagueName}>{league.name}</h3>
                  {getStatusBadge(league.status)}
                </div>

                <div className={styles.teamMeta}>
                  <span>Time:</span>
                  <span className={styles.myTeam}>{league.teamName}</span>
                </div>

                <div className={styles.badges}>
                  <Badge variant="default">{league.scoringMode}</Badge>
                  <Badge variant="default">Draft {league.draftMode}</Badge>
                </div>
              </div>

              <div className={styles.cardFooter}>
                <span>
                  👥 {league.teamCount} / {league.teamCap} times
                </span>
                {league.isCommissioner && (
                  <span className={styles.commissionerBadge}>⭐ Comissário</span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
