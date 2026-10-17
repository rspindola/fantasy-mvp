'use client'

import React, { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { MatchupDetailPageData } from './actions'
import styles from './MatchupDetailsModal.module.css'

interface MatchupDetailsModalProps {
  isOpen: boolean
  onClose: () => void
  data: MatchupDetailPageData
}

export function MatchupDetailsModal({
  isOpen,
  onClose,
  data,
}: MatchupDetailsModalProps) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  if (!mounted || !isOpen) return null

  const allSubs = [
    ...data.homeTeam.substitutions.map((s) => ({
      ...s,
      teamName: data.homeTeam.teamName,
    })),
    ...data.awayTeam.substitutions.map((s) => ({
      ...s,
      teamName: data.awayTeam.teamName,
    })),
  ]

  // Find captains
  const homeCaptain =
    data.homeTeam.starters.find((p) => p.isCaptain) ||
    data.homeTeam.reserves.find((p) => p.isCaptain && p.subbedIn)

  const awayCaptain =
    data.awayTeam.starters.find((p) => p.isCaptain) ||
    data.awayTeam.reserves.find((p) => p.isCaptain && p.subbedIn)

  // Scores difference
  const homePts = data.homeTeam.totalPoints
  const awayPts = data.awayTeam.totalPoints
  const diff = Math.abs(homePts - awayPts)
  const winnerName =
    data.result === 'home'
      ? data.homeTeam.teamName
      : data.result === 'away'
      ? data.awayTeam.teamName
      : null

  const modalContent = (
    <div className={styles.overlay} onClick={onClose}>
      <div
        className={styles.modal}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <div className={styles.infoIconBox}>
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="16" x2="12" y2="12" />
                <line x1="12" y1="8" x2="12.01" y2="8" />
              </svg>
            </div>
            <div>
              <h2 id="modal-title" className={styles.title}>
                Detalhes Adicionais do Confronto
              </h2>
              <p className={styles.subtitle}>
                Rodada {data.fixtureRound} • {data.leagueName}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className={styles.closeBtn}
            aria-label="Fechar modal"
          >
            ✕
          </button>
        </div>

        {/* Section 1: Substituições Automáticas */}
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionTitle}>
              <span className={styles.greenIcon}>🔄</span>
              <span>SUBSTITUIÇÕES AUTOMÁTICAS APLICADAS</span>
            </div>
            <span className={styles.ruleBadge}>Regra: Banco Prioritário</span>
          </div>

          {allSubs.length > 0 ? (
            <div className={styles.subsList}>
              {allSubs.map((sub, idx) => (
                <div key={idx} className={styles.subCard}>
                  <div className={styles.subCardHeader}>
                    <div className={styles.subCardMatch}>
                      <span className={styles.subTeamTag}>[{sub.teamName}]</span>
                      <span className={styles.subOutPlayer}>
                        {sub.outPlayerPhotoUrl && (
                          <img
                            src={sub.outPlayerPhotoUrl}
                            alt={sub.outPlayerName}
                            className={styles.modalMiniPhoto}
                            onError={(e) => {
                              ;(e.currentTarget as HTMLElement).style.display = 'none'
                            }}
                          />
                        )}
                        <del>{sub.outPlayerName} ({sub.position})</del>
                      </span>
                      <span className={styles.dnpBadge}>0 min / Não relacionado</span>
                      <span className={styles.subArrow}>➔</span>
                      <span className={styles.subInPlayer}>
                        {sub.inPlayerPhotoUrl && (
                          <img
                            src={sub.inPlayerPhotoUrl}
                            alt={sub.inPlayerName}
                            className={styles.modalMiniPhoto}
                            onError={(e) => {
                              ;(e.currentTarget as HTMLElement).style.display = 'none'
                            }}
                          />
                        )}
                        {sub.inPlayerName} ({sub.position})
                      </span>
                    </div>
                    <div className={styles.subCardScore}>
                      <span className={styles.subPtsAdded}>
                        +{sub.pointsAdded.toFixed(1)} pts
                      </span>
                      <span className={styles.subPtsLabel}>Pontuação computada</span>
                    </div>
                  </div>
                  <div className={styles.subCardCriterion}>
                    Critério: Mesmo setor {sub.position}, primeiro reserva apto da lista com
                    minutos jogados e pontuação válida.
                    {sub.captainTransferred && (
                      <span className={styles.captainTransferTag}>
                        {' '}• 👑 Faixa de capitão transferida para o reserva.
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className={styles.emptySubsBox}>
              <p>
                ✓ Nenhuma substituição automática necessária neste confronto. Todos os
                titulares pontuaram ou não houve suplentes aptos com minutos jogados.
              </p>
            </div>
          )}
        </div>

        {/* Section 2: Cards Grid (Capitão e Fechamento) */}
        <div className={styles.summaryGrid}>
          {/* Multiplicador de Capitão */}
          <div className={styles.summaryCard}>
            <div className={styles.summaryCardHeader}>
              <span className={styles.goldCrown}>👑</span>
              <span className={styles.summaryCardTitle}>
                Multiplicador de Capitão (1.5x)
              </span>
            </div>
            <div className={styles.summaryCardBody}>
              {homeCaptain ? (
                <div className={styles.captainLine}>
                  {homeCaptain.photoUrl && (
                    <img
                      src={homeCaptain.photoUrl}
                      alt={homeCaptain.name}
                      className={styles.modalMiniPhoto}
                      onError={(e) => {
                        ;(e.currentTarget as HTMLElement).style.display = 'none'
                      }}
                    />
                  )}
                  <span>
                    • <strong>{homeCaptain.name}</strong> ({data.homeTeam.teamName}):
                    Base {homeCaptain.points.toFixed(1)} pts × 1.5 ={' '}
                    <span className={styles.goldValue}>
                      {(homeCaptain.points * 1.5).toFixed(1)} pts
                    </span>
                  </span>
                </div>
              ) : (
                <div className={styles.captainLine}>
                  • {data.homeTeam.teamName}: Sem capitão escalado
                </div>
              )}

              {awayCaptain ? (
                <div className={styles.captainLine}>
                  {awayCaptain.photoUrl && (
                    <img
                      src={awayCaptain.photoUrl}
                      alt={awayCaptain.name}
                      className={styles.modalMiniPhoto}
                      onError={(e) => {
                        ;(e.currentTarget as HTMLElement).style.display = 'none'
                      }}
                    />
                  )}
                  <span>
                    • <strong>{awayCaptain.name}</strong> ({data.awayTeam.teamName}):
                    Base {awayCaptain.points.toFixed(1)} pts × 1.5 ={' '}
                    <span className={styles.goldValue}>
                      {(awayCaptain.points * 1.5).toFixed(1)} pts
                    </span>
                  </span>
                </div>
              ) : (
                <div className={styles.captainLine}>
                  • {data.awayTeam.teamName}: Sem capitão escalado
                </div>
              )}
            </div>
          </div>

          {/* Fechamento da Rodada */}
          <div className={styles.summaryCard}>
            <div className={styles.summaryCardHeader}>
              <span className={styles.greenIcon}>⚽</span>
              <span className={styles.summaryCardTitle}>
                Fechamento da Rodada {data.fixtureRound}
              </span>
            </div>
            <div className={styles.summaryCardBody}>
              <div className={styles.summaryLine}>
                • <strong>Status:</strong>{' '}
                {data.status === 'completed'
                  ? 'Oficialmente Encerrada e Auditada'
                  : data.status === 'live'
                  ? 'Em Andamento (Parciais ao vivo)'
                  : 'Aguardando Início das Partidas'}
              </div>
              <div className={styles.summaryLine}>
                • <strong>Bônus de capitão:</strong> {data.homeTeam.teamName} (+
                {data.homeTeam.captainBonus.toFixed(1)} pts) |{' '}
                {data.awayTeam.teamName} (+{data.awayTeam.captainBonus.toFixed(1)} pts)
              </div>
              <div className={styles.summaryLine}>
                • <strong>Diferença de pontos:</strong>{' '}
                {winnerName ? (
                  <span className={styles.diffValue}>
                    +{diff.toFixed(1)} pts pró {winnerName}
                  </span>
                ) : (
                  <span className={styles.diffValue}>Empate exato (0.0 pts)</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Section 3: Nota de Auditoria */}
        <div className={styles.auditBox}>
          <div className={styles.auditHeader}>
            <span className={styles.auditIcon}>🛡️</span>
            <span className={styles.auditTitle}>Nota de Auditoria da Liga</span>
          </div>
          <p className={styles.auditText}>
            As regras de substituição automática consideram a ordem estrita dos suplentes
            inseridos na escalação antes do travamento do mercado. Jogadores sem minutos
            em campo são substituídos por atletas da mesma posição com pontuação válida.
          </p>
        </div>

        {/* Footer */}
        <div className={styles.footer}>
          <button onClick={onClose} className={styles.confirmBtn}>
            Entendido
          </button>
        </div>
      </div>
    </div>
  )

  return createPortal(modalContent, document.body)
}
