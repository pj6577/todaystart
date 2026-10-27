import type { ApplicationSource, Platform } from "./model"
import { platformDefinitions, platformIds } from "./platforms"

export const platformHost = Object.fromEntries(platformIds.map(id => [id, platformDefinitions[id].host])) as Record<Platform, string>
export function platformForUrl(raw: string): Platform | undefined {
  try {
    const url = new URL(raw)
    if (url.protocol !== "https:") return undefined
    return (Object.keys(platformHost) as Platform[]).find(p => platformHost[p] === url.hostname || platformDefinitions[p].additionalHosts?.includes(url.hostname))
  } catch { return undefined }
}

export function safeJobUrl(raw: string | undefined | null, platform: ApplicationSource, base?: string): string | undefined {
  if (!raw) return undefined
  try {
    const url = platform === "manual" ? new URL(raw) : new URL(raw, base && platformForUrl(base) === platform ? base : `https://${platformHost[platform]}`)
    if (url.protocol !== "https:" || url.username || url.password || (platform !== "manual" && platformForUrl(url.href) !== platform)) return undefined
    // Never retain arbitrary query parameters: they may contain session identifiers.
    const clean = new URL(url.origin + url.pathname)
    for (const key of platform === "remember" ? [] : ["rec_idx", "gi_no", "Gno", "gno"]) {
      const value = url.searchParams.get(key)
      if (value && /^\d+$/.test(value)) clean.searchParams.set(key, value)
    }
    return clean.href
  } catch { return undefined }
}
export function jobIdFromUrl(raw?: string): string | undefined {
  if (!raw) return undefined
  try {
    const u = new URL(raw)
    if (platformForUrl(raw) === "remember") return u.hostname === "career.rememberapp.co.kr" ? u.pathname.match(/^\/job\/posting\/(\d+)\/?$/)?.[1] : undefined
    return u.searchParams.get("rec_idx") || u.searchParams.get("gi_no") || u.pathname.match(/\/Recruit\/G[Ii]_Read\/(\d+)/i)?.[1] || (platformForUrl(raw) === "wanted" ? u.pathname.match(/^\/wd\/(\d+)\/?$/)?.[1] : undefined)
  } catch { return undefined }
}
