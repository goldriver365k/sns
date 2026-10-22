import { KEYWORD_LIMITS, KEYWORD_SCENES_MAX, KEYWORD_SCENES_MIN, type KeywordCopyRequest, type KeywordScene } from '../../shared/keyword'
import { AuthError, requireAdmin } from '../lib/auth'

// 핵심어 타이포 장면 문구를 주제 하나로 만든다. 주소: /.netlify/functions/keyword-copy
// Netlify 동기 함수 30초 제한 때문에 OpenAI 호출은 25초에서 끊는다.
const TIMEOUT_MS = 25_000

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8' } })

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['scenes'],
  properties: {
    scenes: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['kw', 'sent'],
        properties: { kw: { type: 'string' }, sent: { type: 'string' } },
      },
    },
  },
}

function buildMessages(input: KeywordCopyRequest) {
  const system = [
    '너는 SNS 세로 숏폼 "핵심어 타이포 모션"의 문구 작가다. 영상에는 글자만 나온다.',
    '장면마다 핵심어가 화면 가득 굵게 먼저 나오고, 그 아래 문장이 이어진다. 문장은 AI 음성으로 그대로 읽힌다.',
    `장면은 정확히 ${input.count}개. 첫 장면은 주제를 꺼내고, 가운데 장면은 이유·방법, 마지막 장면은 기억에 남는 한마디로 마무리한다.`,
    `kw(핵심어): 한 단어, ${KEYWORD_LIMITS.kw}자 이하, 한글 명사나 짧은 말. 장면끼리 겹치지 않게.`,
    `sent(문장): 공백 포함 ${KEYWORD_LIMITS.sent}자 이하, 해요체, 마침표나 물음표로 끝낸다. 문장 속에서 핵심어(또는 가장 중요한 말) 하나만 *단어*처럼 별표로 감싼다.`,
    '이모지, 해시태그, 영어, 과장 광고, 확인되지 않은 효능·가격·사실을 쓰지 않는다.',
    '가게 이름은 영상 하단에 따로 나오므로 문장에 넣지 않는다.',
  ].join('\n')
  const user = [
    `주제: ${input.topic}`,
    input.storeName ? `영상 하단에 나올 가게: ${input.storeName} (분위기 참고만)` : '',
    input.previous?.length ? `아래 이전 문구와 겹치지 않게 새로 써 줘.\n${input.previous.map((s) => `${s.kw} / ${s.sent}`).join('\n')}` : '',
  ]
    .filter(Boolean)
    .join('\n')
  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ]
}

/** 생성 후 정리: 이모지·해시태그 제거, 별표 짝 맞추기, 지나치게 긴 줄 자르기, 장면 수 맞추기 */
export function finalizeScenes(raw: unknown, count: number): KeywordScene[] {
  const clean = (s: unknown) =>
    String(s ?? '')
      .replace(/[\p{Extended_Pictographic}️]/gu, '')
      .replace(/#\S+/g, '')
      .replace(/\s+/g, ' ')
      .trim()
  const list = Array.isArray(raw) ? raw : []
  return list
    .slice(0, count)
    .map((s) => {
      const kw = clean((s as KeywordScene)?.kw).replace(/\*/g, '').slice(0, KEYWORD_LIMITS.kw + 3)
      let sent = clean((s as KeywordScene)?.sent)
      if ((sent.match(/\*/g) ?? []).length % 2 === 1) sent = sent.replace(/\*/g, '')
      if (sent.replace(/\*/g, '').length > KEYWORD_LIMITS.sent + 12) sent = sent.replace(/\*/g, '').slice(0, KEYWORD_LIMITS.sent + 12)
      return { kw, sent }
    })
    .filter((s) => s.kw || s.sent)
}

export default async (req: Request) => {
  if (req.method !== 'POST') return json(405, { error: '허용되지 않은 요청입니다.' })
  try {
    await requireAdmin(req)
  } catch (e) {
    return json(401, { error: e instanceof AuthError ? e.message : '로그인을 확인하지 못했습니다.' })
  }

  let input: KeywordCopyRequest
  try {
    input = await req.json()
  } catch {
    return json(400, { error: '요청 형식이 올바르지 않습니다.' })
  }
  const topic = String(input.topic ?? '').trim().slice(0, 200)
  if (!topic) return json(400, { error: '주제를 입력해 주세요.' })
  const count = Math.min(KEYWORD_SCENES_MAX, Math.max(KEYWORD_SCENES_MIN, Math.round(Number(input.count) || 3)))
  input = {
    topic,
    count,
    storeName: String(input.storeName ?? '').slice(0, 40),
    previous: Array.isArray(input.previous) ? finalizeScenes(input.previous, KEYWORD_SCENES_MAX) : undefined,
  }

  const apiKey = process.env.OPENAI_API_KEY
  const model = process.env.OPENAI_MODEL
  if (!apiKey || !model) {
    return json(500, { error: '서버에 OpenAI 설정(OPENAI_API_KEY, OPENAI_MODEL)이 없습니다. 운영 안내를 확인해 주세요.' })
  }

  const body: Record<string, unknown> = {
    model,
    messages: buildMessages(input),
    response_format: { type: 'json_schema', json_schema: { name: 'keyword_scenes', strict: true, schema: SCHEMA } },
  }
  if (process.env.OPENAI_REASONING_EFFORT) body.reasoning_effort = process.env.OPENAI_REASONING_EFFORT

  let res: Response
  try {
    res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (e) {
    const timeout = e instanceof Error && e.name === 'TimeoutError'
    return json(504, { error: timeout ? '문구 생성이 너무 오래 걸렸습니다. 다시 시도해 주세요.' : 'AI 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.' })
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    console.error('OpenAI 핵심어 문구 오류', res.status, detail.slice(0, 500))
    let reason = ''
    try {
      reason = JSON.parse(detail)?.error?.message ?? ''
    } catch {
      // 원문이 JSON이 아니면 상태 코드만 안내
    }
    return json(502, { error: `문구를 만들지 못했습니다. (OpenAI ${res.status}${reason ? `: ${reason.slice(0, 160)}` : ''})` })
  }

  const data = await res.json().catch(() => null)
  let parsed: { scenes?: unknown }
  try {
    parsed = JSON.parse(data?.choices?.[0]?.message?.content)
  } catch {
    return json(502, { error: 'AI 응답을 읽지 못했습니다. 다시 시도해 주세요.' })
  }
  const scenes = finalizeScenes(parsed.scenes, count)
  if (!scenes.length) return json(502, { error: 'AI가 장면을 만들지 못했습니다. 주제를 조금 더 구체적으로 적어 주세요.' })
  return json(200, { scenes })
}
