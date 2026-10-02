import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://ilinrgasbkhvzujltbhp.supabase.co'
const supabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  'sb_publishable_H9-s-TPy4RMmTP7iAu8BHg_W6-HA3KS'

const THREE_MONTHS_IN_SECONDS = 60 * 60 * 24 * 90 // 90 dias (3 meses)

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        supabaseResponse = NextResponse.next({
          request,
        })
        cookiesToSet.forEach(({ name, value, options }) => {
          const isDelete = !value || options?.maxAge === 0
          supabaseResponse.cookies.set(name, value, {
            ...options,
            maxAge: isDelete ? 0 : THREE_MONTHS_IN_SECONDS,
            sameSite: 'lax',
            secure: process.env.NODE_ENV === 'production',
          })
        })
      },
    },
  })

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Rotas públicas (não exigem autenticação)
  const pathname = request.nextUrl.pathname
  const isPublicRoute =
    pathname === '/' ||
    pathname === '/login' ||
    pathname.startsWith('/auth/')

  // Redireciona não-autenticados para /login preservando a rota de destino
  if (!user && !isPublicRoute) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    const fullTarget = pathname + (request.nextUrl.search || '')
    url.searchParams.set('redirect', fullTarget)
    return NextResponse.redirect(url)
  }

  // Redireciona autenticados que acessam /login
  if (user && pathname === '/login') {
    const redirectParam =
      request.nextUrl.searchParams.get('redirect') || request.nextUrl.searchParams.get('next')
    const url = request.nextUrl.clone()
    url.pathname =
      redirectParam && redirectParam.startsWith('/') && !redirectParam.startsWith('//')
        ? redirectParam
        : '/dashboard'
    url.search = ''
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}
