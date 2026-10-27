import type { Note, NoteMention } from "./planner"

export function validMentions(body: string, mentions: NoteMention[] = []) {
  let end = 0
  return [...mentions].sort((a, b) => a.start - b.start).filter(mention => {
    if (mention.start < end || mention.end <= mention.start || mention.end > body.length || body.slice(mention.start, mention.end) !== `@${mention.label}`) return false
    end = mention.end; return true
  })
}
export function noteLinkIds(note: Pick<Note, "linkId" | "mentions">) { return [...new Set([...(note.linkId ? [note.linkId] : []), ...(note.mentions || []).map(mention => mention.linkId)])] }
// Textarea selections and JavaScript strings both use UTF-16 offsets, including emoji.
export function editMentionBody(before: string, after: string, mentions: NoteMention[] = []) {
  let start = 0, oldEnd = before.length, newEnd = after.length
  while (start < oldEnd && start < newEnd && before[start] === after[start]) start++
  while (oldEnd > start && newEnd > start && before[oldEnd - 1] === after[newEnd - 1]) { oldEnd--; newEnd-- }
  const delta = newEnd - oldEnd
  return validMentions(after, mentions.flatMap(mention => mention.end <= start ? [mention] : mention.start >= oldEnd ? [{ ...mention, start: mention.start + delta, end: mention.end + delta }] : []))
}
export function mentionQuery(body: string, caret: number, mentions: NoteMention[] = []) {
  const start = body.lastIndexOf("@", caret - 1)
  if (start < 0 || start > 0 && /[\p{L}\p{N}_@]/u.test(body[start - 1]!)) return undefined
  if (validMentions(body, mentions).some(mention => mention.start === start)) return undefined
  const query = body.slice(start + 1, caret)
  return !/[\s@]/.test(query) && query.length <= 80 ? { start, end: caret, query } : undefined
}
export function insertMention(body: string, start: number, end: number, linkId: string, label: string, mentions: NoteMention[] = []) {
  const token = `@${label}`, next = body.slice(0, start) + token + " " + body.slice(end)
  return { body: next, mentions: [...editMentionBody(body, next, mentions), { linkId, label, start, end: start + token.length }].sort((a,b) => a.start - b.start), caret: start + token.length + 1 }
}
export function deleteMentionBlock(body: string, start: number, end: number, key: "Backspace" | "Delete", mentions: NoteMention[] = []) {
  const hits = mentions.filter(mention => start === end ? key === "Backspace" ? mention.start < start && mention.end >= start : mention.start <= start && mention.end > start : mention.start < end && mention.end > start)
  if (!hits.length) return undefined
  const from = Math.min(start, ...hits.map(mention => mention.start)), to = Math.max(end, ...hits.map(mention => mention.end)), next = body.slice(0, from) + body.slice(to)
  return { body: next, mentions: editMentionBody(body, next, mentions), caret: from }
}
