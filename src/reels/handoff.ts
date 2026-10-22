import { KEYWORD_LIMITS, KEYWORD_SCENES_MAX, KEYWORD_SCENES_MIN, type KeywordScene } from '../../shared/keyword'
import { emptyCopy, TTEOLBOK_LIMITS, type TteolbokCopy } from '../../shared/tteolbok'
import { generateKeywordScenes, generateTteolbokCopy } from '../lib/api'
import type { KwDesignId } from '../keyword/render'
import type { DesignId } from '../tteolbok/render'
import type { TteolbokStore } from '../tteolbok/stores'
import type { ReelProject } from './types'

/**
 * 자동 릴스에서 만든 내용을 털복이 숏폼·핵심어 타이포 형식으로 옮긴다.
 * - AI로 맞춰 옮기기: 기존 서버 함수(tteolbok-copy, keyword-copy)에 주제와 장면 자막을 함께 보내 그 형식에 맞게 새로 쓴다.
 * - 그대로 옮기기: AI 없이 장면 자막을 칸에 나눠 넣는다(글자 수가 넘으면 그 탭에서 글씨가 자동으로 작아짐).
 * 옮긴 내용은 각 탭이 쓰는 이 기기 저장값(localStorage)에 넣고 그 탭을 연다.
 */
const KW_KEY = 'snsroom.keyword'
const TT_KEY = 'snsroom.tteolbok'

const oneLine = (s: string) => s.replace(/\s+/g, ' ').trim()
const texts = (p: ReelProject) => p.scenes.map((s) => oneLine(s.text)).filter(Boolean)

/** AI에 보낼 주제: 주제 + 장면 자막 (200자 제한) */
export function handoffTopic(p: ReelProject) {
  const body = texts(p).join(' / ')
  return (p.topic.trim() ? `${p.topic.trim()} — ${body}` : body).slice(0, 200)
}

/** 장면 수가 많으면 처음·끝을 포함해 고르게 고른다 */
function pick<T>(list: T[], n: number) {
  if (list.length <= n) return list
  return Array.from({ length: n }, (_, i) => list[Math.round((i * (list.length - 1)) / (n - 1))])
}

const PARTICLE = /(에서|으로|까지|부터|하세요|합니다|입니다|해요|이에요|예요|은|는|이|가|을|를|에|로|와|과|도|만|의|요)$/
/** 꾸미는 말·이어지는 말(굽고, 완성한 등)은 핵심어로 고르지 않는다 */
const NOT_NOUN = /(고|게|지|며|면|서|한|던|운|된|하는|있는)$/
const STOP = new Set(['지금', '오늘', '바로', '정말', '이제', '우리', '여기', '모두', '함께', '진짜', '그냥'])

/** 자막에서 핵심어 후보: 한글 낱말에서 조사를 떼고, 꾸미는 말·흔한 말을 빼고 가장 긴 것(같으면 앞의 것) */
function keywordOf(text: string) {
  const words = text
    .split(/\s+/)
    .map((w) => w.replace(/[^가-힣]/g, ''))
    .filter((w) => w.length >= 2)
  const nouns = words.map((w) => w.replace(PARTICLE, '')).filter((w) => w.length >= 2 && !NOT_NOUN.test(w))
  const pool = nouns.filter((w) => !STOP.has(w)).length ? nouns.filter((w) => !STOP.has(w)) : nouns.length ? nouns : words
  const best = pool.reduce((a, b) => (b.length > a.length ? b : a), pool[0] ?? '')
  return best.slice(0, KEYWORD_LIMITS.kw)
}

export function keywordScenesFrom(p: ReelProject): KeywordScene[] {
  const list = pick(texts(p), KEYWORD_SCENES_MAX)
  return list.map((t) => {
    const kw = keywordOf(t)
    const sent = kw && t.includes(kw) ? t.replace(kw, `*${kw}*`) : t
    return { kw, sent }
  })
}

