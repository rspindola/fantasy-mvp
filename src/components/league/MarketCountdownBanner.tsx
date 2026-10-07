'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import styles from './MarketCountdownBanner.module.css'

export type MarketCountdownBannerProps = {
  leagueId: string
  isLocked: boolean
  closingAt: string | null
  currentRound: number
}

export function MarketCountdownBanner({
  leagueId,
  isLocked,
  closingAt,
  currentRound,
}: MarketCountdownBannerProps) {
  const [mounted, setMounted] = useState(false)
  const [timeLeft, setTimeLeft] = useState<number | null>(null)

  useEffect(() => {
    setMounted(true)

    if (!closingAt || isLocked) {
      setTimeLeft(0)
      return
    }

    const calcTime = () => {
      const diff = new Date(closingAt).getTime() - Date.now()
      setTimeLeft(diff > 0 ? diff : 0)
    }

    calcTime()
    const timer = setInterval(calcTime, 1000)
    return () => clearInterval(timer)
  }, [closingAt, isLocked])

  // Determine if closed
  const isClosed = isLocked || (timeLeft !== null && timeLeft <= 0)

  // Format timer text
  let title = `Mercado fechado para a Rodada ${currentRound}.`
  let subtitle = 'Acompanhe as partidas e pontuações ao vivo.'

  if (!isClosed && closingAt && timeLeft !== null && timeLeft > 0) {
    const totalSeconds = Math.floor(timeLeft / 1000)
    const days = Math.floor(totalSeconds / 86400)
    const hours = Math.floor((totalSeconds % 86400) / 3600)
    const minutes = Math.floor((totalSeconds % 3600) / 60)
    const seconds = totalSeconds % 60

    const pad = (n: number) => n.toString().padStart(2, '0')

    const closingDate = new Date(closingAt)
    const now = new Date()

    const isToday =
      closingDate.getDate() === now.getDate() &&
      closingDate.getMonth() === now.getMonth() &&
      closingDate.getFullYear() === now.getFullYear()

    const tomorrow = new Date(now)
    tomorrow.setDate(tomorrow.getDate() + 1)
    const isTomorrow =
      closingDate.getDate() === tomorrow.getDate() &&
      closingDate.getMonth() === tomorrow.getMonth() &&
      closingDate.getFullYear() === tomorrow.getFullYear()

    if (days > 0) {
      title = `Mercado fecha em ${days}d ${pad(hours)}h ${pad(minutes)}m ${pad(seconds)}s.`
    } else if (isToday) {
      title = `Mercado fecha hoje em ${pad(hours)}h ${pad(minutes)}m ${pad(seconds)}s.`
    } else if (isTomorrow) {
      title = `Mercado fecha amanhã em ${pad(hours)}h ${pad(minutes)}m ${pad(seconds)}s.`
    } else {
      title = `Mercado fecha em ${pad(hours)}h ${pad(minutes)}m ${pad(seconds)}s.`
    }

    subtitle = 'Escale agora com a Escalação Automática.'
  }

  // Avoid hydration mismatch while mounting
  if (!mounted) {
    return (
      <Link href={`/league/${leagueId}/lineup`} className={styles.bannerLink}>
        <div className={styles.bannerCard}>
          <div className={styles.leftGroup}>
            <div className={styles.iconWrapper}>
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="13" r="8" />
                <path d="M12 9v4l2.5 2.5" />
                <path d="M10 2h4" />
              </svg>
            </div>
            <div className={styles.content}>
              <span className={styles.title}>Carregando status do mercado...</span>
              <span className={styles.subtitle}>Escalar Meu Time</span>
            </div>
          </div>
          <div className={styles.arrowWrapper}>
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
              <path d="m9 18 6-6-6-6" />
            </svg>
          </div>
        </div>
      </Link>
    )
  }

  return (
    <Link href={`/league/${leagueId}/lineup`} className={styles.bannerLink}>
      <div
        className={`${styles.bannerCard} ${
          isClosed ? styles.bannerCardClosed : ''
        }`}
      >
        <div className={styles.leftGroup}>
          <div
            className={`${styles.iconWrapper} ${
              isClosed ? styles.iconClosed : ''
            }`}
          >
            {isClosed ? (
              /* Closed Lock Icon */
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            ) : (
              /* Stopwatch Countdown Icon */
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="13" r="8" />
                <path d="M12 9v4l2.5 2.5" />
                <path d="M10 2h4" />
                <path d="m4.93 4.93 1.41 1.41" />
                <path d="m19.07 4.93-1.41 1.41" />
              </svg>
            )}
          </div>

          <div className={styles.content}>
            <span
              className={`${styles.title} ${
                isClosed ? styles.titleClosed : ''
              }`}
            >
              {title}
            </span>
            <span className={styles.subtitle}>{subtitle}</span>
          </div>
        </div>

        <div className={styles.arrowWrapper}>
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
            <path d="m9 18 6-6-6-6" />
          </svg>
        </div>
      </div>
    </Link>
  )
}
