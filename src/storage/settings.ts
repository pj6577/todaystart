import { z } from "zod"
import { ProfileSchema } from "../platforms/profile"
import type { Platform, SyncReport } from "../core/model"
import { platformIds } from "../core/platforms"

const consentShape = Object.fromEntries(platformIds.map(id => [id, z.boolean()])) as Record<Platform, z.ZodBoolean>
const profileShape = Object.fromEntries(platformIds.map(id => [id, ProfileSchema.optional()])) as Record<Platform, z.ZodOptional<typeof ProfileSchema>>
const enabledDefaults = Object.fromEntries(platformIds.map(id => [id, true])) as Record<Platform, boolean>

export const SettingsSchema = z.object({
  settingsVersion: z.literal(3).default(3),
  theme: z.enum(["system", "light", "dark"]).default("system"),
  autoRecord: z.boolean(),
  historyAutoCollect: z.boolean().default(false),
  listingWarnings: z.boolean(),
  detailWarnings: z.boolean(),
  similarWarnings: z.boolean(),
  showCancelled: z.boolean(),
  consent: z.object(consentShape).strict(),
  profiles: z.object(profileShape).strict()
}).strict().refine(s => platformIds.every(id => !s.profiles[id] || s.profiles[id]!.platform === id))
export type Settings = z.infer<typeof SettingsSchema>
export const defaultSettings: Settings = {
  settingsVersion: 3, theme: "system",
  autoRecord: true, historyAutoCollect: false, listingWarnings: true, detailWarnings: true, similarWarnings: false, showCancelled: false,
  consent: { ...enabledDefaults }, profiles: {}
}
export function resolveSettings(value: unknown): Settings {
  if (!value || typeof value !== "object" || Array.isArray(value)) return structuredClone(defaultSettings)
  const stored = value as Record<string, unknown>
  // v2+ explicit choices survive; only newly registered platforms get defaults.
  const consent = stored.consent && typeof stored.consent === "object" ? stored.consent : {}
  const candidate = { ...stored, settingsVersion: 3, consent: { ...enabledDefaults, ...(stored.settingsVersion === 2 || stored.settingsVersion === 3 ? consent : {}) } }
  const parsed = SettingsSchema.safeParse(candidate)
  return parsed.success ? parsed.data : structuredClone(defaultSettings)
}
export async function getSettings(): Promise<Settings> {
  const { settings } = await chrome.storage.local.get("settings")
  const resolved = resolveSettings(settings)
  const stored = settings && typeof settings === "object" ? settings as Record<string, unknown> : undefined
  if (!stored || stored.settingsVersion !== 3 || stored.theme === undefined || !SettingsSchema.safeParse(settings).success) {
    await chrome.storage.local.set({ settings: resolved })
  }
  return resolved
}
export async function saveSettings(value: unknown) {
  const settings = SettingsSchema.parse(value)
  await chrome.storage.local.set({ settings })
  return settings
}
export async function getReports(): Promise<Partial<Record<Platform, SyncReport>>> {
  const { reports } = await chrome.storage.local.get("reports")
  return reports || {}
}
export async function saveReport(report: SyncReport) {
  const reports = await getReports()
  reports[report.platform] = report
  await chrome.storage.local.set({ reports })
}
