import { z } from "zod"

export const eventKinds = { deadline: "지원 마감", interview: "면접", assessment: "코딩테스트·인적성", assignment: "과제 제출", result: "결과 확인", other: "기타" } as const
export const EventKindSchema = z.union([z.enum(["deadline", "interview", "assessment", "assignment", "result", "other"]), z.string().regex(/^custom:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)])
export const EventKindOptionSchema = z.object({ id: EventKindSchema, label: z.string().trim().min(1).max(40) }).strict()
const kinds = z.array(EventKindOptionSchema).min(1).max(50).refine(items => new Set(items.map(item => item.id)).size === items.length && new Set(items.map(item => item.label.toLocaleLowerCase())).size === items.length, "일정 종류의 이름은 서로 다르게 입력해 주세요.")
export const EventKindConfigSchema = z.object({ kinds, revision: z.number().int().min(0), updatedAt: z.string().datetime() }).strict()
export const EventKindChangeSchema = z.object({ kinds, expectedRevision: z.number().int().min(0), fallbackId: EventKindSchema }).strict().refine(value => value.kinds.some(kind => kind.id === value.fallbackId), "삭제한 일정을 옮길 종류를 선택해 주세요.")
export type EventKindOption = z.infer<typeof EventKindOptionSchema>
export type EventKindConfig = z.infer<typeof EventKindConfigSchema>
export type EventKindChange = z.infer<typeof EventKindChangeSchema>
export function configuredEventKinds(config?: EventKindConfig): EventKindOption[] { return config?.kinds || Object.entries(eventKinds).map(([id, label]) => ({ id, label })) }
export function eventKindLabel(id: string, config?: EventKindConfig) { return configuredEventKinds(config).find(kind => kind.id === id)?.label || (eventKinds as Record<string, string>)[id] || "사용자 일정" }

// Keep every restored event visible, including kinds present only in an older backup.
export function mergeEventKindConfigs(local: EventKindConfig | undefined, incoming: EventKindConfig | undefined, events: { kind: string }[]): EventKindConfig | undefined {
  if (!local && !incoming) return undefined
  const preferred = !local || incoming && incoming.updatedAt > local.updatedAt ? incoming! : local
  const merged = [...preferred.kinds], available = [...(local?.kinds || []), ...(incoming?.kinds || []), ...configuredEventKinds()]
  for (const event of events) if (!merged.some(kind => kind.id === event.kind)) {
    const original = available.find(kind => kind.id === event.kind)
    if (!original) throw new Error("백업의 사용자 일정 종류를 확인해 주세요.")
    let label = original.label
    for (let suffix = 2; merged.some(kind => kind.label.toLocaleLowerCase() === label.toLocaleLowerCase()); suffix++) label = `${original.label.slice(0, 32)} (${suffix})`
    merged.push({ ...original, label })
  }
  return EventKindConfigSchema.parse({ kinds: merged, revision: (local?.revision || 0) + 1, updatedAt: preferred.updatedAt })
}
