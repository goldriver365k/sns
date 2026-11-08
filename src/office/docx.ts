// 워드(.docx) 읽기·간단 수정·저장. 원본 ZIP은 그대로 두고 본문(document.xml)과
// 필요할 때 스타일(styles.xml)만 바꿔 넣으므로 머리글·바닥글·그림 등은 그대로 남는다.
import type JSZip from 'jszip'
import { attr, baseName, child, children, loadZip, mainPart, makeEl, readRels, readXml, writeXml } from './ooxml'

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
const XML_NS = 'http://www.w3.org/XML/1998/namespace'
export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

/** 문단 모양: 본문·제목·소제목 */
export type Level = 'normal' | 'title' | 'h1' | 'h2' | 'h3'
export const LEVELS: { id: Level; label: string }[] = [
  { id: 'normal', label: '본문' },
  { id: 'title', label: '문서 제목' },
  { id: 'h1', label: '제목 1' },
  { id: 'h2', label: '제목 2' },
  { id: 'h3', label: '제목 3' },
]
export type Align = 'left' | 'center' | 'right' | 'both'

export type Run = {
  text: string
  b?: boolean
  i?: boolean
  u?: boolean
  strike?: boolean
  /** 글자 크기(pt) */
  size?: number
  color?: string
  img?: { src: string | null; w: number; h: number }
}
export type Para = {
  kind: 'p'
  key: string
  el: Element
  level: Level | 'other'
  align: Align
  list: boolean
  runs: Run[]
  /** 수정 칸에 넣을 글 (탭 \t, 줄바꿈 \n 포함) */
  text: string
}
export type TableBlock = { kind: 'table'; key: string; rows: { cells: { span: number; blocks: Block[] }[] }[] }
export type Block = Para | TableBlock

export type WordDoc = {
  kind: 'docx'
  fileName: string
  zip: JSZip
  docPath: string
  doc: Document
  stylesPath: string | null
  styles: Document | null
  /** 스타일 id → 문단 모양 */
  styleLevels: Map<string, Level>
  /** 글머리 기호·번호가 붙는 스타일 id */
  listStyles: Set<string>
  /** 연결 id → 그림 주소(blob URL) */
  images: Map<string, string | null>
  blocks: Block[]
  changed: boolean
  stylesChanged: boolean
}

// ── 읽기 ────────────────────────────────────────────
const isOn = (el: Element | null) => !!el && !['0', 'false', 'none'].includes(attr(el, 'val') ?? '')

function runProps(rPr: Element | null): Omit<Run, 'text'> {
  if (!rPr) return {}
  const sz = Number(attr(child(rPr, 'sz'), 'val'))
  const color = attr(child(rPr, 'color'), 'val')
  return {
    b: isOn(child(rPr, 'b')) || undefined,
    i: isOn(child(rPr, 'i')) || undefined,
    u: isOn(child(rPr, 'u')) || undefined,
    strike: isOn(child(rPr, 'strike')) || isOn(child(rPr, 'dstrike')) || undefined,
    size: sz ? sz / 2 : undefined,
    color: color && color !== 'auto' && /^[0-9a-f]{6}$/i.test(color) ? `#${color}` : undefined,
  }
}

/** 문단 안에서 글이 들어 있는 곳을 차례로 돈다. 지운 글(변경 내용 추적의 삭제)은 건너뛴다. */
const PASS_THROUGH = new Set(['hyperlink', 'ins', 'smartTag', 'fldSimple', 'sdt', 'sdtContent', 'customXml', 'moveTo', 'bdo', 'dir'])
type Seg = { node: Element; text: string; run: Element }
function walkPara(p: Element, onSeg: (s: Seg) => void, onImage?: (drawing: Element, run: Element) => void) {
  const walk = (el: Element) => {
    for (const c of Array.from(el.children)) {
      if (c.localName === 'r') {
        for (const k of Array.from(c.children)) {
          if (k.localName === 't') onSeg({ node: k, text: k.textContent ?? '', run: c })
          else if (k.localName === 'tab') onSeg({ node: k, text: '\t', run: c })
          else if (k.localName === 'br' || k.localName === 'cr') onSeg({ node: k, text: '\n', run: c })
          else if (k.localName === 'noBreakHyphen') onSeg({ node: k, text: '-', run: c })
          else if ((k.localName === 'drawing' || k.localName === 'pict') && onImage) onImage(k, c)
        }
      } else if (PASS_THROUGH.has(c.localName)) walk(c)
    }
  }
  walk(p)
}

