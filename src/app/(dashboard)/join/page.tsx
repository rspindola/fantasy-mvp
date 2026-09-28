import { redirect } from 'next/navigation'

export default async function JoinRedirectPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>
}) {
  const params = await searchParams
  const code = params.code?.trim().toUpperCase()

  if (code) {
    redirect(`/join/${code}`)
  } else {
    redirect('/dashboard')
  }
}
