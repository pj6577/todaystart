import { afterEach, expect, it, vi } from "vitest"
import { z } from "zod"
import { ManualApplicationSchema } from "../../src/core/model"
import { RequestSchema, requestErrorMessage, rpc, type Request } from "../../src/messaging/protocol"

afterEach(() => vi.unstubAllGlobals())

const manualRequest = () => ({
  type: "manual_create",
  submissionAttemptId: crypto.randomUUID(),
  dataGeneration: crypto.randomUUID(),
  application: {
    platform: "wanted", companyName: "호환성 확인 기업", jobTitle: "개발자",
    appliedAt: "2026-10-28", status: "applied", jobUrl: "https://www.wanted.co.kr/wd/100"
  }
} satisfies Request)

function legacyError(request: ReturnType<typeof manualRequest>) {
  // The pre-0.10 manual request accepted the application only.
  const legacy = z.object({ type: z.literal("manual_create"), application: ManualApplicationSchema }).strict().safeParse(request)
  if (legacy.success) throw new Error("Expected the legacy background to reject the new envelope")
  expect(legacy.error.issues).toMatchObject([{ code: "unrecognized_keys", path: [], keys: ["submissionAttemptId", "dataGeneration"] }])
  return legacy.error.message
}

it("explains the exact legacy manual-create rejection reported after an upgrade", () => {
  const request = manualRequest()
  expect(RequestSchema.parse(request)).toEqual(request)
  const message = requestErrorMessage(legacyError(request))
  expect(message).toContain("이전 버전의 백그라운드")
  expect(message).toContain("chrome://extensions")
  expect(message).not.toContain("unrecognized_keys")
})

it("does not retry by stripping attempt ownership or reset-generation protection", async () => {
  const request = manualRequest()
  const sendMessage = vi.fn().mockResolvedValue({ ok: false, error: legacyError(request) })
  vi.stubGlobal("chrome", { runtime: { sendMessage } })
  await expect(rpc(request)).rejects.toThrow("chrome://extensions")
  expect(sendMessage).toHaveBeenCalledTimes(1)
  expect(sendMessage).toHaveBeenCalledWith(request)
})

it.each([["dataGeneration"], ["submissionAttemptId"]])("recognizes a legacy root field: %s", (...keys) => {
  expect(requestErrorMessage(JSON.stringify([{ code: "unrecognized_keys", path: [], keys }]))).toContain("chrome://extensions")
})

it.each([
  { code: "unrecognized_keys", path: [], keys: ["unexpected"] },
  { code: "unrecognized_keys", path: [], keys: ["dataGeneration", "unexpected"] },
  { code: "unrecognized_keys", path: ["application"], keys: ["dataGeneration"] },
  { code: "unrecognized_keys", path: [], keys: [] },
  { code: "unrecognized_keys", path: [], keys: null },
  { code: "invalid_string", path: ["submissionAttemptId"], message: "Invalid uuid" }
])("keeps unrelated validation errors intact: %j", issue => {
  const message = JSON.stringify([issue])
  expect(requestErrorMessage(message)).toBe(message)
})