function readPara(d: WordDoc, p: Element, key: string): Para {
  const pPr = child(p, 'pPr')
  const styleId = attr(child(pPr ?? p, 'pStyle'), 'val')
  const jc = attr(child(pPr ?? p, 'jc'), 'val') ?? 'left'
  const runs: Run[] = []
  let text = ''
  walkPara(
    p,
    (s) => {
      text += s.text
      const props = runProps(child(s.run, 'rPr'))
      const last = runs[runs.length - 1]
      // 같은 글자 모양이 이어지면 한 덩어리로 합친다
      if (last && !last.img && last.b === props.b && last.i === props.i && last.u === props.u && last.strike === props.strike && last.size === props.size && last.color === props.color) last.text += s.text
      else runs.push({ text: s.text, ...props })
    },
    (drawing) => {
      const blip = drawing.getElementsByTagNameNS('*', 'blip')[0] ?? drawing.getElementsByTagNameNS('*', 'imagedata')[0]
      const id = attr(blip ?? null, 'embed') ?? attr(blip ?? null, 'id')
      const ext = drawing.getElementsByTagNameNS('*', 'extent')[0]
      const w = Math.round(Number(ext?.getAttribute('cx') ?? 0) / 9525) || 200
      const h = Math.round(Number(ext?.getAttribute('cy') ?? 0) / 9525) || 150
      runs.push({ text: '', img: { src: id ? (d.images.get(id) ?? null) : null, w, h } })
    },
  )
  let level: Para['level'] = 'normal'
  if (styleId) level = d.styleLevels.get(styleId) ?? 'other'
  return {
    kind: 'p',
    key,
    el: p,
    level,
    align: jc === 'center' ? 'center' : jc === 'right' || jc === 'end' ? 'right' : jc === 'both' || jc === 'distribute' ? 'both' : 'left',
    list: !!child(pPr ?? p, 'numPr') || (!!styleId && d.listStyles.has(styleId)),
    runs,
    text,
  }
}

function readBlocks(d: WordDoc, parent: Element, prefix: string): Block[] {
  const out: Block[] = []
  Array.from(parent.children).forEach((el, i) => {
    const key = `${prefix}${i}`
    if (el.localName === 'p') out.push(readPara(d, el, key))
    else if (el.localName === 'tbl') {
      out.push({
        kind: 'table',
        key,
        rows: children(el, 'tr').map((tr, ri) => ({
          cells: children(tr, 'tc').map((tc, ci) => ({
            span: Number(attr(child(child(tc, 'tcPr') ?? tc, 'gridSpan'), 'val')) || 1,
            blocks: readBlocks(d, tc, `${key}.${ri}.${ci}.`),
          })),
        })),
      })
    } else if (el.localName === 'sdt') {
      const content = child(el, 'sdtContent')
      if (content) out.push(...readBlocks(d, content, `${key}.`))
    } else if (el.localName === 'customXml') out.push(...readBlocks(d, el, `${key}.`))
  })
  return out
}

function body(d: WordDoc): Element {
  const b = d.doc.getElementsByTagNameNS(W, 'body')[0]
  if (!b) throw new Error('워드 본문을 찾지 못했습니다.')
  return b
}

/** 고친 뒤 화면용 내용을 다시 읽는다 */
export function refresh(d: WordDoc) {
  d.blocks = readBlocks(d, body(d), '')
}

