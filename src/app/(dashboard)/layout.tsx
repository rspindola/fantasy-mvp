import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { signOut } from '@/app/(auth)/login/actions'
import { Button } from '@/components/ui/Button'
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

  const displayName = profile?.display_name ?? user.email?.split('@')[0] ?? 'Jogador'
  const initials = displayName.slice(0, 2).toUpperCase()

  return (
    <>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <a href="/dashboard" className={styles.brand}>
            <span className={styles.brandIcon}>⚽</span>
            <span className={styles.brandText}>
              Fantasy Draft <span>2026</span>
            </span>
          </a>

          <div className={styles.userArea}>
            <div className={styles.userInfo}>
              <div className={styles.avatar}>{initials}</div>
              <span className={styles.userName}>{displayName}</span>
            </div>
            <form action={signOut}>
              <Button variant="ghost" size="sm" type="submit">
                Sair
              </Button>
            </form>
          </div>
        </div>
      </header>

      <main className={styles.main}>{children}</main>
    </>
  )
}
