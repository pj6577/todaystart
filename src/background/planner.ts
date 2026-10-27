import { getDataGeneration } from "../storage/data-generation"
import type { RequestHandlers } from "./context"

async function mutatePlanner<T>(generation: string | undefined, operation: () => Promise<T>): Promise<T> {
  if (generation !== await getDataGeneration()) throw new Error("데이터가 초기화되었어요. 작성 내용을 복사한 뒤 새로 열어 주세요.")
  const result = await operation()
  // Planner-only writes leave the company indexes in recruiting tabs intact.
  await chrome.storage.local.set({ plannerRevision: crypto.randomUUID() })
  return result
}

export const planner = {
  async note_save(request, { repository }) {
    return mutatePlanner(request.dataGeneration, () => repository.saveNote(request.note))
  },
  async note_layout(request, { repository }) {
    return mutatePlanner(request.dataGeneration, () => repository.changeNoteLayout(request.change))
  },
  async event_save(request, { repository }) {
    return mutatePlanner(request.dataGeneration, () => repository.saveEvent(request.event))
  },
  async planner_remove(request, { repository }) {
    return mutatePlanner(request.dataGeneration, () => repository.deletePlanner(request.kind, request.id, request.revision))
  }
} satisfies Pick<RequestHandlers, "note_save" | "note_layout" | "event_save" | "planner_remove">
