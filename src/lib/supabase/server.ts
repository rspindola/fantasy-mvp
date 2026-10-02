import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://ilinrgasbkhvzujltbhp.supabase.co'
const supabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  'sb_publishable_H9-s-TPy4RMmTP7iAu8BHg_W6-HA3KS'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        } catch {
          // Called from Server Component
        }
      },
    },
  })
}
