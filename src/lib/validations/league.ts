import { z } from 'zod'

export const createLeagueSchema = z.object({
  name: z
    .string()
    .min(3, 'O nome deve ter pelo menos 3 caracteres.')
    .max(50, 'O nome deve ter no máximo 50 caracteres.')
    .trim(),
  teamCap: z
    .number()
    .int()
    .min(2, 'A liga precisa de no mínimo 2 times.')
    .max(20, 'O limite máximo é de 20 times por liga.'),
  scoringMode: z.enum(['TOTAL', 'H2H']),
  h2hFormat: z.enum(['SINGLE_ROUND', 'DOUBLE_ROUND']).optional().default('DOUBLE_ROUND'),
  draftMode: z.enum(['MANUAL', 'AUTO', 'HYBRID']),
  pickTimerSeconds: z
    .number()
    .int()
    .min(30, 'O tempo mínimo é 30 segundos.')
    .max(10800, 'O tempo máximo é 3 horas.'),
})

export type CreateLeagueInput = z.infer<typeof createLeagueSchema>

export const joinLeagueSchema = z.object({
  inviteCode: z.string().min(1, 'Código de convite obrigatório.').trim().toUpperCase(),
  teamName: z
    .string()
    .min(3, 'O nome do time deve ter pelo menos 3 caracteres.')
    .max(40, 'O nome do time deve ter no máximo 40 caracteres.')
    .trim(),
})

export type JoinLeagueInput = z.infer<typeof joinLeagueSchema>
