'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { getLeagueRulesData, type LeagueRulesData } from './actions'
import { formatTimerSeconds } from '@/lib/utils/format'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import styles from './page.module.css'

export default function LeagueRulesPage() {
  const params = useParams()
  const leagueId = params.id as string

  const [data, setData] = useState<LeagueRulesData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (leagueId) {
      getLeagueRulesData(leagueId).then((res) => {
        setData(res)
        setLoading(false)
      })
    }
  }, [leagueId])

  if (loading) {
    return (
      <div className={styles.container}>
        <p>Carregando Regras da Liga...</p>
      </div>
    )
  }

  if (!data) {
    return (
      <div className={styles.container}>
        <h2>Liga não encontrada</h2>
        <Link href="/dashboard">
          <Button size="md">Voltar ao Painel</Button>
        </Link>
      </div>
    )
  }

  return (
    <div className={styles.container}>
      <Link href={`/league/${leagueId}`} className={styles.backLink}>
        ← Voltar à liga
      </Link>

      {/* Header */}
      <div className={styles.headerCard}>
        <h1 className={styles.title}>Regras & Pontuação — {data.name}</h1>
        <p className={styles.subtitle}>
          Transparência total sobre as configurações definidas pelo comissário{' '}
          <strong>{data.commissionerName}</strong>, formato do draft e tabela de scouts.
        </p>
      </div>

      {/* Seção 1: Regras do Draft & Liga (Dinâmicas) */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <span style={{ fontSize: '1.5rem' }}>⚙️</span>
          <h2 className={styles.sectionTitle}>Configurações Específicas desta Liga</h2>
        </div>

        <div className={styles.grid}>
          <div className={styles.infoBox}>
            <span className={styles.infoLabel}>Limite de Times</span>
            <span className={styles.infoValue}>{data.teamCap} times</span>
            <span className={styles.infoSub}>Draft fechado com times únicos</span>
          </div>

          <div className={styles.infoBox}>
            <span className={styles.infoLabel}>Modo de Pontuação</span>
            <span className={styles.infoValue}>{data.scoringMode}</span>
            <span className={styles.infoSub}>
              {data.scoringMode === 'H2H'
                ? 'Confrontos diretos rodada a rodada (3 pts vitória)'
                : 'Pontuação total acumulada ao longo da Série A'}
            </span>
          </div>

          <div className={styles.infoBox}>
            <span className={styles.infoLabel}>Modo de Draft</span>
            <span className={styles.infoValue}>Draft {data.draftMode}</span>
            <span className={styles.infoSub}>
              {data.draftMode === 'HYBRID'
                ? 'Tempo por pick + auto-pick no estouro do timer'
                : data.draftMode === 'MANUAL'
                ? 'Draft manual gerenciado pelo comissário'
                : 'Draft 100% automático'}
            </span>
          </div>

          <div className={styles.infoBox}>
            <span className={styles.infoLabel}>Tempo por Escolha</span>
            <span className={styles.infoValue}>
              {formatTimerSeconds(data.pickTimerSeconds)}
            </span>
            <span className={styles.infoSub}>Definido pelo comissário</span>
          </div>

          <div className={styles.infoBox}>
            <span className={styles.infoLabel}>Composição do Elenco</span>
            <span className={styles.infoValue}>24 Jogadores</span>
            <span className={styles.infoSub}>2 GOL, 8 DEF (min 2 ZAG/2 LAT), 8 MEI, 6 ATA</span>
          </div>

          <div className={styles.infoBox}>
            <span className={styles.infoLabel}>Formato do Draft</span>
            <span className={styles.infoValue}>Snake Order</span>
            <span className={styles.infoSub}>Ordem invertida em rodadas pares</span>
          </div>
        </div>

        <div className={styles.rulesList} style={{ marginTop: '12px' }}>
          <h4>📋 Funcionamento do Draft:</h4>
          <ul>
            <li>
              <strong>Fila de Desejos (⭐ Wishlist):</strong> Você pode favoritar jogadores
              clicando em <code>+ Fila</code> na Sala de Draft. Se seu tempo expirar, o sistema
              dará preferência à sua fila antes de usar o algoritmo de média.
            </li>
            <li>
              <strong>Pausa do Draft (⏸️):</strong> O comissário pode pausar/retomar o draft a
              qualquer momento (ex: durante a noite). Nenhum timer expira durante a pausa.
            </li>
            <li>
              <strong>Unicidade:</strong> Cada jogador real pertence exclusivamente a 1 time na liga.
            </li>
          </ul>
        </div>
      </div>

      {/* Seção 2: Tabela Completa de Scouts (Cartola FC) */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <span style={{ fontSize: '1.5rem' }}>📊</span>
          <h2 className={styles.sectionTitle}>Tabela Oficial de Pontuação (Cartola FC)</h2>
        </div>

        <h3 style={{ fontSize: '1.0625rem', color: 'var(--accent-green)' }}>⚽ Scouts de Ataque (Ofensivos)</h3>
        <div className={styles.tableContainer}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th style={{ width: '80px' }}>Sigla</th>
                <th>Estatística / Scout</th>
                <th style={{ textAlign: 'right' }}>Pontuação</th>
                <th>Posições Elegíveis</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><span className={styles.badgeSigla}>G</span></td>
                <td>Gol marcado</td>
                <td style={{ textAlign: 'right' }} className={styles.ptsPositive}>+8.0 pts</td>
                <td>Todas</td>
              </tr>
              <tr>
                <td><span className={styles.badgeSigla}>A</span></td>
                <td>Assistência (passe para gol)</td>
                <td style={{ textAlign: 'right' }} className={styles.ptsPositive}>+4.0 pts</td>
                <td>Todas</td>
              </tr>
              <tr>
                <td><span className={styles.badgeSigla}>FT</span></td>
                <td>Finalização na trave</td>
                <td style={{ textAlign: 'right' }} className={styles.ptsPositive}>+3.0 pts</td>
                <td>Todas</td>
              </tr>
              <tr>
                <td><span className={styles.badgeSigla}>FD</span></td>
                <td>Finalização defendida</td>
                <td style={{ textAlign: 'right' }} className={styles.ptsPositive}>+1.2 pts</td>
                <td>Todas</td>
              </tr>
              <tr>
                <td><span className={styles.badgeSigla}>FF</span></td>
                <td>Finalização para fora</td>
                <td style={{ textAlign: 'right' }} className={styles.ptsPositive}>+0.8 pts</td>
                <td>Todas</td>
              </tr>
              <tr>
                <td><span className={styles.badgeSigla}>FS</span></td>
                <td>Falta sofrida</td>
                <td style={{ textAlign: 'right' }} className={styles.ptsPositive}>+0.5 pts</td>
                <td>Todas</td>
              </tr>
              <tr>
                <td><span className={styles.badgeSigla}>PS</span></td>
                <td>Pênalti sofrido</td>
                <td style={{ textAlign: 'right' }} className={styles.ptsPositive}>+1.0 pt</td>
                <td>Todas</td>
              </tr>
              <tr>
                <td><span className={styles.badgeSigla}>PE</span></td>
                <td>Passe incompleto / errado</td>
                <td style={{ textAlign: 'right' }} className={styles.ptsNegative}>-0.1 pt</td>
                <td>Todas</td>
              </tr>
              <tr>
                <td><span className={styles.badgeSigla}>I</span></td>
                <td>Impedimento</td>
                <td style={{ textAlign: 'right' }} className={styles.ptsNegative}>-0.1 pt</td>
                <td>Todas</td>
              </tr>
              <tr>
                <td><span className={styles.badgeSigla}>PP</span></td>
                <td>Pênalti perdido</td>
                <td style={{ textAlign: 'right' }} className={styles.ptsNegative}>-4.0 pts</td>
                <td>Todas</td>
              </tr>
            </tbody>
          </table>
        </div>

        <h3 style={{ fontSize: '1.0625rem', color: 'var(--accent-blue)', marginTop: '16px' }}>🛡️ Scouts de Defesa (Defensivos)</h3>
        <div className={styles.tableContainer}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th style={{ width: '80px' }}>Sigla</th>
                <th>Estatística / Scout</th>
                <th style={{ textAlign: 'right' }}>Pontuação</th>
                <th>Posições Elegíveis</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><span className={styles.badgeSigla}>SG</span></td>
                <td>Jogo sem sofrer gol (Clean Sheet)</td>
                <td style={{ textAlign: 'right' }} className={styles.ptsPositive}>+5.0 pts</td>
                <td>Goleiros, Zagueiros e Laterais</td>
              </tr>
              <tr>
                <td><span className={styles.badgeSigla}>DP</span></td>
                <td>Defesa de pênalti</td>
                <td style={{ textAlign: 'right' }} className={styles.ptsPositive}>+7.0 pts</td>
                <td>Goleiros</td>
              </tr>
              <tr>
                <td><span className={styles.badgeSigla}>DE</span></td>
                <td>Defesa difícil / defesa de finalização</td>
                <td style={{ textAlign: 'right' }} className={styles.ptsPositive}>+1.3 pts</td>
                <td>Goleiros</td>
              </tr>
              <tr>
                <td><span className={styles.badgeSigla}>DS</span></td>
                <td>Desarme certeiro</td>
                <td style={{ textAlign: 'right' }} className={styles.ptsPositive}>+1.5 pts</td>
                <td>Todas</td>
              </tr>
              <tr>
                <td><span className={styles.badgeSigla}>FC</span></td>
                <td>Falta cometida</td>
                <td style={{ textAlign: 'right' }} className={styles.ptsNegative}>-0.3 pt</td>
                <td>Todas</td>
              </tr>
              <tr>
                <td><span className={styles.badgeSigla}>GC</span></td>
                <td>Gol contra</td>
                <td style={{ textAlign: 'right' }} className={styles.ptsNegative}>-3.0 pts</td>
                <td>Todas</td>
              </tr>
              <tr>
                <td><span className={styles.badgeSigla}>CA</span></td>
                <td>Cartão amarelo</td>
                <td style={{ textAlign: 'right' }} className={styles.ptsNegative}>-1.0 pt</td>
                <td>Todas</td>
              </tr>
              <tr>
                <td><span className={styles.badgeSigla}>CV</span></td>
                <td>Cartão vermelho</td>
                <td style={{ textAlign: 'right' }} className={styles.ptsNegative}>-3.0 pts</td>
                <td>Todas</td>
              </tr>
              <tr>
                <td><span className={styles.badgeSigla}>GS</span></td>
                <td>Gol sofrido</td>
                <td style={{ textAlign: 'right' }} className={styles.ptsNegative}>-1.0 pt</td>
                <td>Goleiros</td>
              </tr>
              <tr>
                <td><span className={styles.badgeSigla}>PC</span></td>
                <td>Pênalti cometido</td>
                <td style={{ textAlign: 'right' }} className={styles.ptsNegative}>-1.0 pt</td>
                <td>Todas</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Seção 3: Regras de Escalação e Capitão */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <span style={{ fontSize: '1.5rem' }}>👕</span>
          <h2 className={styles.sectionTitle}>Regras de Escalação & Capitão</h2>
        </div>

        <div className={styles.rulesList}>
          <ul>
            <li>
              <strong>11 Titulares:</strong> O técnico deve escalar exatamente 11 titulares do seu
              elenco de 24 para cada rodada.
            </li>
            <li>
              <strong>Formações Táticas:</strong> É permitido escolher entre <code>4-3-3</code>,{' '}
              <code>4-4-2</code> e <code>3-5-2</code> a qualquer momento antes do fechamento do mercado.
            </li>
            <li>
              <strong>Multiplicador do Capitão (⭐ 1.5x):</strong> Exatamente 1 titular deve ser marcado como Capitão. Os pontos obtidos por este jogador na rodada recebem um bônus de <strong>50% adicionais</strong> na pontuação do time.
            </li>
            <li>
              <strong>Fechamento do Mercado (Lock):</strong> O mercado fecha no horário do apito inicial do primeiro jogo da rodada real da Série A.
            </li>
            <li>
              <strong>Escalação Automática (Fallback):</strong> Se o técnico não escalar a tempo, o sistema copia a última escalação válida ou auto-escala os 11 melhores titulares em 4-3-3.
            </li>
          </ul>
        </div>
      </div>
    </div>
  )
}
