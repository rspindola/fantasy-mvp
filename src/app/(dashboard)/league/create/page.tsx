'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import {
  createLeagueAction,
  getSeasonInfoAction,
  type CreateLeagueState,
  type SeasonInfo,
} from './actions'
import {
  h2hRoundsNeeded,
  canStartH2H,
  maxH2HTeams,
  type H2HFormat,
} from '@/lib/league/h2h-validation'
import { Button } from '@/components/ui/Button'
import { ImageCropModal } from '@/components/league/ImageCropModal'
import styles from './page.module.css'

const initialState: CreateLeagueState = {}

export default function CreateLeaguePage() {
  const [state, formAction, isPending] = useActionState(
    createLeagueAction,
    initialState
  )

  const [seasonInfo, setSeasonInfo] = useState<SeasonInfo | null>(null)
  const [teamCap, setTeamCap] = useState<number>(10)
  const [scoringMode, setScoringMode] = useState<'H2H' | 'TOTAL'>('H2H')
  const [h2hFormat, setH2HFormat] = useState<H2HFormat>('DOUBLE_ROUND')
  const [bannerPreview, setBannerPreview] = useState<string | null>(null)
  const [rawBannerSrc, setRawBannerSrc] = useState<string | null>(null)
  const [isCropModalOpen, setIsCropModalOpen] = useState(false)
  const bannerInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    getSeasonInfoAction().then(setSeasonInfo)
  }, [])

  // Calculate H2H metrics dynamically
  const roundsNeeded = h2hRoundsNeeded(teamCap, h2hFormat)
  const currentRound = seasonInfo?.currentRound ?? 1
  const totalRounds = seasonInfo?.totalRounds ?? 38
  const remainingRounds = seasonInfo?.remainingRounds ?? 38

  const finalRound = currentRound + roundsNeeded - 1
  const isValidH2H = scoringMode === 'TOTAL' || canStartH2H(teamCap, remainingRounds, h2hFormat)
  const maxTeamsAllowed = maxH2HTeams(remainingRounds, h2hFormat)

  const gamesPerTeam = h2hFormat === 'DOUBLE_ROUND' ? (teamCap - 1) * 2 : (teamCap - 1)

  return (
    <div className={styles.container}>
      <Link href="/dashboard" className={styles.backLink}>
        ← Voltar ao painel
      </Link>

      <div className={styles.card}>
        <h1 className={styles.title}>Criar Nova Liga</h1>
        <p className={styles.subtitle}>
          Configure as regras do seu draft fechado para jogar com seus amigos.
        </p>

        <form action={formAction} className={styles.form}>
          {state.error && (
            <div className={styles.globalError}>
              <span>⚠️</span>
              {state.error}
            </div>
          )}

          {/* Nome da Liga */}
          <div className={styles.fieldGroup}>
            <label htmlFor="name" className={styles.label}>
              Nome da Liga *
            </label>
            <input
              id="name"
              name="name"
              type="text"
              placeholder="Ex: Liga dos Amigos 2026"
              required
              autoFocus
              className={styles.input}
            />
            {state.fieldErrors?.name && (
              <span className={styles.fieldError}>
                {state.fieldErrors.name[0]}
              </span>
            )}
          </div>

          {/* Nome do Meu Time */}
          <div className={styles.fieldGroup}>
            <label htmlFor="teamName" className={styles.label}>
              Nome do Seu Time *
            </label>
            <input
              id="teamName"
              name="teamName"
              type="text"
              placeholder="Ex: Galácticos FC"
              required
              className={styles.input}
            />
            <span className={styles.helpText}>
              Como comissário, seu time será o 1º a ser registrado na liga.
            </span>
          </div>

          <div className={styles.row}>
            {/* Teto de Times */}
            <div className={styles.fieldGroup}>
              <label htmlFor="teamCap" className={styles.label}>
                Limite de Times (2 a 20) *
              </label>
              <input
                id="teamCap"
                name="teamCap"
                type="number"
                min={2}
                max={20}
                value={teamCap}
                onChange={(e) => setTeamCap(Math.max(2, Math.min(20, Number(e.target.value) || 2)))}
                required
                className={styles.input}
              />
              {state.fieldErrors?.teamCap && (
                <span className={styles.fieldError}>
                  {state.fieldErrors.teamCap[0]}
                </span>
              )}
            </div>

            {/* Tempo por Pick */}
            <div className={styles.fieldGroup}>
              <label htmlFor="pickTimerSeconds" className={styles.label}>
                Tempo por Pick *
              </label>
              <select
                id="pickTimerSeconds"
                name="pickTimerSeconds"
                defaultValue={90}
                className={styles.select}
              >
                <option value={30}>30 segundos</option>
                <option value={60}>60 segundos (1 min)</option>
                <option value={90}>90 segundos (1.5 min)</option>
                <option value={120}>120 segundos (2 min)</option>
                <option value={300}>300 segundos (5 min)</option>
                <option value={600}>600 segundos (10 min)</option>
                <option value={1800}>1800 segundos (30 min)</option>
                <option value={3600}>3600 segundos (1 hora)</option>
                <option value={7200}>7200 segundos (2 horas)</option>
                <option value={10800}>10800 segundos (3 horas)</option>
              </select>
            </div>
          </div>

          <div className={styles.row}>
            {/* Modo de Pontuação */}
            <div className={styles.fieldGroup}>
              <label htmlFor="scoringMode" className={styles.label}>
                Pontuação *
              </label>
              <select
                id="scoringMode"
                name="scoringMode"
                value={scoringMode}
                onChange={(e) => setScoringMode(e.target.value as any)}
                className={styles.select}
              >
                <option value="H2H">H2H (Confronto Direto / Duelos)</option>
                <option value="TOTAL">TOTAL (Pontuação Acumulada)</option>
              </select>
              <span className={styles.helpText}>
                H2H disputa duelos entre participantes. TOTAL soma pontos brutos.
              </span>
            </div>

            {/* Modo de Draft */}
            <div className={styles.fieldGroup}>
              <label htmlFor="draftMode" className={styles.label}>
                Modo de Draft *
              </label>
              <select
                id="draftMode"
                name="draftMode"
                defaultValue="HYBRID"
                className={styles.select}
              >
                <option value="HYBRID">Híbrido (Timer + Auto-pick no estouro)</option>
                <option value="MANUAL">Manual (Comissário gerencia)</option>
                <option value="AUTO">100% Automático</option>
              </select>
            </div>
          </div>

          {/* Opções Específicas do H2H */}
          {scoringMode === 'H2H' && (
            <div className={styles.fieldGroup}>
              <label htmlFor="h2hFormat" className={styles.label}>
                Formato dos Confrontos H2H *
              </label>
              <select
                id="h2hFormat"
                name="h2hFormat"
                value={h2hFormat}
                onChange={(e) => setH2HFormat(e.target.value as any)}
                className={styles.select}
              >
                <option value="DOUBLE_ROUND">
                  Ida e Volta (Turno e Returno — 2 jogos contra cada time)
                </option>
                <option value="SINGLE_ROUND">
                  Turno Único (1 jogo contra cada time)
                </option>
              </select>
              <span className={styles.helpText}>
                O torneio é disputado em turnos completos e o campeão H2H é consagrado na rodada final dos duelos.
              </span>

              {/* Simulador Dinâmico de Rodadas */}
              {seasonInfo && (
                <div className={styles.h2hSimulationCard}>
                  <div className={styles.h2hSimulationTitle}>
                    <span>📊 Planejamento do Torneio H2H</span>
                  </div>

                  <div className={styles.h2hStatGrid}>
                    <div className={styles.h2hStatItem}>
                      <span className={styles.h2hStatLabel}>Início</span>
                      <span className={styles.h2hStatValue}>Rodada {currentRound}</span>
                    </div>
                    <div className={styles.h2hStatItem}>
                      <span className={styles.h2hStatLabel}>Duração</span>
                      <span className={styles.h2hStatValue}>{roundsNeeded} rodadas</span>
                    </div>
                    <div className={styles.h2hStatItem}>
                      <span className={styles.h2hStatLabel}>Encerramento</span>
                      <span className={styles.h2hStatValue}>Rodada {finalRound}</span>
                    </div>
                    <div className={styles.h2hStatItem}>
                      <span className={styles.h2hStatLabel}>Restantes na Série A</span>
                      <span className={styles.h2hStatValue}>{remainingRounds} rodadas</span>
                    </div>
                  </div>

                  {isValidH2H ? (
                    <div className={styles.h2hAlertValid}>
                      ✓ <strong>Configuração Válida:</strong> Cada um dos {teamCap} times disputará {gamesPerTeam} partidas ({h2hFormat === 'DOUBLE_ROUND' ? 'Ida e Volta' : 'Turno Único'}). O campeonato H2H encerra na <strong>Rodada {finalRound} de {totalRounds}</strong>, congelando a classificação final do campeão!
                    </div>
                  ) : (
                    <div className={styles.h2hAlertInvalid}>
                      <span>
                        ⚠️ <strong>Rodadas Insuficientes no Campeonato:</strong>
                      </span>
                      <span>
                        Com <strong>{teamCap} times</strong> no formato <strong>{h2hFormat === 'DOUBLE_ROUND' ? 'Ida e Volta' : 'Turno Único'}</strong> são necessárias <strong>{roundsNeeded} rodadas</strong>, mas restam apenas <strong>{remainingRounds} rodadas</strong> no Brasileirão.
                      </span>
                      <span style={{ fontWeight: 600, marginTop: '4px' }}>
                        Sugestão: Reduza para no máximo {maxTeamsAllowed} times ou mude o formato para Turno Único.
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Banner da Liga (Upload do Comissário) */}
          <div className={styles.fieldGroup}>
            <label className={styles.label}>
              Imagem de Fundo / Banner do Card (Opcional)
            </label>
            <div
              className={styles.bannerUploadBox}
              onClick={() => bannerInputRef.current?.click()}
            >
              {bannerPreview ? (
                <div className={styles.bannerPreviewContainer}>
                  <img
                    src={bannerPreview}
                    alt="Pré-visualização do banner"
                    className={styles.bannerPreviewImg}
                  />
                  <div className={styles.bannerPreviewOverlay}>
                    <span className={styles.bannerChangeNotice}>
                      ✓ Imagem Recortada (16:9) • Clique para ajustar ou trocar
                    </span>
                  </div>
                </div>
              ) : (
                <>
                  <div className={styles.bannerUploadIcon}>🖼️</div>
                  <div className={styles.bannerUploadTitle}>
                    Clique ou arraste uma imagem de fundo para recortar e definir como banner
                  </div>
                  <div className={styles.bannerUploadSubtext}>
                    Recomendado: 1200x600 (16:9) • Formatos JPG, PNG ou WebP (Máx. 5MB)
                  </div>
                </>
              )}
              <input
                ref={bannerInputRef}
                type="file"
                name="banner"
                id="banner"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className={styles.bannerFileInput}
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) {
                    setRawBannerSrc(URL.createObjectURL(file))
                    setIsCropModalOpen(true)
                    e.target.value = ''
                  }
                }}
              />
            </div>
            <span className={styles.helpText}>
              Como comissário, você pode recortar e personalizar essa imagem agora ou editá-la a qualquer momento durante o campeonato.
            </span>
          </div>

          {/* Modal de Recorte para a Criação */}
          <ImageCropModal
            isOpen={isCropModalOpen}
            imageSrc={rawBannerSrc}
            onClose={() => setIsCropModalOpen(false)}
            onCropComplete={(croppedFile, previewUrl) => {
              if (bannerInputRef.current) {
                const dt = new DataTransfer()
                dt.items.add(croppedFile)
                bannerInputRef.current.files = dt.files
              }
              setBannerPreview(previewUrl)
              setIsCropModalOpen(false)
            }}
          />

          <div className={styles.actions}>
            <Link href="/dashboard">
              <Button variant="ghost" type="button">
                Cancelar
              </Button>
            </Link>
            <Button
              type="submit"
              size="lg"
              isLoading={isPending}
              disabled={isPending || (scoringMode === 'H2H' && !isValidH2H)}
            >
              {isPending
                ? 'Criando Liga...'
                : !isValidH2H
                ? 'Ajuste os parâmetros da Liga'
                : 'Criar Liga'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
