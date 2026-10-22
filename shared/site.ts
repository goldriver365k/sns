// 브랜드 사이트 주소를 글 속에서 "링크"(https:// 포함)로 맞춘다 — 화면과 서버 공용

export function bareDomain(url: string) {
  return url.trim().replace(/^https?:\/\//i, '').replace(/\/$/, '')
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * 글 속 사이트 주소를 https:// 링크로 바꾸고, 없으면 마지막 줄에 넣는다.
 * 링크 바로 뒤에 글자가 붙어 있으면(예: bulbaek.com에서) 띄어 써서 링크가 끊기지 않게 한다.
 */
export function ensureSiteLink(body: string, siteUrl: string | undefined): string {
  const bare = siteUrl ? bareDomain(siteUrl) : ''
  if (!bare) return body
  const link = `https://${bare}`
  const re = new RegExp(`(?:https?://)?(?:www\\.)?${escape(bare)}`, 'gi')
  if (!re.test(body)) {
    // 끝의 해시태그 줄 앞에 넣는다
    const lines = body.replace(/\s+$/, '').split('\n')
    let i = lines.length
    while (i > 0 && /^\s*(#[^\s#]+\s*)+$|^\s*$/.test(lines[i - 1])) i--
    lines.splice(i, 0, link)
    return lines.join('\n')
  }
  return body.replace(re, link).replace(new RegExp(`${escape(link)}(?=[^\\s/])`, 'g'), `${link} `)
}

const norm = (name: string) => name.replace(/\s/g, '').toLowerCase()

/** 반드시 넣어야 하는 브랜드 사이트 — 브랜드 설정에서 주소가 비어 있어도 이 주소를 쓴다 */
const REQUIRED_SITES: Record<string, string> = {
  화산불백: 'bulbaek.com',
  hellokorean: 'hellokorean.site',
}

/** 브랜드 사이트 주소 (설정값 우선, 비어 있으면 필수 주소) */
export function brandSite(name: string | undefined, siteUrl: string | undefined) {
  return siteUrl?.trim() || REQUIRED_SITES[norm(name ?? '')] || ''
}

/** 브랜드별 번역 언어 (Hello Korean: 영어·중국어·일본어·베트남어·인도네시아어) */
const BRAND_LANGUAGES: Record<string, string[]> = {
  hellokorean: ['en', 'zh', 'ja', 'vi', 'id'],
}

export function brandLanguages(name: string | undefined): string[] {
  return BRAND_LANGUAGES[norm(name ?? '')] ?? []
}

/** 영상 하단 띠에 브랜드 이름 없이 사이트 주소만 넣는 브랜드 (Hello Korean → hellokorean.site) */
const SITE_ONLY_BAND = new Set(['hellokorean'])

export function siteOnlyBand(name: string | undefined) {
  return SITE_ONLY_BAND.has(norm(name ?? ''))
}
