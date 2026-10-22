import { TTEOLBOK_COPY_KEYS, TTEOLBOK_LIMITS, type TteolbokCopy, type TteolbokCopyRequest } from '../../shared/tteolbok'
import { AuthError, requireAdmin } from '../lib/auth'

// 털복이 숏폼 문구를 주제 하나로 만든다. 주소: /.netlify/functions/tteolbok-copy
// Netlify 동기 함수 30초 제한 때문에 OpenAI 호출은 25초에서 끊는다.
const TIMEOUT_MS = 25_000

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8' } })

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [...TTEOLBOK_COPY_KEYS],
  properties: Object.fromEntries(TTEOLBOK_COPY_KEYS.map((k) => [k, { type: 'string' }])),
}

function buildMessages(input: TteolbokCopyRequest) {
  const L = TTEOLBOK_LIMITS
  const system = [
    '너는 SNS 세로 숏폼 영상의 문구 작가다. 화자는 "털복이"라는 캐릭터다.',
    '털복이: 동그란 안경과 나비넥타이를 한 주황색 털복숭이 곰. 다정하고 포근하며, 친구에게 조언하듯 해요체로 말한다.',
    '영상 구성: 제목 첫째 줄 + 제목 둘째 줄(강조색) + 포인트 박스, 그 아래 털복이 말풍선 3줄(마지막 줄이 핵심 한마디).',
    '모든 문구는 털복이 목소리로 그대로 읽힌다. 소리 내어 읽었을 때 자연스럽게 쓴다.',
    `글자 수(공백 포함) 상한: title1 ${L.title1}자, title2 ${L.title2}자, point ${L.point}자, l1 ${L.l1}자, l2 ${L.l2}자, l3 ${L.l3}자. 반드시 지킨다.`,
    'title1은 쉼표로 끝나는 주제어(예: "친구관계,"), title2는 이어지는 말(예: "더 좋아지는"), point는 짧은 마무리(예: "비결!").',
    'l1에서 핵심 단어 1~2개를 *단어* 형식으로 감싸 강조한다. 다른 줄에는 별표를 쓰지 않는다.',
    'l3는 마침표로 끝나는 따뜻한 핵심 한마디.',
    '이모지, 해시태그, 영어, 숫자 나열, 과장 광고 문구, 확인되지 않은 효능·가격·사실을 쓰지 않는다.',
    '상호(가게 이름)는 영상 하단에 따로 나오므로 문구 안에 넣지 않는다.',
  ].join('\n')
  const user = [
    `주제: ${input.topic}`,
    input.storeName ? `영상 하단에 나올 가게: ${input.storeName} (분위기 참고만)` : '',
    input.previous
      ? `아래 이전 문구와 표현이 겹치지 않게 새로 써 줘.\n${TTEOLBOK_COPY_KEYS.map((k) => `${k}: ${input.previous![k]}`).join('\n')}`
      : '',
  ]
    .filter(Boolean)
    .join('\n')
  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ]
}

/** 생성 후 한 번 더 정리: 공백·이모지 제거, l1 외 별표 제거, 지나치게 긴 줄은 자른다 */
export function finalizeCopy(raw: Partial<TteolbokCopy>): TteolbokCopy {
  const clean = (s: unknown) =>
    String(s ?? '')
      .replace(/[\p{Extended_Pictographic}️]/gu, '')
      .replace(/#\S+/g, '')
      .replace(/\s+/g, ' ')
      .trim()
  const out = {} as TteolbokCopy
  for (const k of TTEOLBOK_COPY_KEYS) {
    let v = clean(raw[k])
    if (k !== 'l1') v = v.replace(/\*/g, '')
    if ((v.match(/\*/g) ?? []).length % 2 === 1) v = v.replace(/\*/g, '')
    const max = TTEOLBOK_LIMITS[k] + 6 // 조금 넘는 건 화면에서 글씨를 줄여 맞춘다
    if (v.replace(/\*/g, '').length > max) v = v.replace(/\*/g, '').slice(0, max)
    out[k] = v
  }
  return out
}

export default async (req: Request) => {
  if (req.method !== 'POST') return json(405, { error: '허용되지 않은 요청입니다.' })
  try {
    await requireAdmin(req)
  } catch (e) {
    return json(401, { error: e instanceof AuthError ? e.message : '로그인을 확인하지 못했습니다.' })
  }

  let input: TteolbokCopyRequest
  try {
    input = await req.json()
  } catch {
    return json(400, { error: '요청 형식이 올바르지 않습니다.' })
  }
  const topic = String(input.topic ?? '').trim().slice(0, 200)
  if (!topic) return json(400, { error: '주제를 입력해 주세요.' })
  input = {
    topic,
    storeName: String(input.storeName ?? '').slice(0, 40),
    previous: input.previous ? finalizeCopy(input.previous) : undefined,
  }

  const apiKey = process.env.OPENAI_API_KEY
  const model = process.env.OPENAI_MODEL
  if (!apiKey || !model) {
    return json(500, { error: '서버에 OpenAI 설정(OPENAI_API_KEY, OPENAI_MODEL)이 없습니다. 운영 안내를 확인해 주세요.' })
  }

  const body: Record<string, unknown> = {
    model,
    messages: buildMessages(input),
    response_format: { type: 'json_schema', json_schema: { name: 'tteolbok_copy', strict: true, schema: SCHEMA } },
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
    console.error('OpenAI 문구 오류', res.status, detail.slice(0, 500))
    let reason = ''
    try {
      reason = JSON.parse(detail)?.error?.message ?? ''
    } catch {
      // 원문이 JSON이 아니면 상태 코드만 안내
    }
    return json(502, { error: `문구를 만들지 못했습니다. (OpenAI ${res.status}${reason ? `: ${reason.slice(0, 160)}` : ''})` })
  }

  const data = await res.json().catch(() => null)
  const text = data?.choices?.[0]?.message?.content
  let parsed: Partial<TteolbokCopy>
  try {
    parsed = JSON.parse(text)
  } catch {
    return json(502, { error: 'AI 응답을 읽지 못했습니다. 다시 시도해 주세요.' })
  }
  return json(200, { copy: finalizeCopy(parsed) })
}
