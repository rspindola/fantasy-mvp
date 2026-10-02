import { createBrowserClient } from '@supabase/ssr'

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://ilinrgasbkhvzujltbhp.supabase.co'
const supabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  'sb_publishable_H9-s-TPy4RMmTP7iAu8BHg_W6-HA3KS'

const THREE_MONTHS_IN_SECONDS = 60 * 60 * 24 * 90 // 90 dias (3 meses)

export function createClient() {
  return createBrowserClient(supabaseUrl, supabaseKey, {
    cookieOptions: {
      maxAge: THREE_MONTHS_IN_SECONDS,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    },
  })
}
