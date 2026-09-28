import React from 'react'
import styles from './Badge.module.css'

interface BadgeProps {
  variant?: 'GOL' | 'LAT' | 'ZAG' | 'MEI' | 'ATA' | 'status' | 'default'
  children: React.ReactNode
  className?: string
}

export const Badge: React.FC<BadgeProps> = ({
  variant = 'default',
  children,
  className = '',
}) => {
  return (
    <span className={`${styles.badge} ${styles[variant]} ${className}`}>
      {children}
    </span>
  )
}