function readStyleLevels(styles: Document | null): Map<string, Level> {
  const map = new Map<string, Level>()
  if (!styles) return map
  for (const s of Array.from(styles.getElementsByTagNameNS(W, 'style'))) {
    if (attr(s, 'type') !== 'paragraph') continue
    const id = attr(s, 'styleId')
    const name = (attr(child(s, 'name'), 'val') ?? '').toLowerCase()
    if (!id) continue
    if (name === 'title') map.set(id, 'title')
    else if (name === 'heading 1') map.set(id, 'h1')
    else if (name === 'heading 2') map.set(id, 'h2')
    else if (name === 'heading 3') map.set(id, 'h3')
    else if (name === 'normal') map.set(id, 'normal')
  }
  return map
}

const IMAGE_TYPES: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp', webp: 'image/webp', svg: 'image/svg+xml' }

async function readDoc(zip: JSZip, fileName: string): Promise<WordDoc> {
  const docPath = await mainPart(zip, 'word/document.xml')
  const doc = await readXml(zip, docPath)
  if (!doc || doc.documentElement.localName !== 'document') throw new Error('워드 문서(.docx)가 아닙니다.')
  const rels = await readRels(zip, docPath)
  const stylesPath = rels.find((r) => r.type.endsWith('/styles'))?.target ?? null
  const styles = stylesPath ? await readXml(zip, stylesPath) : null
  const images = new Map<string, string | null>()
  for (const r of rels) {
    if (!r.type.endsWith('/image') || r.external) continue
    const file = zip.file(r.target)
    const type = IMAGE_TYPES[r.target.split('.').pop()?.toLowerCase() ?? '']
    // EMF·WMF 같은 윈도우 전용 그림은 브라우저가 못 그리므로 자리만 표시한다
    images.set(r.id, file && type ? URL.createObjectURL(new Blob([await file.async('arraybuffer')], { type })) : null)
  }
  const listStyles = new Set<string>()
  for (const st of styles ? Array.from(styles.getElementsByTagNameNS(W, 'style')) : []) {
    const id = attr(st, 'styleId')
    if (id && child(child(st, 'pPr') ?? st, 'numPr')) listStyles.add(id)
  }
  const d: WordDoc = { kind: 'docx', fileName, zip, docPath, doc, stylesPath, styles, styleLevels: readStyleLevels(styles), listStyles, images, blocks: [], changed: false, stylesChanged: false }
  refresh(d)
  return d
}

export async function openDocx(file: Blob, fileName: string): Promise<WordDoc> {
  return readDoc(await loadZip(file), fileName)
}

/** 문서를 닫을 때 그림 주소를 정리한다 */
export function closeDocx(d: WordDoc) {
  for (const url of d.images.values()) if (url) URL.revokeObjectURL(url)
}

// ── 새 문서 ─────────────────────────────────────────
const HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
const headingStyle = (id: string, name: string, size: number, outline?: number) =>
  `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${name}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/>` +
  `<w:pPr><w:keepNext/><w:spacing w:before="240" w:after="120"/>${outline !== undefined ? `<w:outlineLvl w:val="${outline}"/>` : ''}</w:pPr>` +
  `<w:rPr><w:b/><w:sz w:val="${size}"/><w:szCs w:val="${size}"/></w:rPr></w:style>`

