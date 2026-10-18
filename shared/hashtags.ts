/**
 * 해시태그 도구.
 * 브랜드에 정해 둔 고정 해시태그는 [복사하기]를 누를 때 항상 글 끝에 붙는다.
 */

/** "#화산불백, 불백  #bulbaek" 같은 입력을 ['#화산불백', '#불백', '#bulbaek']로 정리한다. */
export function parseHashtags(input: string): string[] {
  const tags = input
    .split(/[\s,]+/)
    .map((t) => t.replace(/^#+/, '').trim())
    .filter(Boolean)
    .map((t) => `#${t}`)
  return dedupe(tags)
}

/** 대소문자를 무시하고 중복을 없앤다(앞에 나온 것을 남김). */
function dedupe(tags: string[]): string[] {
  const seen = new Set<string>()
  return tags.filter((t) => {
    const key = t.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/** 본문에 이미 들어 있는 해시태그 */
export function hashtagsIn(text: string): string[] {
  return text.match(/#[^\s#]+/g) ?? []
}

/**
 * 글 끝에 붙일 해시태그를 고른다.
 * 고정 해시태그가 가장 먼저, 그다음 생성된 해시태그. 본문에 이미 있는 것은 빼고,
 * SNS별 최대 개수(max)를 넘지 않게 한다(본문 속 해시태그도 개수에 포함).
 */
export function pickHashtags(body: string, generated: string[] = [], fixed: string[] = [], max = Infinity): string[] {
  const inBody = hashtagsIn(body)
  const existing = new Set(inBody.map((t) => t.toLowerCase()))
  const room = Math.max(0, max - inBody.length)
  return dedupe([...fixed, ...generated])
    .filter((t) => !existing.has(t.toLowerCase()))
    .slice(0, room)
}

/**
 * 복사할 최종 글을 만든다: 본문 + 해시태그(고정 우선, 최대 개수 이내). 줄바꿈은 그대로 유지한다.
 */
export function composeCopyText(body: string, generated: string[] = [], fixed: string[] = [], max = Infinity): string {
  const text = body.replace(/\s+$/, '')
  const extra = pickHashtags(text, generated, fixed, max)
  return extra.length ? `${text}\n\n${extra.join(' ')}` : text
}
