import React, { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import type { ApplicationRecord } from "../core/model"
import { platformLabel } from "../core/model"
import type { ApplicationLink, NoteMention } from "../core/planner"
import { deleteMentionBlock, editMentionBody, insertMention, mentionQuery, validMentions } from "../core/note-mentions"

export function MentionText({ body, mentions }: { body: string; mentions?: NoteMention[] }) {
  const parts: React.ReactNode[] = []; let offset = 0
  for (const mention of validMentions(body, mentions)) { parts.push(body.slice(offset, mention.start), <mark className="note-mention" key={`${mention.start}:${mention.linkId}`}>{body.slice(mention.start, mention.end)}</mark>); offset = mention.end }
  parts.push(body.slice(offset))
  return <>{parts}</>
}

export function NoteMentionInput({ body, mentions = [], records, links, onChange, compact = false, owner }: { owner?: string; compact?: boolean; body: string; mentions?: NoteMention[]; records: ApplicationRecord[]; links: ApplicationLink[]; onChange: (body: string, mentions: NoteMention[]) => void }) {
  const field = useRef<HTMLTextAreaElement>(null), mirror = useRef<HTMLDivElement>(null), id = useId()
  const [query, setQuery] = useState<ReturnType<typeof mentionQuery>>(), [active, setActive] = useState(0)
  const [menuPosition, setMenuPosition] = useState({ left: 8, top: 8, width: 240 })
  const recordMap = useMemo(() => new Map(records.map(record => [record.id, record])), [records])
  const normalize = (text: string) => text.normalize("NFKC").toLocaleLowerCase().replace(/\s/g, "")
  const options = query ? links.flatMap(link => {
    const record = recordMap.get(link.recordId)
    return record && normalize(`${record.companyName} ${record.jobTitle}`).includes(normalize(query.query)) ? [{ link, record }] : []
  }).slice(0, 8) : []
  const selected = Math.min(active, Math.max(0, options.length - 1))
  function refresh(value: string, caret: number, currentMentions = mentions) { setQuery(mentionQuery(value, caret, currentMentions)); setActive(0) }
  function syncMirror() {
    const input = field.current, backdrop = mirror.current
    if (!input || !backdrop) return
    const width = `${input.clientWidth}px`, top = input.scrollTop, left = input.scrollLeft
    if (backdrop.style.width !== width) backdrop.style.width = width
    if (backdrop.scrollTop !== top) backdrop.scrollTop = top
    if (backdrop.scrollLeft !== left) backdrop.scrollLeft = left
  }
  useLayoutEffect(syncMirror, [body])
  useLayoutEffect(() => {
    if (!query) return
    const place = () => { const rect = field.current?.getBoundingClientRect(); if (!rect) return; const width = Math.min(rect.width, innerWidth - 16); setMenuPosition({ left: Math.max(8, Math.min(rect.left, innerWidth - width - 8)), top: Math.max(8, Math.min(rect.bottom + 6, innerHeight - 250)), width }) }
    place(); window.addEventListener("scroll", place, true); window.addEventListener("resize", place)
    return () => { window.removeEventListener("scroll", place, true); window.removeEventListener("resize", place) }
  }, [query])
  useEffect(() => {
    let frame: number | undefined
    // Defer layout writes until after ResizeObserver delivery and coalesce resize bursts.
    const observer = new ResizeObserver(() => {
      if (frame !== undefined) return
      frame = requestAnimationFrame(() => { frame = undefined; syncMirror() })
    })
    if (field.current) observer.observe(field.current)
    return () => { observer.disconnect(); if (frame !== undefined) cancelAnimationFrame(frame) }
  }, [])
  function choose(index: number) {
    const option = options[index]; if (!option || !query || mentions.length >= 100) return
    const result = insertMention(body, query.start, query.end, option.link.id, option.record.companyName, mentions)
    if (result.body.length > 50000) return
    onChange(result.body, result.mentions); setQuery(undefined)
    requestAnimationFrame(() => { field.current?.focus(); field.current?.setSelectionRange(result.caret, result.caret) })
  }
  return <div className="note-mention-input" onKeyDown={event => { if (query && event.key === "Escape" && !event.nativeEvent.isComposing) { event.preventDefault(); event.stopPropagation(); setQuery(undefined); field.current?.focus() } }}><label className="planner-field">메모 내용<div className="note-body-surface"><div ref={mirror} className="note-mention-backdrop" aria-hidden="true"><MentionText body={body + "\n"} mentions={mentions} /></div><textarea ref={field} aria-label="메모 내용" role="combobox" aria-autocomplete="list" aria-expanded={!!query} aria-controls={query ? id : undefined} aria-activedescendant={query && options.length ? `${id}-${selected}` : undefined} aria-describedby={`${id}-hint`} onScroll={event => { if (mirror.current) { mirror.current.scrollTop = event.currentTarget.scrollTop; mirror.current.scrollLeft = event.currentTarget.scrollLeft } }} maxLength={50000} rows={compact ? 7 : 11} placeholder="기억할 내용을 적어 주세요. @로 지원했던 기업을 언급할 수 있어요." value={body} onChange={event => { const value = event.target.value; const nextMentions = editMentionBody(body, value, mentions); onChange(value, nextMentions); refresh(value, event.target.selectionStart, nextMentions) }} onClick={event => refresh(body, event.currentTarget.selectionStart)} onKeyUp={event => { if (event.key === "ArrowLeft" || event.key === "ArrowRight" || event.key === "Home" || event.key === "End") refresh(body, event.currentTarget.selectionStart) }} onBlur={event => { if (!event.currentTarget.parentElement?.parentElement?.contains(event.relatedTarget)) setQuery(undefined) }} onKeyDown={event => {
    if (event.nativeEvent.isComposing) return
    const start = event.currentTarget.selectionStart, end = event.currentTarget.selectionEnd
    if (event.key === "Backspace" || event.key === "Delete") {
      const result = deleteMentionBlock(body, start, end, event.key, mentions)
      if (result) { event.preventDefault(); onChange(result.body, result.mentions); setQuery(undefined); requestAnimationFrame(() => field.current?.setSelectionRange(result.caret, result.caret)); return }
    }
    if (start === end && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
      const token = mentions.find(mention => event.key === "ArrowLeft" ? mention.end === start : mention.start === start)
      if (token && !event.shiftKey) { event.preventDefault(); const position = event.key === "ArrowLeft" ? token.start : token.end; field.current?.setSelectionRange(position, position); return }
    }
    if (!query) return
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setQuery(undefined) }
    if (options.length && (event.key === "ArrowDown" || event.key === "ArrowUp")) { event.preventDefault(); setActive((selected + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length) }
    if (event.key === "Enter" && options.length) { event.preventDefault(); choose(selected) }
  }} /></div></label>
    {query && createPortal(<div data-note-menu-owner={owner} style={menuPosition} className="note-mention-menu" id={id} role="listbox" aria-label="지원했던 기업"><div className="note-mention-menu-label">지원했던 기업</div>{options.length ? options.map(({ link, record }, index) => <button type="button" role="option" id={`${id}-${index}`} aria-selected={selected === index} key={link.id} onMouseDown={event => event.preventDefault()} onMouseEnter={() => setActive(index)} onClick={() => choose(index)}><span className="mention-company-symbol" aria-hidden="true">{record.companyName.slice(0, 1)}</span><span><strong>{record.companyName}</strong><small>{platformLabel[record.platform]} · {record.jobTitle}</small></span></button>) : <p>{records.length ? "일치하는 기업이 없어요." : "지원 기록을 가져오거나 직접 추가해 주세요."}</p>}{mentions.length >= 100 && <p>기업 언급은 메모당 100개까지 넣을 수 있어요.</p>}</div>, document.body)}
    <p id={`${id}-hint`} className="note-mention-hint">@ 기업 언급 <span>선택한 기업의 지원 상세에서도 볼 수 있어요.</span></p>
  </div>
}
