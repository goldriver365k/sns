import { bareDomain, ensureSiteLink } from '../../shared/site'
import type { GenerateRequest, GeneratedPost } from '../../shared/generate'
import { LANGUAGE_NAMES } from '../../shared/generate'
import type { SnsProfile } from '../../shared/sns'
import { parseHashtags } from '../../shared/hashtags'

/** OpenAI 구조화 출력 스키마 — 모든 SNS가 같은 형식으로 받고, 쓰지 않는 칸은 비운다. */
export const POST_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['keyword', 'title', 'body', 'hashtags', 'cards'],
  properties: {
    keyword: { type: 'string', description: '이 게시물의 핵심 키워드 1개 (결과 언어로)' },
    title: { type: 'string', description: '유튜브 쇼츠·네이버 블로그 제목. 그 외 SNS는 빈 문자열' },
    body: { type: 'string', description: '본문 또는 캡션. 해시태그는 넣지 않는다' },
    hashtags: { type: 'array', items: { type: 'string' }, description: '#으로 시작하는 해시태그' },
    cards: {
      type: 'array',
      description: '인스타그램 카드 3장. 그 외 SNS는 빈 배열',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'body', 'emphasis'],
        properties: {
          title: { type: 'string' },
          body: { type: 'string' },
          emphasis: { type: 'string', description: '강조 문구(짧게). 없으면 빈 문자열' },
        },
      },
    },
  },
} as const

const SYSTEM = `당신은 한국의 소상공인·브랜드를 위한 SNS 콘텐츠 전문 작가다.
지켜야 할 원칙:
- 요청한 SNS의 형식과 "노출 핵심" 항목을 하나도 빠짐없이 지킨다.
- 확인되지 않은 수치(매출, 수익률, 투자비용, 가맹점 수, 검색 순위 등)나 사실을 만들어 내지 않는다. "검색 1위", "실시간 인기 검색어" 같은 표현은 쓰지 않는다.
- 단순 번역투가 아니라 그 언어 사용자가 자연스럽게 느끼는 문장으로 쓴다.
- 해시태그는 body에 넣지 말고 hashtags 칸에만 넣는다.
- 결과는 지정한 JSON 형식으로만 답한다.`

export function buildMessages(req: GenerateRequest, profile: SnsProfile) {
  const lang = LANGUAGE_NAMES[req.language] ?? req.language
  const [minTags, maxTags] = profile.hashtags
  const fixedCount = req.brand?.hashtags.length ?? 0
  // 고정 해시태그가 먼저 붙으므로, 생성할 개수는 남은 자리만큼
  const genMax = Math.max(0, maxTags - fixedCount)
  const genMin = Math.min(genMax, Math.max(0, minTags - fixedCount))

  const lines: string[] = [
    `## SNS: ${profile.label}`,
    `결과 형태: ${profile.summary}`,
    `구성: ${profile.guide}`,
    `본문 최대 ${profile.maxChars}자.`,
    ...(profile.maxLines ? [`본문(캡션)은 빈 줄 없이 반드시 ${profile.maxLines}줄 이내로 쓴다. 해시태그는 줄 수에 넣지 않는다.`] : []),
    '',
    '## 노출 핵심 (반드시 모두 반영)',
    ...profile.essentials.map((e) => `- ${e}`),
    '',
    `## 언어: ${lang} — 모든 글(제목, 본문, 카드, 해시태그, 키워드)을 ${lang}로 쓴다.`,
    '',
    `## 해시태그: ${genMin}~${genMax}개 생성` +
      (fixedCount ? ` (고정 해시태그 ${req.brand!.hashtags.join(' ')}는 따로 붙으니 겹치지 않게)` : ''),
  ]

  if (profile.kind === 'cards') {
    lines.push('', '## 카드: 정확히 3장. 카드 글씨는 짧게(제목 20자 안팎, 본문 60자 안팎).')
  } else {
    lines.push('', '## cards는 빈 배열로 둔다.')
  }
  if (profile.kind !== 'video' && profile.kind !== 'blog') lines.push('title은 빈 문자열로 둔다.')

  if (req.brand) {
    const b = req.brand
    lines.push('', `## 브랜드: ${b.name}`)
    if (b.description) lines.push(`설명: ${b.description}`)
    if (b.rules) lines.push(`항상 지킬 규칙: ${b.rules}`)
    if (b.siteUrl) {
      lines.push(
        profile.noLinks
          ? `사이트 주소 ${bareDomain(b.siteUrl)}를 본문 끝에 https:// 없이 도메인 글자로 반드시 넣는다.`
          : `사이트 주소를 링크 https://${bareDomain(b.siteUrl)} 형태로 본문에 반드시 넣는다(앞뒤는 띄어 쓴다).`,
      )
    }
  }

  if (req.topic) lines.push('', `## 오늘의 계획 주제: ${req.topic}`)
  lines.push('', '## 작성할 내용', req.content.trim() || '(비어 있음 — 계획 주제에 맞춰 자유롭게 작성)')
  if (req.instructions.trim()) lines.push('', '## 그 외 지시사항', req.instructions.trim())

  if (req.fix) {
    lines.push(
      '',
      '## 수정 요청',
      '아래 초안이 다음 노출 검사 항목을 통과하지 못했다. 이 항목을 고쳐 다시 작성한다. 나머지 좋은 부분은 유지한다.',
      ...req.fix.failed.map((f) => `- ${f}`),
      '',
      '초안:',
      JSON.stringify(req.fix.previous),
    )
  }

  return [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: lines.join('\n') },
  ]
}

