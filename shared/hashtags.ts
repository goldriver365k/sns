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
 * 복사할 최종 글을 만든다.
 * 본문 + (생성된 해시태그) + (브랜드 고정 해시태그)를 합치되, 본문에 이미 있는 해시태그는 다시 붙이지 않는다.
 * 줄바꿈은 그대로 유지한다.
 */
export function composeCopyText(body: string, generated: string[] = [], fixed: string[] = []): string {
  const text = body.replace(/\s+$/, '')
  const existing = new Set(hashtagsIn(text).map((t) => t.toLowerCase()))
  const extra = dedupe([...generated, ...fixed]).filter((t) => !existing.has(t.toLowerCase()))
  return extra.length ? `${text}\n\n${extra.join(' ')}` : text
}
