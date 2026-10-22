// AI 자동 릴스 대본: 화면·서버 함수가 함께 쓰는 형식과 안내문(프롬프트)
// 서버(OpenAI)와 로컬 AI가 같은 안내문을 쓰도록 여기 한 곳에 둔다.
import { LANGUAGE_NAMES } from './generate'

export type ReelScriptEffect = 'none' | 'sparkle' | 'fireworks' | 'highlight' | 'priceTag' | 'cta'

/** AI가 만든 장면 하나 */
export type ReelScriptScene = {
  /** 화면 자막 (줄바꿈은 \n, 최대 2줄) */
  text: string
  /** 대략 길이(초) — 실제 길이는 전체 길이에 맞춰 비율로 나눈다 */
  seconds: number
  effect: ReelScriptEffect
  /** 가격표 문구 — 입력에 나온 가격만 */
  priceText: string
  /** CTA 버튼 문구 */
  ctaText: string
}

export type ReelScriptResult = { title: string; scenes: ReelScriptScene[] }

export type ReelScriptBrand = { name: string; siteUrl: string; description: string; rules: string }

export type ReelScriptRequest = {
  /** topic: 주제로 새로 쓰기 / rewrite: 붙여넣은 글을 릴스 대본으로 / scene: 장면 하나만 다시 쓰기 */
  mode: 'topic' | 'rewrite' | 'scene'
  topic: string
  /** rewrite: 붙여넣은 원문 */
  source?: string
  duration: number
  brand?: ReelScriptBrand | null
  /** scene: 지금 장면 자막 전체 (흐름 참고) */
  scenes?: string[]
  /** scene: 다시 쓸 장면 번호 (0부터) */
  index?: number
  /** scene: 추가 요청 (예: 더 짧게, 질문형으로) */
  hint?: string
  /** 자막 언어 (기본 ko) */
  language?: string
}

export const REEL_TEXT_MAX = 28
export const REEL_SOURCE_MAX = 3000
const EFFECTS: ReelScriptEffect[] = ['none', 'sparkle', 'fireworks', 'highlight', 'priceTag', 'cta']

/** 영상 길이별 장면 수 */
export function sceneCountFor(duration: number) {
  if (duration <= 10) return 4
  if (duration <= 15) return 5
  if (duration <= 30) return 8
  return 12
}

export const REEL_SCRIPT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'scenes'],
  properties: {
    title: { type: 'string' },
    scenes: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['text', 'seconds', 'effect', 'priceText', 'ctaText'],
        properties: {
          text: { type: 'string' },
          seconds: { type: 'number' },
          effect: { type: 'string', enum: EFFECTS },
          priceText: { type: 'string' },
          ctaText: { type: 'string' },
        },
      },
    },
  },
}

/** 입력값 정리 (길이 제한) — 서버와 로컬 AI 모두 이 값으로 안내문을 만든다 */
export function sanitizeReelRequest(raw: Partial<ReelScriptRequest>): ReelScriptRequest {
  const str = (v: unknown, n: number) => String(v ?? '').trim().slice(0, n)
  const mode = raw.mode === 'rewrite' || raw.mode === 'scene' ? raw.mode : 'topic'
  const duration = [10, 15, 30, 60].includes(Number(raw.duration)) ? Number(raw.duration) : 15
  const b = raw.brand
  return {
    mode,
    topic: str(raw.topic, 200),
    source: str(raw.source, REEL_SOURCE_MAX),
    duration,
    brand: b ? { name: str(b.name, 40), siteUrl: str(b.siteUrl, 100), description: str(b.description, 300), rules: str(b.rules, 500) } : null,
    scenes: Array.isArray(raw.scenes) ? raw.scenes.slice(0, 20).map((s) => str(s, 80)) : [],
    index: Math.max(0, Math.min(19, Math.round(Number(raw.index) || 0))),
    hint: str(raw.hint, 100),
    language: raw.language && raw.language in LANGUAGE_NAMES ? raw.language : 'ko',
  }
}

