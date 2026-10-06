export function formatTimerSeconds(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) {
    const min = Math.floor(seconds / 60)
    return `${min} min`
  }
  const hours = (seconds / 3600).toFixed(1).replace('.0', '')
  return `${hours}h`
}

/**
 * Normaliza uma string removendo diacríticos (acentos) e convertendo para minúsculas.
 * Ex: "Renê" -> "rene", "São Paulo" -> "sao paulo"
 */
export function normalizeText(str: string | null | undefined): string {
  if (!str) return ''
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