export async function newDocx(): Promise<WordDoc> {
  const { default: JSZip } = await import('jszip')
  const zip = new JSZip()
  zip.file(
    '[Content_Types].xml',
    HEAD +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
      '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
      '</Types>',
  )
  zip.file(
    '_rels/.rels',
    HEAD +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
      '</Relationships>',
  )
  zip.file(
    'word/_rels/document.xml.rels',
    HEAD +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
      '</Relationships>',
  )
  zip.file(
    'word/document.xml',
    HEAD +
      `<w:document xmlns:w="${W}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>` +
      '<w:p><w:pPr><w:pStyle w:val="Title"/></w:pPr><w:r><w:t>제목</w:t></w:r></w:p>' +
      '<w:p><w:r><w:t xml:space="preserve">여기에 내용을 쓰세요.</w:t></w:r></w:p>' +
      '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1701" w:right="1440" w:bottom="1440" w:left="1440" w:header="851" w:footer="992" w:gutter="0"/></w:sectPr>' +
      '</w:body></w:document>',
  )
  zip.file(
    'word/styles.xml',
    HEAD +
      `<w:styles xmlns:w="${W}">` +
      '<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="맑은 고딕" w:eastAsia="맑은 고딕" w:hAnsi="맑은 고딕" w:cs="맑은 고딕"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="en-US" w:eastAsia="ko-KR"/></w:rPr></w:rPrDefault>' +
      '<w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>' +
      '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>' +
      headingStyle('Title', 'Title', 52) +
      headingStyle('Heading1', 'heading 1', 36, 0) +
      headingStyle('Heading2', 'heading 2', 30, 1) +
      headingStyle('Heading3', 'heading 3', 26, 2) +
      '</w:styles>',
  )
  return readDoc(zip, '새 워드.docx')
}

// ── 고치기 ──────────────────────────────────────────
// 워드는 pPr·rPr 안 요소 순서가 틀리면 "파일 손상"으로 보므로 정해진 순서대로 넣는다
const PPR_ORDER = ['pStyle', 'keepNext', 'keepLines', 'pageBreakBefore', 'framePr', 'widowControl', 'numPr', 'suppressLineNumbers', 'pBdr', 'shd', 'tabs', 'suppressAutoHyphens', 'kinsoku', 'wordWrap', 'overflowPunct', 'topLinePunct', 'autoSpaceDE', 'autoSpaceDN', 'bidi', 'adjustRightInd', 'snapToGrid', 'spacing', 'ind', 'contextualSpacing', 'mirrorIndents', 'suppressOverlap', 'jc', 'textDirection', 'textAlignment', 'textboxTightWrap', 'outlineLvl', 'divId', 'cnfStyle', 'rPr', 'sectPr', 'pPrChange']
const RPR_ORDER = ['rStyle', 'rFonts', 'b', 'bCs', 'i', 'iCs', 'caps', 'smallCaps', 'strike', 'dstrike', 'outline', 'shadow', 'emboss', 'imprint', 'noProof', 'snapToGrid', 'vanish', 'webHidden', 'color', 'spacing', 'w', 'kern', 'position', 'sz', 'szCs', 'highlight', 'u', 'effect', 'bdr', 'shd', 'fitText', 'vertAlign', 'rtl', 'cs', 'em', 'lang', 'eastAsianLayout', 'specVanish', 'oMath']

function wEl(d: WordDoc | Document, local: string): Element {
  const doc = 'doc' in d ? d.doc : d
  return makeEl(doc, W, local)
}
function setW(el: Element, name: string, value: string) {
  el.setAttributeNS(W, `${el.prefix ? `${el.prefix}:` : ''}${name}`, value)
}

/** 정해진 순서에 맞는 자리에 넣는다(같은 이름이 있으면 바꾼다) */
function putOrdered(parent: Element, el: Element, order: string[]) {
  const existing = child(parent, el.localName)
  if (existing) {
    existing.replaceWith(el)
    return
  }
  const idx = order.indexOf(el.localName)
  const next = Array.from(parent.children).find((c) => order.indexOf(c.localName) > idx)
  parent.insertBefore(el, next ?? null)
}

function ensurePPr(d: WordDoc, p: Element): Element {
  let pPr = child(p, 'pPr')
  if (!pPr) {
    pPr = wEl(d, 'pPr')
    p.insertBefore(pPr, p.firstElementChild)
  }
  return pPr
}
function ensureRPr(d: WordDoc, r: Element): Element {
  let rPr = child(r, 'rPr')
  if (!rPr) {
    rPr = wEl(d, 'rPr')
    r.insertBefore(rPr, r.firstElementChild)
  }
  return rPr
}