export function buildReelMessages(r: ReelScriptRequest) {
  const count = sceneCountFor(r.duration)
  const system = [
    '너는 인스타그램 릴스·숏폼 세로 영상의 대본 작가다. 사진·영상 위에 자막이 장면마다 바뀌며 나온다.',
    `영상 길이는 ${r.duration}초. 첫 장면(1~2초)은 스크롤을 멈추게 하는 질문이나 강한 한마디로 시작한다.`,
    '가운데 장면은 핵심 내용, 마지막 장면은 행동 유도(저장·방문·주문 등)로 끝낸다.',
    `text(자막): 장면당 공백 포함 ${REEL_TEXT_MAX}자 이하, 한 줄 또는 \\n으로 나눈 두 줄. 말하듯 짧게. 장면끼리 같은 말을 반복하지 않는다.`,
    'seconds: 그 장면을 보여 줄 대략의 초(1~6). 모두 더하면 영상 길이와 비슷하게.',
    'effect: 장면에 어울리는 효과 하나. none(없음) sparkle(반짝임) fireworks(불꽃) highlight(강조 박스) priceTag(가격표) cta(행동 버튼).',
    'priceTag는 입력에 실제로 나온 가격이 있을 때만 쓰고 priceText에 그 가격을 그대로 적는다. 가격이 없으면 priceText는 빈 문자열.',
    'cta는 마지막 장면에만 쓰고 ctaText는 12자 이하(예: 지금 주문하기). 그 외 장면의 ctaText는 빈 문자열.',
    'title: 프로젝트 제목, 20자 이하.',
    `이모지, 해시태그, 확인되지 않은 효능·수치·가격·사실, 과장 광고 표현을 쓰지 않는다. 자막과 제목은 ${LANGUAGE_NAMES[r.language ?? 'ko'] ?? '한국어'}로 쓴다(원문이 다른 언어여도).`,
  ]
  const brand = r.brand?.name
    ? [
        `브랜드: ${r.brand.name}`,
        r.brand.siteUrl ? `사이트: ${r.brand.siteUrl} (마지막 장면 자막이나 CTA에 자연스럽게 넣어도 됨)` : '',
        r.brand.description ? `브랜드 설명: ${r.brand.description}` : '',
        r.brand.rules ? `항상 지킬 규칙: ${r.brand.rules}` : '',
      ].filter(Boolean)
    : []

  let task: string[]
  if (r.mode === 'scene') {
    const list = (r.scenes ?? []).map((s, i) => `${i + 1}. ${s.replace(/\n/g, ' / ')}`).join('\n')
    task = [
      `아래는 지금 릴스의 장면 자막이다. ${r.index! + 1}번 장면 하나만 새로 써 줘. 앞뒤 흐름에 맞고, 다른 장면과 겹치지 않게.`,
      list,
      r.hint ? `요청: ${r.hint}` : '',
      'scenes에는 새로 쓴 장면 1개만 넣는다.',
    ]
  } else if (r.mode === 'rewrite') {
    task = [
      `아래 글을 릴스 대본으로 다시 써 줘. 글에 있는 사실만 쓰고, 장면은 정확히 ${count}개.`,
      '---',
      r.source ?? '',
      '---',
    ]
  } else {
    task = [`장면은 정확히 ${count}개로 써 줘.`]
  }

  const user = [r.topic ? `주제: ${r.topic}` : '', ...brand, ...task].filter(Boolean).join('\n')
  return [
    { role: 'system', content: system.join('\n') },
    { role: 'user', content: user },
  ]
}

const clean = (s: unknown) =>
  String(s ?? '')
    .replace(/[\p{Extended_Pictographic}️]/gu, '')
    .replace(/#[^\s#]+/g, '')
    .replace(/[ \t]+/g, ' ')
    .trim()

/** 생성 결과 정리: 이모지·해시태그 제거, 글자 수·줄 수 제한, 입력에 없는 가격 제거, 장면 수 맞추기 */
export function finalizeReelScript(raw: unknown, r: ReelScriptRequest): ReelScriptResult {
  const obj = (raw ?? {}) as Partial<ReelScriptResult>
  const list = Array.isArray(obj.scenes) ? obj.scenes : []
  const max = r.mode === 'scene' ? 1 : sceneCountFor(r.duration)
  // 가격은 입력(주제·원문·브랜드 설명)에 나온 숫자만 허용
  const inputText = [r.topic, r.source, r.brand?.description, r.brand?.rules].join(' ').replace(/[,\s]/g, '')
  const scenes = list
    .slice(0, max)
    .map((s, i, arr): ReelScriptScene => {
      const lines = clean(s?.text)
        .split(/\n|\\n/)
        .map((l) => l.trim())
        .filter(Boolean)
        .slice(0, 2)
      let text = lines.join('\n')
      if (text.replace(/\n/g, '').length > REEL_TEXT_MAX + 10) text = text.replace(/\n/g, ' ').slice(0, REEL_TEXT_MAX + 10)
      let effect: ReelScriptEffect = EFFECTS.includes(s?.effect as ReelScriptEffect) ? (s!.effect as ReelScriptEffect) : 'none'
      let priceText = clean(s?.priceText).slice(0, 14)
      const digits = priceText.replace(/[^0-9]/g, '')
      if (!digits || !inputText.includes(digits)) priceText = ''
      if (effect === 'priceTag' && !priceText) effect = 'none'
      let ctaText = clean(s?.ctaText).slice(0, 14)
      const last = r.mode === 'scene' ? r.index === (r.scenes?.length ?? 1) - 1 : i === arr.length - 1
      if (effect === 'cta' && !last) effect = 'none'
      if (effect === 'cta' && !ctaText) ctaText = '자세히 보기'
      if (effect !== 'cta') ctaText = ''
      const seconds = Math.min(8, Math.max(1, Number(s?.seconds) || 2))
      return { text, seconds, effect, priceText, ctaText }
    })
    .filter((s) => s.text)
  return { title: clean(obj.title).slice(0, 24), scenes }
}

/** 로컬 AI 등이 JSON 앞뒤에 설명을 붙여도 읽을 수 있게 첫 { … 마지막 } 을 꺼낸다 */
export function parseLooseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    const a = text.indexOf('{')
    const b = text.lastIndexOf('}')
    if (a >= 0 && b > a) return JSON.parse(text.slice(a, b + 1))
    throw new Error('AI 응답을 읽지 못했습니다.')
  }
}
