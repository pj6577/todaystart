import { z } from "zod"
import { PlatformSchema } from "../core/model"

const css = z.string().trim().min(1).max(1000)
const field = z.object({ selector: css, attribute: z.string().max(100).optional() }).strict()
const fields = z.object({
  company: field,
  title: field,
  url: field.optional(),
  date: field.optional(),
  status: field.optional(),
  applicationId: field.optional(),
  jobId: field.optional(),
  companyIdentifier: field.optional()
}).strict()
const paths = z.array(z.string().startsWith("/").min(2).max(300)).max(30)
export const ProfileSchema = z.object({
  platform: PlatformSchema,
  version: z.string().min(1).max(100),
  validatedAt: z.string().min(1).max(100),
  historyPaths: paths,
  listingPaths: paths,
  detailPaths: paths,
  historyRoot: css,
  historyRow: css,
  historyFields: fields,
  listingRoot: css,
  posting: css,
  postingFields: fields,
  loginRequired: css.optional(),
  empty: css.optional(),
  loading: css.optional(),
  nextPage: css.optional(),
  scope: field.optional(),
  success: z.object({ selector: css, text: z.string().min(1).max(300), record: css }).strict().optional(),
  submissionForm: css.optional(),
  statusMap: z.record(z.string(), z.enum(["applied", "pending_confirmation", "cancelled", "unknown"]))
}).strict()
export type SelectorProfile = z.infer<typeof ProfileSchema>
export type FieldConfig = z.infer<typeof field>
export type FieldsConfig = z.infer<typeof fields>

export function validateProfile(value: unknown): SelectorProfile {
  const profile = ProfileSchema.parse(value)
  // Check selector syntax at import time in the extension document when available.
  if (typeof document !== "undefined") {
    const walk = (object: unknown, key = "") => {
      if (typeof object === "string" && ["selector", "historyRoot", "historyRow", "listingRoot", "posting", "loginRequired", "empty", "loading", "nextPage", "record", "submissionForm"].includes(key)) document.querySelector(object)
      else if (object && typeof object === "object") Object.entries(object).forEach(([k, v]) => walk(v, k))
    }
    walk(profile)
  }
  return profile
}
