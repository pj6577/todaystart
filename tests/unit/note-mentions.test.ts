import { expect, it } from "vitest"
import { deleteMentionBlock, editMentionBody, insertMention, mentionQuery, noteLinkIds, validMentions } from "../../src/core/note-mentions"

const id = crypto.randomUUID()
it("opens company lookup at a standalone @ and ends it at whitespace", () => {
  expect(mentionQuery("준비 @넥스트그", 8)?.query).toBe("넥스트그")
  expect(mentionQuery("준비 @넥스트 그", 9)).toBeUndefined()
  expect(mentionQuery("@", 1)).toEqual({ start: 0, end: 1, query: "" })
  expect(mentionQuery("email@example.com", 17)).toBeUndefined()
  expect(mentionQuery("@회사\n다음 줄", 9)).toBeUndefined()
})
it("does not reopen a completed mention after spaces, ordinary typing or caret movement", () => {
  for (const label of ["완료기업", "두 번째 기업"]) {
    const selected = insertMention("@", 0, 1, id, label)
    for (const suffix of ["", " ", "면접 준비", "  후속 메모"]) {
      const body = selected.body + suffix
      expect(mentionQuery(body, body.length, selected.mentions)).toBeUndefined()
    }
    expect(mentionQuery(selected.body, selected.mentions[0]!.end, selected.mentions)).toBeUndefined()
  }
})
it("opens a new explicit @ after a completed mention", () => {
  const selected = insertMention("@", 0, 1, id, "완료기업"), body = selected.body + "메모 @다음"
  expect(mentionQuery(body, body.length, selected.mentions)?.query).toBe("다음")
})
it("keeps a whitespace-terminated query closed while typing more text", () => {
  for (const body of ["@완료 ", "@완료 면접", "@완료\t확인", "@완료\n메모"]) expect(mentionQuery(body, body.length)).toBeUndefined()
})
it("inserts a selected record at the caret without losing following text", () => {
  const result = insertMention("질문 @기 / 메모", 3, 5, id, "기업")
  expect(result.body).toBe("질문 @기업  / 메모")
  expect(result.mentions).toEqual([{ linkId: id, label: "기업", start: 3, end: 6 }])
  expect(result.caret).toBe(7)
})
it("shifts mentions with edits before them and preserves emoji offsets", () => {
  const result = insertMention("@", 0, 1, id, "기업")
  const body = "☀️ " + result.body
  const mentions = editMentionBody(result.body, body, result.mentions)
  expect(mentions[0]?.start).toBe("☀️ ".length)
  expect(validMentions(body, mentions)).toHaveLength(1)
})
it("unlinks edited or deleted tokens while keeping untouched mentions", () => {
  const a = insertMention("@", 0, 1, id, "기업")
  const b = insertMention(a.body + "@", a.body.length, a.body.length + 1, crypto.randomUUID(), "다른 기업", a.mentions)
  const next = b.body.replace("@기업", "@변경")
  expect(editMentionBody(b.body, next, b.mentions).map(value => value.label)).toEqual(["다른 기업"])
  expect(editMentionBody(b.body, "", b.mentions)).toEqual([])
})
it("keeps repeated company names tied to the selected records", () => {
  const other = crypto.randomUUID(), a = insertMention("@", 0, 1, id, "같은 기업")
  const b = insertMention(a.body + "@", a.body.length, a.body.length + 1, other, "같은 기업", a.mentions)
  expect(noteLinkIds({ linkId: id, mentions: b.mentions })).toEqual([id, other])
})
it("rejects mismatching, overlapping and out of bounds reference spans", () => {
  const mention = { linkId: id, label: "기업", start: 0, end: 3 }
  expect(validMentions("@기업", [mention, mention])).toHaveLength(1)
  expect(validMentions("@기업", [{ ...mention, end: 100 }])).toEqual([])
  expect(validMentions("@변경", [mention])).toEqual([])
})
it("deletes a mention as one block with Backspace or Delete, keeping surrounding text", () => {
  const result = insertMention("앞 @ 뒤", 2, 3, id, "기업")
  expect(deleteMentionBlock(result.body, 5, 5, "Backspace", result.mentions)).toMatchObject({ body: "앞   뒤", mentions: [], caret: 2 })
  expect(deleteMentionBlock(result.body, 2, 2, "Delete", result.mentions)?.mentions).toEqual([])
  expect(deleteMentionBlock(result.body, 0, 0, "Backspace", result.mentions)).toBeUndefined()
})
it("expands a partial selection to remove the whole mention and shifts later blocks", () => {
  const a = insertMention("@", 0, 1, id, "기업")
  const b = insertMention(a.body + "@", a.body.length, a.body.length + 1, crypto.randomUUID(), "다른 기업", a.mentions)
  const removed = deleteMentionBlock(b.body, 1, 2, "Backspace", b.mentions)!
  expect(removed.mentions.map(mention => mention.label)).toEqual(["다른 기업"])
  expect(validMentions(removed.body, removed.mentions)).toHaveLength(1)
})
