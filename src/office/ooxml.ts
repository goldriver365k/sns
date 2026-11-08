// 엑셀(.xlsx)·워드(.docx) 공통: 둘 다 ZIP 안에 XML 파일이 들어 있는 형식(OOXML)이다.
// 파일은 서버로 보내지 않고 브라우저 안에서만 열고 고친다.
import type JSZip from 'jszip'

export const REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const PKG_REL_NS = 'http://schemas.openxmlformats.org/package/2006/relationships'
const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'

/** 한 번에 열 수 있는 파일 크기 (브라우저 메모리 보호) */
export const MAX_FILE_BYTES = 30 * 1024 * 1024

export async function loadZip(data: Blob | ArrayBuffer): Promise<JSZip> {
  const { default: JSZip } = await import('jszip')
  try {
    return await JSZip.loadAsync(data)
  } catch {
    throw new Error('파일을 열지 못했습니다. 암호가 걸린 파일이거나 예전 형식(.xls·.doc)일 수 있습니다. 엑셀·워드에서 .xlsx·.docx로 다시 저장해 주세요.')
  }
}

export function parseXml(text: string): Document {
  const doc = new DOMParser().parseFromString(text, 'application/xml')
  if (doc.getElementsByTagName('parsererror').length) throw new Error('문서 안의 XML이 손상되어 열 수 없습니다.')
  return doc
}

export async function readXml(zip: JSZip, path: string): Promise<Document | null> {
  const f = zip.file(path)
  return f ? parseXml(await f.async('string')) : null
}

export function writeXml(zip: JSZip, path: string, doc: Document) {
  const text = new XMLSerializer().serializeToString(doc).replace(/^<\?xml[^>]*\?>\s*/, '')
  zip.file(path, XML_HEAD + text)
}

/** 자식 요소 중 이름(접두사 뺀 이름)이 같은 것 */
export function children(el: Element, local: string): Element[] {
  const out: Element[] = []
  for (const c of Array.from(el.children)) if (c.localName === local) out.push(c)
  return out
}
export function child(el: Element, local: string): Element | null {
  for (const c of Array.from(el.children)) if (c.localName === local) return c
  return null
}
/** 접두사가 달린 속성(r:id, w:val 등)도 이름 끝부분으로 찾는다 */
export function attr(el: Element | null, local: string): string | null {
  if (!el) return null
  if (el.hasAttribute(local)) return el.getAttribute(local)
  for (const a of Array.from(el.attributes)) if (a.localName === local) return a.value
  return null
}

/** 문서와 같은 이름공간·접두사로 새 요소를 만든다 */
export function makeEl(doc: Document, ns: string, local: string, like?: Element | null): Element {
  const prefix = like?.prefix ?? doc.documentElement.lookupPrefix(ns)
  return doc.createElementNS(ns, prefix ? `${prefix}:${local}` : local)
}

/** 'xl/workbook.xml' 기준 상대 경로 'worksheets/sheet1.xml' → 'xl/worksheets/sheet1.xml' */
export function resolvePath(base: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1)
  const parts = base.split('/').slice(0, -1)
  for (const p of target.split('/')) {
    if (p === '..') parts.pop()
    else if (p !== '.' && p) parts.push(p)
  }
  return parts.join('/')
}

export function relsPathOf(part: string) {
  const i = part.lastIndexOf('/')
  return `${part.slice(0, i + 1)}_rels/${part.slice(i + 1)}.rels`
}

export type Rel = { id: string; type: string; target: string; external: boolean }

/** 어떤 부분(part)의 연결 정보(.rels)를 읽는다. target은 ZIP 안 전체 경로로 바꿔 준다. */
export async function readRels(zip: JSZip, part: string): Promise<Rel[]> {
  const doc = await readXml(zip, relsPathOf(part))
  if (!doc) return []
  return Array.from(doc.getElementsByTagNameNS(PKG_REL_NS, 'Relationship')).map((r) => {
    const external = r.getAttribute('TargetMode') === 'External'
    const target = r.getAttribute('Target') ?? ''
    return { id: r.getAttribute('Id') ?? '', type: r.getAttribute('Type') ?? '', external, target: external ? target : resolvePath(part, target) }
  })
}

/** 패키지의 본문 위치 (workbook.xml / document.xml) */
export async function mainPart(zip: JSZip, fallback: string): Promise<string> {
  const rels = await readRels(zip, '')
  const main = rels.find((r) => r.type.endsWith('/officeDocument'))
  return main?.target || fallback
}

/** 부분 파일을 지울 때 .rels와 [Content_Types].xml에서도 함께 뺀다 */
export async function removePart(zip: JSZip, owner: string, path: string) {
  if (!zip.file(path)) return
  zip.remove(path)
  const relsPath = relsPathOf(owner)
  const rels = await readXml(zip, relsPath)
  if (rels) {
    for (const r of Array.from(rels.getElementsByTagNameNS(PKG_REL_NS, 'Relationship'))) {
      if (resolvePath(owner, r.getAttribute('Target') ?? '') === path) r.remove()
    }
    writeXml(zip, relsPath, rels)
  }
  const types = await readXml(zip, '[Content_Types].xml')
  if (types) {
    for (const o of Array.from(types.documentElement.children)) {
      if (o.localName === 'Override' && o.getAttribute('PartName') === `/${path}`) o.remove()
    }
    writeXml(zip, '[Content_Types].xml', types)
  }
}

export function baseName(fileName: string) {
  return fileName.replace(/\.[^.]+$/, '') || '문서'
}