export { bareDomain }

/** 생성 결과를 정리하고, 반드시 들어가야 하는 것(사이트 주소 등)을 코드로 한 번 더 보장한다. */
export function finalizePost(raw: GeneratedPost, req: GenerateRequest, profile: SnsProfile): GeneratedPost {
  let body = (raw.body || '').replace(/\r\n/g, '\n').trim()
  let tags = parseHashtags((raw.hashtags || []).join(' '))

  // 본문 끝에 해시태그만 있는 줄이 있으면 해시태그 칸으로 옮긴다.
  const bodyLines = body.split('\n')
  while (bodyLines.length && /^(\s*#[^\s#]+)+\s*$/.test(bodyLines[bodyLines.length - 1])) {
    tags = parseHashtags(`${bodyLines.pop()} ${tags.join(' ')}`)
  }
  body = bodyLines.join('\n').trim()

  const site = req.brand?.siteUrl ? bareDomain(req.brand.siteUrl) : ''
  if (profile.noLinks) body = body.replace(/https?:\/\//gi, '')
  if (profile.maxLines) {
    // 줄 수 제한(인스타그램 캡션 3줄): 빈 줄을 없애고, 주소 줄은 지키면서 넘치는 줄은 덜어낸다
    let lines = body.split('\n').map((l) => l.trim()).filter(Boolean)
    const hasSite = (l: string) => !!site && l.toLowerCase().includes(site.toLowerCase())
    const siteLine = lines.find(hasSite) ?? (site || '')
    if (siteLine) lines = lines.filter((l) => !hasSite(l))
    const room = profile.maxLines - (siteLine ? 1 : 0)
    if (lines.length > room) {
      // 넘치면 첫 줄(훅)과 저장·공유 유도 줄을 먼저 남기고, 원래 순서를 지킨다
      const keep = new Set<number>([0])
      const cta = lines.findIndex((l, i) => i > 0 && /저장|공유|보내|save|share/i.test(l))
      if (cta > 0) keep.add(cta)
      for (let i = 1; keep.size < room && i < lines.length; i++) keep.add(i)
      lines = lines.filter((_, i) => keep.has(i)).slice(0, room)
    }
    if (siteLine) lines.push(siteLine)
    body = lines.join('\n')
  } else if (site && !body.toLowerCase().includes(site.toLowerCase())) {
    body = `${body}\n\n${site}`
  }

  // 링크를 쓸 수 있는 SNS는 사이트 주소를 https:// 링크로 (예: https://bulbaek.com)
  if (site && !profile.noLinks) body = ensureSiteLink(body, site)

  const fixed = new Set((req.brand?.hashtags ?? []).map((t) => t.toLowerCase()))
  tags = tags.filter((t) => !fixed.has(t.toLowerCase()))
  if (profile.hashtags[1] === 0) tags = []

  return {
    keyword: (raw.keyword || '').trim(),
    title: profile.kind === 'video' || profile.kind === 'blog' ? (raw.title || '').trim() : '',
    body,
    hashtags: tags,
    cards: profile.kind === 'cards' ? (raw.cards || []).slice(0, 3) : [],
  }
}
