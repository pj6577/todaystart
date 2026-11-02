import { z } from "zod"
import { checkedSearchFilters, defaultSearchFilters, type SearchFilters } from "./filters"
import { searchLimits, searchPlatforms, type SearchPlatform } from "./model"

export const jobSearchPreferencesKey = "todaystart.job-search.preferences"
export interface SearchPreferences {
  query: string
  filters: SearchFilters
  sites: SearchPlatform[]
  excludeApplied: boolean
}
const PreferencesSchema = z.object({
  version: z.literal(1),
  query: z.string().trim().max(searchLimits.queryLength),
  filters: z.object({
    group: z.array(z.string()).max(20), role: z.array(z.string()).max(12),
    region: z.array(z.string()).max(17), career: z.array(z.string()).max(3),
    careerMin: z.number().finite().optional(), careerMax: z.number().finite().optional()
  }).strict(),
  sites: z.array(z.enum(searchPlatforms)).min(1).max(searchPlatforms.length),
  excludeApplied: z.boolean()
}).strict()

export function defaultSearchPreferences(): SearchPreferences {
  return { query: "", filters: structuredClone(defaultSearchFilters), sites: [...searchPlatforms], excludeApplied: false }
}
function validatedPreferences(value: unknown): SearchPreferences {
  const parsed = PreferencesSchema.parse(value)
  // The domain validator checks every stored ID and normalises career ranges.
  return { query: parsed.query, filters: checkedSearchFilters(parsed.filters as SearchFilters),
    sites: searchPlatforms.filter(site => parsed.sites.includes(site)), excludeApplied: parsed.excludeApplied }
}
export function readSearchPreferences(storage?: Pick<Storage, "getItem">): SearchPreferences {
  try {
    const raw = (storage ?? window.localStorage).getItem(jobSearchPreferencesKey)
    return raw ? validatedPreferences(JSON.parse(raw)) : defaultSearchPreferences()
  } catch { return defaultSearchPreferences() }
}
export function saveSearchPreferences(preferences: SearchPreferences, storage?: Pick<Storage, "setItem">): boolean {
  try {
    const saved = validatedPreferences({ version: 1, ...preferences })
    // One record only. Never persist results, response bodies or application history.
    const target = storage ?? window.localStorage
    target.setItem(jobSearchPreferencesKey, JSON.stringify({ version: 1, ...saved }))
    return true
  } catch { return false }
}
