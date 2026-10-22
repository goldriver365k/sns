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
