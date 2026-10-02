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

export async function signInWithMagicLink(
  _prevState: AuthState,
  formData: FormData
): Promise<AuthState> {
  const email = (formData.get('email') as string)?.trim()

  if (!email || !email.includes('@')) {
    return { error: 'Informe um e-mail válido.' }
  }

  const supabase = await createClient()

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'}/auth/callback`,
    },
  })

  if (error) {
    return { error: 'Erro ao enviar magic link. Tente novamente.' }
  }

  return { success: true }
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}
