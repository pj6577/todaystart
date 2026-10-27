import type { Platform } from "../core/model"
import { platformForUrl, jobIdFromUrl, safeJobUrl } from "../core/urls"
import { historyObservationRoot, historyText, isBuiltInHistoryUrl, parseBuiltInHistory } from "./history"
import { historyPagination } from "./history-pagination"

const pageLabel = /^(?:다음(?:\s*페이지)?|이전(?:\s*페이지)?|처음(?:\s*페이지)?|첫\s*페이지|마지막(?:\s*페이지)?|(?:next|prev(?:ious)?|first|last)(?:\s*page)?|[›»>‹«<])$/i
const structure = (element: Element) => ({
  tag: element.tagName.toLowerCase(),
  classes: (element.getAttribute("class") || "").slice(0, 250).replace(/\d/g, "0"),
  role: ["navigation", "button", "link", "list", "listitem"].includes(element.getAttribute("role") || "") ? element.getAttribute("role") : undefined
})

// Inspect candidates independently of the production pagination detector. A
// missing detection is exactly when we need to see nested/custom controls,
// including those outside <main>. Never copy handlers or arbitrary labels.
function navigationCandidates(doc: Document) {
  return [...doc.querySelectorAll("a,button,[role=button],[aria-current=page],strong,span")].flatMap(element => {
    if (element.closest("todaystart-warning,todaystart-collection")) return []
    const text = (element.textContent || "").trim()
    const labels = [element.getAttribute("aria-label"), element.getAttribute("title"), text, element.querySelector("img[alt]")?.getAttribute("alt")].filter((value): value is string => !!value).map(value => value.trim())
    const label = labels.find(value => pageLabel.test(value))
    const number = /^[1-9]\d{0,3}$/.test(text) ? Number(text) : undefined
    const href = element.getAttribute("href")?.trim()
    const ancestry: Element[] = []
    for (let parent = element.parentElement; parent && !parent.matches("body,html") && ancestry.length < 5; parent = parent.parentElement) ancestry.push(parent)
    const pageContext = [element, ...ancestry].some(node => /pag(?:e|ing|inat)|pgn/i.test(node.getAttribute("class") || "") || /pag(?:e|ing|inat)|pgn/i.test(node.id) || /페이지|pagination/i.test(node.getAttribute("aria-label") || "") || node.getAttribute("role") === "navigation")
    const pageParameters: Record<string, number> = {}
    if (href && !/^(?:#|javascript:)/i.test(href)) {
      try {
        const url = new URL(href, doc.URL)
        if (platformForUrl(url.href) === platformForUrl(doc.URL)) {
          for (const [key, value] of url.searchParams) if (/^(?:page|pageno|pageindex|offset|limit|pagecount)$/i.test(key) && /^\d{1,6}$/.test(value)) pageParameters[key.toLowerCase()] = Number(value)
        }
      } catch { /* A malformed URL has no safe page metadata. */ }
    }
    const interactive = element.matches("a,button,[role=button]")
    if (!(label || Object.keys(pageParameters).length || number && (interactive || pageContext) || pageContext && interactive)) return []
    return [{
      ...structure(element),
      number,
      // Only the fixed page-label vocabulary can leave the page.
      label,
      inPageContext: pageContext,
      hasText: !!historyText(element),
      hidden: !!element.closest('[hidden],[aria-hidden="true"]'),
      disabled: !!element.closest('[disabled],[aria-disabled="true"]'),
      current: element.getAttribute("aria-current") === "page" || element.getAttribute("aria-selected") === "true",
      linkKind: href === undefined ? "none" : /^javascript:/i.test(href) ? "script" : href.startsWith("#") ? "fragment" : href ? "url" : "empty",
      hasClickHandler: element.hasAttribute("onclick"),
      pageParameters,
      ancestry: ancestry.map(parent => ({ ...structure(parent), children: parent.children.length }))
    }]
  }).slice(0, 300)
}

// An explicit local export, never sent anywhere by the extension. Text and
// nonstructural attributes are redacted so account/profile data is not copied.
export function historyDiagnostics(doc: Document, platform: Platform) {
  if (!isBuiltInHistoryUrl(doc.URL, platform)) throw new Error("지원 현황 페이지에서 실행해 주세요.")
  const root = historyObservationRoot(doc) || doc.body
  const parsed = parseBuiltInHistory(doc, platform)
  const pagination = historyPagination(doc, platform)
  const controlShape = (element?: HTMLElement) => element ? {
    tag: element.tagName.toLowerCase(),
    linkKind: element.matches("a") ? /^javascript:/i.test(element.getAttribute("href") || "") ? "script" : (element.getAttribute("href") || "").startsWith("#") ? "fragment" : "url" : "button",
    numbered: /^\d{1,5}$/.test(element.textContent?.trim() || "")
  } : undefined
  const tables = [...doc.querySelectorAll("table,[role=table]")].slice(0, 40).map((table, index) => {
    const rows = [...table.querySelectorAll("tbody > tr,[role=row]")].filter(row => row.querySelector("td,[role=cell]"))
    return { index, inObservedRoot: root.contains(table), rows: rows.length, rowShapes: rows.slice(0, 100).map(row => ({
      cells: row.querySelectorAll(":scope > td,:scope > [role=cell]").length,
      visibleText: !!historyText(row),
      jobLinks: [...row.querySelectorAll("a[href]")].filter(link => !!jobIdFromUrl(safeJobUrl(link.getAttribute("href"), platform, doc.URL))).length,
      cellShapes: [...row.querySelectorAll(":scope > td,:scope > [role=cell]")].slice(0, 30).map(cell => ({
        ...structure(cell),
        colspan: /^\d{1,3}$/.test(cell.getAttribute("colspan") || "") ? Number(cell.getAttribute("colspan")) : undefined,
        rowspan: /^\d{1,3}$/.test(cell.getAttribute("rowspan") || "") ? Number(cell.getAttribute("rowspan")) : undefined,
        visibleText: !!historyText(cell),
        links: cell.querySelectorAll("a").length,
        dateFormats: [...new Set((historyText(cell).match(/(?:\d{4}|\d{2})[.\-/]\s*\d{1,2}[.\-/]\s*\d{1,2}|\d{4}\s*년\s*\d{1,2}\s*월\s*\d{1,2}\s*일/g) || []).map(value => value.replace(/\d/g, "0")))]
      }))
    })) }
  })
  const clone = root.cloneNode(true) as Element
  for (const node of clone.querySelectorAll("script,style,input,textarea,select,button,nav,header,footer,iframe,img,svg,canvas,todaystart-warning,todaystart-collection,[hidden],[aria-hidden=true]")) node.remove()
  let count = 0
  for (const element of [clone, ...clone.querySelectorAll("*")]) {
    if (++count > 1200) { element.remove(); continue }
    for (const attribute of [...element.attributes]) {
      if (["class", "id", "role", "colspan", "rowspan"].includes(attribute.name)) {
        element.setAttribute(attribute.name, attribute.value.slice(0, 250).replace(/\d/g, "0"))
      } else if (attribute.name === "href") {
        try {
          const url = new URL(attribute.value, doc.URL)
          if (platformForUrl(url.href) !== platform) element.removeAttribute("href")
          else {
            const cleaned = new URL(url.origin + url.pathname.replace(/\d/g, "0"))
            if (url.searchParams.has("rec_idx")) cleaned.searchParams.set("rec_idx", "00000000")
            element.setAttribute("href", cleaned.href)
          }
        } catch { element.removeAttribute("href") }
      } else element.removeAttribute(attribute.name)
    }
    for (const node of [...element.childNodes]) {
      if (node.nodeType === Node.COMMENT_NODE) node.remove()
      if (node.nodeType !== Node.TEXT_NODE || !node.textContent?.trim()) continue
      const text = node.textContent.trim()
      node.textContent = /^(?:기업명|회사명|기업|지원기업|공고명|공고제목|채용공고|지원공고|모집분야|지원직무|지원일|지원일자|접수일|접수일자|지원상태|진행상태|열람여부|지원결과|전형결과|지원\s*완료|접수\s*완료|지원\s*취소|미열람|열람)$/.test(text) ? text : "[텍스트]"
    }
  }
  return {
    format: "todaystart-history-structure-v1", platform,
    path: new URL(doc.URL).pathname, capturedAt: new Date().toISOString(),
    note: "계정·기업명·직무·날짜·식별자·스크립트·입력값을 제거한 화면 구조입니다.",
    headings: [...root.querySelectorAll("th,[role=columnheader]")].map(historyText).filter(text => /^(?:기업명|회사명|기업|지원기업|공고명|공고제목|채용공고|지원공고|모집분야|지원직무|지원일|지원일자|접수일|접수일자|지원상태|진행상태|열람여부|지원결과|전형결과)$/.test(text)),
    parsing: { code: parsed.code, recognized: parsed.records.length, skipped: parsed.skipped }, tables,
    pagination: { currentPage: pagination.currentPage, hasNextPage: pagination.hasNextPage, endKnown: pagination.endKnown, next: controlShape(pagination.next), first: controlShape(pagination.first) },
    navigationCandidates: navigationCandidates(doc),
    html: clone.outerHTML.slice(0, 150000)
  }
}
