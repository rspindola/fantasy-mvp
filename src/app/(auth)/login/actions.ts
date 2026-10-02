'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export type AuthState = {
  error?: string
  success?: boolean
}

export async function signInWithPassword(
  _prevState: AuthState,
  formData: FormData
): Promise<AuthState> {
  const email = (formData.get('email') as string)?.trim()
  const password = formData.get('password') as string

  if (!email || !email.includes('@')) {
    return { error: 'Informe um e-mail válido.' }
  }
  if (!password) {
    return { error: 'Informe sua senha.' }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) {
    return { error: 'E-mail ou senha incorretos. Verifique suas credenciais.' }
  }

  redirect('/dashboard')
}

function getSiteUrl(): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, '')
  }
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  }
  if (process.env.NODE_ENV === 'production') {
    return 'https://fantasy.kodly.app'
  }
  return 'http://localhost:3000'
}

export async function signInWithMagicLink(
  _prevState: AuthState,
  formData: FormData
): Promise<AuthState> {
  const email = (formData.get('email') as string)?.trim()

  if (!email || !email.includes('@')) {
    return { error: 'Informe um e-mail válido.' }
  }

  const supabase = await createClient()
  const siteUrl = getSiteUrl()

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${siteUrl}/auth/callback`,
    },
  })

  if (error) {
    const msg = error.message.toLowerCase()
    if (msg.includes('rate limit') || (error as any).status === 429) {
      return {
        error:
          'Limite temporário de envio de e-mails do provedor atingido. Aguarde alguns minutos ou entre usando a aba "E-mail e Senha".',
      }
    }
    return { error: error.message || 'Erro ao enviar magic link. Tente novamente.' }
  }

  return { success: true }
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}