function makeT(d: WordDoc, text: string) {
  const t = wEl(d, 't')
  t.textContent = text
  t.setAttributeNS(XML_NS, 'xml:space', 'preserve')
  return t
}
/** 넣을 글을 t / tab / br 요소들로 바꾼다 */
function textNodes(d: WordDoc, text: string): Element[] {
  const out: Element[] = []
  for (const part of text.split(/(\t|\n)/)) {
    if (part === '\t') out.push(wEl(d, 'tab'))
    else if (part === '\n') out.push(wEl(d, 'br'))
    else if (part) out.push(makeT(d, part))
  }
  return out
}

/** 문단 기호의 글자 모양(pPr/rPr)을 새 글자 덩어리에 쓸 수 있게 복사 */
function markRunProps(p: Element): Element | null {
  const pPr = child(p, 'pPr')
  const src = pPr && child(pPr, 'rPr')
  if (!src) return null
  const rPr = src.cloneNode(true) as Element
  for (const c of Array.from(rPr.children)) if (['ins', 'del', 'moveFrom', 'moveTo', 'rPrChange'].includes(c.localName)) c.remove()
  return rPr.children.length ? rPr : null
}

/**
 * 문단 글을 바꾼다. 앞뒤로 같은 부분은 그대로 두고 바뀐 가운데만 고치므로
 * 굵게·색 같은 글자 모양과 그림·링크가 최대한 남는다.
 */
export function setParagraphText(d: WordDoc, p: Element, next: string) {
  next = next.replace(/\r\n?/g, '\n')
  const segs: Seg[] = []
  walkPara(p, (s) => segs.push(s))
  const old = segs.map((s) => s.text).join('')
  if (old === next) return
  let pre = 0
  while (pre < old.length && pre < next.length && old[pre] === next[pre]) pre++
  let suf = 0
  while (suf < old.length - pre && suf < next.length - pre && old[old.length - 1 - suf] === next[next.length - 1 - suf]) suf++
  const delStart = pre
  const delEnd = old.length - suf
  const insert = next.slice(pre, next.length - suf)

  let pos = 0
  let inserted = false
  let anchorAfter: Element | null = null // 넣을 자리를 못 찾으면 이 요소 뒤에
  for (const s of segs) {
    const a = pos
    const b = pos + s.text.length
    pos = b
    if (s.node.localName === 't') {
      const cutFrom = Math.min(Math.max(delStart - a, 0), s.text.length)
      const cutTo = Math.min(Math.max(delEnd - a, 0), s.text.length)
      const before = s.text.slice(0, cutFrom)
      const after = s.text.slice(cutTo)
      if (!inserted && insert && delStart >= a && delStart <= b) {
        s.node.textContent = before
        s.node.setAttributeNS(XML_NS, 'xml:space', 'preserve')
        const nodes = textNodes(d, insert)
        if (after) nodes.push(makeT(d, after))
        s.node.after(...nodes)
        inserted = true
      } else if (cutFrom !== cutTo) {
        s.node.textContent = before + after
        s.node.setAttributeNS(XML_NS, 'xml:space', 'preserve')
      }
      if (b <= delStart) anchorAfter = s.node
    } else {
      if (a >= delStart && b <= delEnd && b > a) s.node.remove()
      else if (b <= delStart) anchorAfter = s.node
    }
  }
  if (!inserted && insert) {
    const nodes = textNodes(d, insert)
    if (anchorAfter && anchorAfter.isConnected) anchorAfter.after(...nodes)
    else {
      const firstRun = segs.find((s) => s.run.isConnected)?.run
      if (firstRun) {
        // 맨 앞에 넣는 경우: 첫 글자 덩어리의 글자 모양을 따른다
        const rPr = child(firstRun, 'rPr')
        if (rPr) rPr.after(...nodes)
        else firstRun.prepend(...nodes)
      } else {
        const r = wEl(d, 'r')
        const rPr = markRunProps(p)
        if (rPr) r.appendChild(rPr)
        r.append(...nodes)
        p.appendChild(r)
      }
    }
  }
  // 비어 버린 t 요소 정리
  walkPara(p, (s) => {
    if (s.node.localName === 't' && !s.node.textContent) s.node.remove()
  })
  d.changed = true
}

