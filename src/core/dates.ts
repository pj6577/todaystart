import { DateSchema } from "./model"

export function parseApplicationDate(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined
  const match = raw.trim().match(/^(\d{4})\s*(?:[./-]|년)\s*(\d{1,2})\s*(?:[./-]|월)\s*(\d{1,2})(?:일|\.|\b)/)
  if (!match) return undefined
  const value = `${match[1]}-${match[2]!.padStart(2, "0")}-${match[3]!.padStart(2, "0")}`
  return DateSchema.safeParse(value).success ? value : undefined
}
