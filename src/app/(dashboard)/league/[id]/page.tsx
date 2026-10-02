'use client'

import { useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { getLeagueDetails, startDraftAction, type LeagueDetails } from './actions'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import styles from './page.module.css'

export default function LeagueDetailsPage() {
  const params = useParams()
  const leagueId = params.id as string

  const [league, setLeague] = useState<LeagueDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [copiedLink, setCopiedLink] = useState(false)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    if (leagueId) {
      getLeagueDetails(leagueId).then((res) => {
        setLeague(res)
        setLoading(false)
      })
    }
  }, [leagueId])

  const handleCopyCode = () => {
    if (league?.inviteCode) {
      navigator.clipboard.writeText(league.inviteCode)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleCopyLink = () => {
    if (typeof window !== 'undefined' && league?.inviteCode) {
      const url = `${window.location.origin}/join/${league.inviteCode}`
      navigator.clipboard.writeText(url)
      setCopiedLink(true)
      setTimeout(() => setCopiedLink(false), 2000)
    }
  }

  const handleShareWhatsApp = () => {
    if (typeof window !== 'undefined' && league) {
      const url = `${window.location.origin}/join/${league.inviteCode}`
      const text = encodeURIComponent(
        `⚽ Venha jogar na minha liga "${league.name}" no Fantasy Draft Série A!\n\n` +
          `🏆 Modo: ${league.scoringMode === 'H2H' ? 'Duelos H2H' : 'Pontuação Geral'} | Draft Fechado (jogadores únicos)\n` +
          `Entre agora pelo link:\n${url}\n\n` +
          `Ou use o código de convite: *${league.inviteCode}*`
      )
      window.open(`https://api.whatsapp.com/send?text=${text}`, '_blank')
    }
  }

  const handleStartDraft = () => {
    setError(null)
    startTransition(async () => {
      try {
        await startDraftAction(leagueId)
      } catch (err: any) {
        setError(err.message || 'Erro ao iniciar o draft.')
      }
    })
  }

  if (loading) {
    return (
      <div className={styles.container}>
        <p>Carregando detalhes da liga...</p>
      </div>
    )
  }

  if (!league) {
    return (
      <div className={styles.container}>
        <h2>Liga Não Encontrada</h2>
        <Link href="/dashboard">
          <Button size="md">Voltar ao Painel</Button>
        </Link>
      </div>
    )
  }

  const isDraftable = league.teams.length >= 2
  const isDrafting = league.status === 'drafting'
  const isActive = league.status === 'active'

  return (
    <div className={styles.container}>
      <Link href="/dashboard" className={styles.backLink}>
        ← Voltar ao painel
      </Link>

      {/* Header Card */}
      <div className={styles.headerCard}>
        <div className={styles.headerTop}>
          <div className={styles.titleArea}>
            <h1 className={styles.title}>{league.name}</h1>
            {league.status === 'open' && <Badge variant="status">Inscrições Abertas</Badge>}
            {league.status === 'drafting' && <Badge variant="MEI">Em Draft</Badge>}
            {league.status === 'active' && <Badge variant="GOL">Ativa</Badge>}
            {league.status === 'closed' && <Badge variant="default">Encerrada</Badge>}
          </div>

          <div className={styles.codeBox}>
            <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>Convite:</span>
            <span className={styles.codeText}>{league.inviteCode}</span>
            <button
              onClick={handleCopyCode}
              className={styles.copyButton}
              title="Copiar código de convite"
            >
              {copied ? '✓ Copiado!' : '📋 Código'}
            </button>
            <button
              onClick={handleCopyLink}
              className={styles.copyButton}
              title="Copiar link direto de entrada"
            >
              {copiedLink ? '✓ Link Copiado!' : '🔗 Link'}
            </button>
            <button
              onClick={handleShareWhatsApp}
              className={styles.whatsappButton}
              title="Convidar amigos via WhatsApp"
            >
              💬 WhatsApp
            </button>
          </div>
        </div>

        <div className={styles.configBadges}>
          <Badge variant="default">
            Pontuação {league.scoringMode}
            {league.scoringMode === 'H2H' &&
              ` (${league.h2hFormat === 'SINGLE_ROUND' ? 'Turno Único' : 'Ida e Volta'})`}
          </Badge>
          <Badge variant="default">Draft {league.draftMode}</Badge>
          <Badge variant="default">Timer: {league.pickTimerSeconds}s</Badge>
          <Badge variant="default">
            {league.teams.length} / {league.teamCap} times inscritos
          </Badge>
        </div>

        {/* Action Button for Draft */}
        <div className={styles.actionBox}>
          {error && <div className={styles.errorText}>⚠️ {error}</div>}

          {isDrafting && (
            <Link href={`/league/${league.id}/draft`}>
              <Button size="lg" style={{ width: '100%' }}>
                🚀 Ir para a Sala de Draft (Em Andamento!)
              </Button>
            </Link>
          )}

          {isActive && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', gap: '12px' }}>
                <Link href={`/league/${league.id}/lineup`} style={{ flex: 1 }}>
                  <Button size="lg" style={{ width: '100%' }}>
                    ⚽ Escalar Meu Time
                  </Button>
                </Link>
                <Link href={`/league/${league.id}/standings`} style={{ flex: 1 }}>
                  <Button variant="secondary" size="lg" style={{ width: '100%' }}>
                    🏆 Classificação & Duelos
                  </Button>
                </Link>
              </div>
              <div style={{ display: 'flex', gap: '12px' }}>
                <Link href={`/league/${league.id}/rules`} style={{ flex: 1 }}>
                  <Button variant="ghost" size="md" style={{ width: '100%' }}>
                    📜 Regras da Liga & Tabela
                  </Button>
                </Link>
                {league.isCommissioner && (
                  <Link href={`/league/${league.id}/admin`} style={{ flex: 1 }}>
                    <Button
                      variant="secondary"
                      size="md"
                      style={{
                        width: '100%',
                        borderColor: 'rgba(234, 179, 8, 0.5)',
                        color: '#fbbf24',
                        background: 'rgba(234, 179, 8, 0.08)',
                      }}
                    >
                      👑 Painel do Comissário
                    </Button>
                  </Link>
                )}
              </div>
            </div>
          )}

          {league.status === 'open' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {league.isCommissioner ? (
                <Button
                  size="lg"
                  disabled={!isDraftable || isPending}
                  isLoading={isPending}
                  onClick={handleStartDraft}
                >
                  {isPending
                    ? 'Iniciando Draft...'
                    : !isDraftable
                    ? 'Aguardando pelo menos 2 times...'
                    : '⚡ Iniciar Draft Snake Agora'}
                </Button>
              ) : (
                <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                  Aguardando o comissário iniciar o draft.
                </p>
              )}
              <Link href={`/league/${league.id}/rules`}>
                <Button variant="ghost" size="md" style={{ width: '100%' }}>
                  📜 Regras da Liga & Tabela de Pontuação
                </Button>
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Grid: Times Inscritos + Regras */}
      <div className={styles.grid}>
        {/* Times Inscritos */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>
            <span>Times Inscritos ({league.teams.length})</span>
          </div>

          <div className={styles.teamList}>
            {league.teams.map((t, idx) => (
              <Link
                key={t.id}
                href={`/league/${league.id}/team/${t.id}`}
                className={`${styles.teamRow} ${t.isMe ? styles.teamRowMe : ''}`}
                title="Clique para ver o elenco completo de 24 atletas"
              >
                <div className={styles.teamInfo}>
                  <span className={styles.teamName}>
                    #{idx + 1} {t.name} {t.isMe ? '(Seu Time)' : ''} 🛡️
                  </span>
                  <span className={styles.ownerName}>Técnico: {t.displayName} · Ver Elenco →</span>
                </div>
                {t.userId === league.commissionerId && (
                  <Badge variant="status">Comissário</Badge>
                )}
              </Link>
            ))}
          </div>
        </div>

        {/* Regras da Liga */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>
            <span>Regras & Formato</span>
          </div>

          <div className={styles.rulesList}>
            <div className={styles.ruleItem}>
              <span>Elenco por Time</span>
              <span className={styles.ruleValue}>24 jogadores</span>
            </div>
            <div className={styles.ruleItem}>
              <span>Distribuição do Elenco</span>
              <span className={styles.ruleValue}>2G / 8DEF (min 2Z, 2L) / 8M / 6A</span>
            </div>
            <div className={styles.ruleItem}>
              <span>Unicidade</span>
              <span className={styles.ruleValue}>Exclusivo na liga</span>
            </div>
            <div className={styles.ruleItem}>
              <span>Formato do Draft</span>
              <span className={styles.ruleValue}>Snake (Ordem invertida)</span>
            </div>
            <div className={styles.ruleItem}>
              <span>Estouro de Timer</span>
              <span className={styles.ruleValue}>
                {league.draftMode === 'HYBRID' ? 'Auto-pick' : 'Skip / Comissário'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