/** 아래에 새 문단을 넣는다 (지금 문단의 모양을 이어 받음) */
export function insertParagraphAfter(d: WordDoc, p: Element, text = ''): Element {
  const np = wEl(d, 'p')
  const pPr = child(p, 'pPr')
  if (pPr) {
    const copy = pPr.cloneNode(true) as Element
    for (const c of Array.from(copy.children)) if (['sectPr', 'pPrChange'].includes(c.localName)) c.remove()
    np.appendChild(copy)
  }
  const firstRun = p.getElementsByTagNameNS(W, 'r')[0]
  const r = wEl(d, 'r')
  const rPr = firstRun ? child(firstRun, 'rPr') : markRunProps(p)
  if (rPr) r.appendChild(rPr.cloneNode(true))
  r.append(...textNodes(d, text))
  np.appendChild(r)
  p.after(np)
  d.changed = true
  return np
}

/** 문단을 지운다. 구역 나누기가 든 문단이나 표 칸의 마지막 문단은 지우지 않고 글만 비운다. */
export function deleteParagraph(d: WordDoc, p: Element) {
  const keepsSection = !!child(child(p, 'pPr') ?? p, 'sectPr')
  const parent = p.parentElement
  const lastInCell = parent?.localName === 'tc' && children(parent, 'p').length + children(parent, 'tbl').length <= 1
  if (keepsSection || lastInCell) setParagraphText(d, p, '')
  else p.remove()
  d.changed = true
}

export function setAlign(d: WordDoc, p: Element, align: Align) {
  const pPr = ensurePPr(d, p)
  if (align === 'left') child(pPr, 'jc')?.remove()
  else {
    const jc = wEl(d, 'jc')
    setW(jc, 'val', align)
    putOrdered(pPr, jc, PPR_ORDER)
  }
  d.changed = true
}

/** 문단 전체 굵게·기울임·밑줄 켜기/끄기 (모두 켜져 있으면 끈다) */
export function toggleFormat(d: WordDoc, p: Element, fmt: 'b' | 'i' | 'u') {
  const runs = new Set<Element>()
  walkPara(p, (s) => runs.add(s.run))
  if (!runs.size) return
  const allOn = [...runs].every((r) => isOn(child(child(r, 'rPr') ?? r, fmt)))
  for (const r of runs) {
    const rPr = ensureRPr(d, r)
    if (allOn) {
      child(rPr, fmt)?.remove()
      if (fmt !== 'u') child(rPr, `${fmt}Cs`)?.remove()
    } else {
      const el = wEl(d, fmt)
      if (fmt === 'u') setW(el, 'val', 'single')
      putOrdered(rPr, el, RPR_ORDER)
    }
  }
  d.changed = true
}

const LEVEL_STYLE: Record<Exclude<Level, 'normal'>, { id: string; name: string; size: number; outline?: number }> = {
  title: { id: 'Title', name: 'Title', size: 52 },
  h1: { id: 'Heading1', name: 'heading 1', size: 36, outline: 0 },
  h2: { id: 'Heading2', name: 'heading 2', size: 30, outline: 1 },
  h3: { id: 'Heading3', name: 'heading 3', size: 26, outline: 2 },
}

