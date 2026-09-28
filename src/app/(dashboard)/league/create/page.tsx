'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { createLeagueAction, type CreateLeagueState } from './actions'
import { Button } from '@/components/ui/Button'
import styles from './page.module.css'

const initialState: CreateLeagueState = {}

export default function CreateLeaguePage() {
  const [state, formAction, isPending] = useActionState(
    createLeagueAction,
    initialState
  )

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
                defaultValue={10}
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
                defaultValue="H2H"
                className={styles.select}
              >
                <option value="H2H">H2H (Mata-mata / Confronto Direto)</option>
                <option value="TOTAL">TOTAL (Pontuação Acumulada)</option>
              </select>
              <span className={styles.helpText}>
                H2H disputa duelos rodada a rodada. TOTAL soma os pontos.
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

          <div className={styles.actions}>
            <Link href="/dashboard">
              <Button variant="ghost" type="button">
                Cancelar
              </Button>
            </Link>
            <Button type="submit" size="lg" isLoading={isPending}>
              {isPending ? 'Criando Liga...' : 'Criar Liga'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
