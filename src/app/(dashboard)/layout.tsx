import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { signOut } from '@/app/(auth)/login/actions'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import styles from './layout.module.css'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Fetch profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, avatar_url')
    .eq('id', user.id)
    .single()

  const displayName = profile?.display_name ?? user.email?.split('@')[0] ?? 'Renato Spíndola'
  const initials = displayName
    .split(' ')
    .map((w: string) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() || 'RS'

  return (
    <div className={styles.wrapper}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          {/* Brand */}
          <Link href="/dashboard" className={styles.brand}>
            <div className={styles.brandIconBox}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="m4.93 4.93 4.24 4.24" />
                <path d="m14.83 9.17 4.24-4.24" />
                <path d="m14.83 14.83 4.24 4.24" />
                <path d="m9.17 14.83-4.24 4.24" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            </div>
            <span className={styles.brandText}>
              Fantasy Draft <strong>2026</strong>
            </span>
          </Link>

          {/* Central Nav Links */}
          <nav className={styles.nav}>
            <Link href="/dashboard" className={`${styles.navItem} ${styles.navItemActive}`}>
              PAINEL
            </Link>
            <Link href="/dashboard" className={styles.navItem}>
              CLASSIFICAÇÃO
            </Link>
            <Link href="/dashboard" className={styles.navItem}>
              TRANSFERÊNCIAS
            </Link>
            <Link href="/dashboard" className={styles.navItem}>
              REGRAS
            </Link>
          </nav>

          {/* User Profile Pill & Signout */}
          <div className={styles.userArea}>
            {/* <div className={styles.userBadge}>
              <div className={styles.avatar}>{initials}</div>
              <div className={styles.userDetails}>
                <span className={styles.userName}>{displayName}</span>
                <span className={styles.userLevel}>NÍVEL 14 • OURO</span>
              </div>
            </div> */}

            <ThemeToggle />

            <form action={signOut} className={styles.signOutForm}>
              <button
                type="submit"
                className={styles.signOutBtn}
                title="Sair da conta"
                aria-label="Sair"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className={styles.main}>{children}</main>

      {/* Footer from design */}
      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <div className={styles.footerBrand}>
            <span className={styles.footerIcon}>⚽</span>
            <span className={styles.footerBrandText}>
              Fantasy Draft 2026 <span className={styles.footerDivider}>—</span> Plataforma Oficial de Fantasy Sports
            </span>
          </div>

          <div className={styles.footerLinks}>
            <a href="#" className={styles.footerLink}>Termos</a>
            <a href="#" className={styles.footerLink}>Privacidade</a>
            <a href="#" className={styles.footerLink}>Central de Ajuda</a>
            <span className={styles.footerVersion}>v2.6.4</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
