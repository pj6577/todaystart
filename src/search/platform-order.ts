import { z } from "zod"
import { searchPlatforms, type SearchPlatform } from "./model"

export const searchPlatformOrderKey = "todaystart.job-search.platform-order"
const orderSchema = z.array(z.enum(searchPlatforms)).length(searchPlatforms.length)
  .refine(order => new Set(order).size === searchPlatforms.length)
const savedSchema = z.object({ version: z.literal(1), platforms: orderSchema }).strict()

export function readSearchPlatformOrder(storage?: Pick<Storage, "getItem">): SearchPlatform[] {
  try {
    const raw = (storage ?? window.localStorage).getItem(searchPlatformOrderKey)
    return raw ? savedSchema.parse(JSON.parse(raw)).platforms : [...searchPlatforms]
  } catch { return [...searchPlatforms] }
}
export function saveSearchPlatformOrder(order: readonly SearchPlatform[], storage?: Pick<Storage, "setItem">): boolean {
  try {
    const saved = savedSchema.parse({ version: 1, platforms: order })
    const target = storage ?? window.localStorage
    target.setItem(searchPlatformOrderKey, JSON.stringify(saved))
    return true
  } catch { return false }
}
export function moveSearchPlatform(order: readonly SearchPlatform[], from: SearchPlatform, to: SearchPlatform): SearchPlatform[] {
  const next = [...order], source = next.indexOf(from), target = next.indexOf(to)
  if (source < 0 || target < 0 || source === target) return next
  next.splice(source, 1); next.splice(target, 0, from)
  return next
}
