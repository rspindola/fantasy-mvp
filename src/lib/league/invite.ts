import { customAlphabet } from 'nanoid'

// Custom nanoid alphabet excluding confusing characters (0, O, I, l)
const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'
const nanoid = customAlphabet(alphabet, 8)

export function generateInviteCode(): string {
  return nanoid()
}
