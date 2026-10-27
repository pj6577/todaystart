import { useEffect, useRef, useState } from "react"
import { rpc } from "../messaging/protocol"
import type { Snapshot } from "../messaging/contracts"
import { draftsChanged, readPlannerDrafts, syncDraftGeneration, type PlannerDraft } from "./planner-drafts"

export function useWorkspaceData(onGenerationChange: () => void, onError: (message: string) => void) {
  const [snapshot, setSnapshot] = useState<Snapshot>()
  const [drafts, setDrafts] = useState<PlannerDraft[]>([])
  const draftGeneration = useRef<string>()
  const callbacks = useRef({ onGenerationChange, onError })
  callbacks.current = { onGenerationChange, onError }

  async function load() {
    const next = await rpc({ type: "snapshot" })
    if (draftGeneration.current !== next.dataGeneration) callbacks.current.onGenerationChange()
    draftGeneration.current = next.dataGeneration
    syncDraftGeneration(next.dataGeneration)
    setDrafts(readPlannerDrafts(next.dataGeneration)); setSnapshot(next)
  }
  async function loadPlanner() {
    const next = await rpc({ type: "planner_snapshot" })
    if (draftGeneration.current !== next.dataGeneration) { await load(); return }
    setSnapshot(current => current && current.dataGeneration === next.dataGeneration ? { ...current, planner: next.planner } : current)
  }
  useEffect(() => {
    void load().catch(e => callbacks.current.onError(e.message))
    const changed = (changes: Record<string, chrome.storage.StorageChange>) => {
      if (changes.revision || changes.settings || changes.reports || changes.historyRun || changes.historyCompletions || changes.submissionAttempts) void load().catch(e => callbacks.current.onError(e.message))
      else if (changes.plannerRevision) void loadPlanner().catch(e => callbacks.current.onError(e.message))
    }
    const refreshDrafts = () => setDrafts(readPlannerDrafts(draftGeneration.current))
    chrome.storage.onChanged.addListener(changed)
    window.addEventListener(draftsChanged, refreshDrafts)
    window.addEventListener("storage", refreshDrafts)
    return () => {
      chrome.storage.onChanged.removeListener(changed)
      window.removeEventListener(draftsChanged, refreshDrafts)
      window.removeEventListener("storage", refreshDrafts)
    }
  }, [])

  return { snapshot, setSnapshot, drafts, load }
}
