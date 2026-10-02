import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://ilinrgasbkhvzujltbhp.supabase.co'
const supabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  'sb_publishable_H9-s-TPy4RMmTP7iAu8BHg_W6-HA3KS'

const THREE_MONTHS_IN_SECONDS = 60 * 60 * 24 * 90 // 90 dias (3 meses)

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            const isDelete = !value || options?.maxAge === 0
            cookieStore.set(name, value, {
              ...options,
              maxAge: isDelete ? 0 : THREE_MONTHS_IN_SECONDS,
              sameSite: 'lax',
              secure: process.env.NODE_ENV === 'production',
            })
          })
        } catch {
          // Called from Server Component
        }
      },
    },
  })
}