/** 문서에 그 제목 스타일이 없으면(워드는 쓴 스타일만 저장함) 만들어 넣는다 */
function styleIdFor(d: WordDoc, level: Exclude<Level, 'normal'>): string | null {
  for (const [id, lv] of d.styleLevels) if (lv === level) return id
  const styles = d.styles
  if (!styles) return null
  const def = LEVEL_STYLE[level]
  const taken = new Set(Array.from(styles.getElementsByTagNameNS(W, 'style')).map((s) => attr(s, 'styleId')))
  let id = def.id
  while (taken.has(id)) id += 'X'
  const frag = new DOMParser().parseFromString(`<w:styles xmlns:w="${W}">${headingStyle(id, def.name, def.size, def.outline)}</w:styles>`, 'application/xml')
  const style = styles.importNode(frag.documentElement.firstElementChild!, true) as Element
  // 기준 스타일(Normal)이 없는 문서면 basedOn·next 를 뺀다
  if (!taken.has('Normal')) {
    child(style, 'basedOn')?.remove()
    child(style, 'next')?.remove()
  }
  styles.documentElement.appendChild(style)
  d.styleLevels.set(id, level)
  d.stylesChanged = true
  return id
}

export function canChangeLevel(d: WordDoc) {
  return !!d.styles
}

export function setLevel(d: WordDoc, p: Element, level: Level) {
  const pPr = ensurePPr(d, p)
  if (level === 'normal') child(pPr, 'pStyle')?.remove()
  else {
    const id = styleIdFor(d, level)
    if (!id) return
    const ps = wEl(d, 'pStyle')
    setW(ps, 'val', id)
    putOrdered(pPr, ps, PPR_ORDER)
  }
  d.changed = true
}

function allParas(blocks: Block[], out: Para[] = []): Para[] {
  for (const b of blocks) {
    if (b.kind === 'p') out.push(b)
    else for (const row of b.rows) for (const cell of row.cells) allParas(cell.blocks, out)
  }
  return out
}

/** 찾아 바꾸기: 바꾼 개수를 돌려준다 (글자 덩어리가 나뉘어 있어도 찾는다) */
export function replaceAll(d: WordDoc, find: string, to: string): number {
  if (!find) return 0
  let count = 0
  for (const p of allParas(d.blocks)) {
    if (!p.text.includes(find)) continue
    // 한 군데씩 뒤에서부터 바꿔야 사이에 있는 글자 모양(굵게 등)이 남는다
    let text = p.text
    let i = text.lastIndexOf(find)
    while (i >= 0) {
      text = text.slice(0, i) + to + text.slice(i + find.length)
      setParagraphText(d, p.el, text)
      count++
      i = i === 0 ? -1 : text.lastIndexOf(find, i - 1)
    }
  }
  return count
}

export function countMatches(d: WordDoc, find: string): number {
  if (!find) return 0
  return allParas(d.blocks).reduce((n, p) => n + p.text.split(find).length - 1, 0)
}

// ── 저장 ────────────────────────────────────────────
export async function saveDocx(d: WordDoc): Promise<Blob> {
  if (d.changed) writeXml(d.zip, d.docPath, d.doc)
  if (d.stylesChanged && d.styles && d.stylesPath) writeXml(d.zip, d.stylesPath, d.styles)
  d.changed = false
  d.stylesChanged = false
  return d.zip.generateAsync({ type: 'blob', mimeType: DOCX_MIME, compression: 'DEFLATE' })
}

/** 본문 글만 텍스트 파일로 */
export function docxToText(d: WordDoc): Blob {
  const lines: string[] = []
  const walk = (blocks: Block[]) => {
    for (const b of blocks) {
      if (b.kind === 'p') lines.push(b.text)
      else for (const row of b.rows) lines.push(row.cells.map((c) => allParas(c.blocks).map((p) => p.text).join(' ')).join('\t'))
    }
  }
  walk(d.blocks)
  return new Blob(['﻿' + lines.join('\r\n')], { type: 'text/plain;charset=utf-8' })
}

export function docxFileName(d: WordDoc) {
  return `${baseName(d.fileName)}.docx`
}
