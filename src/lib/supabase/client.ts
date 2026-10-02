import { createBrowserClient } from '@supabase/ssr'

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://ilinrgasbkhvzujltbhp.supabase.co'
const supabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  'sb_publishable_H9-s-TPy4RMmTP7iAu8BHg_W6-HA3KS'

export function createClient() {
  return createBrowserClient(supabaseUrl, supabaseKey)
}
