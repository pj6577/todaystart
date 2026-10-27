import { z } from "zod"
import { SubmissionAttemptSchema, SubmissionContextSchema, SubmissionPlatformSchema, type SubmissionAttempt } from "./model"

const contextSchema = z.object({ platform: SubmissionPlatformSchema, tabId: z.number().int(), updatedAt: z.string().datetime(), context: SubmissionContextSchema }).strict()
const handoffSchema = z.object({ tabId: z.number().int(), sourceJobId: z.string().regex(/^\d{1,20}$/), internalGiNo: z.string().regex(/^\d{1,20}$/), observedAt: z.string().datetime(), launchId: z.string().uuid().optional(), targetTabId: z.number().int().optional(), targetFrameId: z.number().int().optional() }).strict()
export type Handoff = z.infer<typeof handoffSchema>
export const handoffLifetime = 5 * 60 * 1000
export const lifetime = 24 * 60 * 60 * 1000

export class SubmissionStore {
  async read() {
    const stored = await chrome.storage.local.get(["submissionAttempts", "submissionContexts", "submissionHandoffs"])
    const attempts = z.array(SubmissionAttemptSchema).safeParse(stored.submissionAttempts)
    const contexts = z.array(contextSchema).safeParse(stored.submissionContexts)
    const handoffs = z.array(handoffSchema).safeParse(stored.submissionHandoffs)
    return { attempts: attempts.success ? attempts.data.slice(-100) : [], contexts: contexts.success ? contexts.data.filter(value => Date.now() - Date.parse(value.updatedAt) < lifetime).slice(-100) : [], handoffs: handoffs.success ? handoffs.data.filter(value => { const age = Date.now() - Date.parse(value.observedAt); return age >= 0 && age < handoffLifetime }).slice(-100) : [] }
  }
  async save(attempts: SubmissionAttempt[]) {
    await chrome.storage.local.set({ submissionAttempts: attempts.slice(-100) })
  }
}
export type SubmissionState = Awaited<ReturnType<SubmissionStore["read"]>>