const cut = (s: string, n: number) => (s.length > n + 6 ? s.slice(0, n + 6) : s)

export function tteolbokCopyFrom(p: ReelProject): TteolbokCopy {
  const list = p.scenes.map((s) => s.text.trim()).filter(Boolean)
  const c = emptyCopy()
  if (!list.length) return c
  // 제목: 첫 장면 (두 줄이면 줄대로, 한 줄이면 낱말 반씩)
  const first = list[0].split('\n').map((l) => l.trim()).filter(Boolean)
  if (first.length >= 2) [c.title1, c.title2] = [first[0], first.slice(1).join(' ')]
  else {
    const w = oneLine(list[0]).split(' ')
    const half = Math.ceil(w.length / 2)
    c.title1 = w.slice(0, half).join(' ')
    c.title2 = w.slice(half).join(' ')
  }
  // 포인트: 가격표 문구, 없으면 자막 속 가격(예: 9,900원)
  c.point = p.scenes.find((s) => s.priceText)?.priceText ?? list.join(' ').match(/\d[\d,]*\s?원/)?.[0] ?? ''
  const rest = list.slice(1).map(oneLine)
  if (rest.length >= 3) {
    const mid = pick(rest.slice(0, -1), 2)
    ;[c.l1, c.l2, c.l3] = [mid[0], mid[1] ?? '', rest[rest.length - 1]]
  } else [c.l1, c.l2, c.l3] = [rest[0] ?? '', rest[1] ?? '', rest[2] ?? '']
  for (const k of Object.keys(c) as (keyof TteolbokCopy)[]) c[k] = cut(oneLine(c[k]), TTEOLBOK_LIMITS[k])
  return c
}

/** 브랜드 이름과 같은 상호가 있으면 그 상호를 고른다 */
export function matchStore(stores: TteolbokStore[], brandName: string | undefined) {
  if (!brandName) return null
  const n = brandName.replace(/\s/g, '')
  return stores.find((s) => s.name.replace(/\s/g, '') === n) ?? null
}

function merge(key: string, patch: Record<string, unknown>) {
  let cur: Record<string, unknown> = {}
  try {
    cur = JSON.parse(localStorage.getItem(key) || '{}') ?? {}
  } catch {
    // 처음 쓰는 탭
  }
  localStorage.setItem(key, JSON.stringify({ ...cur, ...patch }))
}

export async function sendToKeyword(p: ReelProject, design: KwDesignId, opts: { ai: boolean; store: TteolbokStore | null }) {
  const topic = handoffTopic(p)
  const count = Math.min(KEYWORD_SCENES_MAX, Math.max(KEYWORD_SCENES_MIN, texts(p).length))
  const scenes = opts.ai ? await generateKeywordScenes({ topic, count, storeName: opts.store?.name }) : keywordScenesFrom(p)
  if (!scenes.length) throw new Error('옮길 자막이 없습니다. 먼저 장면 자막을 써 주세요.')
  merge(KW_KEY, { design, scenes, count: Math.max(KEYWORD_SCENES_MIN, scenes.length), topic: p.topic || topic, copyTopic: p.topic || topic, ...(opts.store ? { storeId: opts.store.id } : {}) })
}

export async function sendToTteolbok(p: ReelProject, design: DesignId, opts: { ai: boolean; store: TteolbokStore | null }) {
  const topic = handoffTopic(p)
  const copy = opts.ai ? await generateTteolbokCopy({ topic, storeName: opts.store?.name }) : tteolbokCopyFrom(p)
  if (!Object.values(copy).some((v) => v.trim())) throw new Error('옮길 자막이 없습니다. 먼저 장면 자막을 써 주세요.')
  merge(TT_KEY, { design, copy, topic: p.topic || topic, copyTopic: p.topic || topic, ...(opts.store ? { storeId: opts.store.id } : {}) })
}
