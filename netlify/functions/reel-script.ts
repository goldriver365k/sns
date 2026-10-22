import { buildReelMessages, finalizeReelScript, REEL_SCRIPT_SCHEMA, sanitizeReelRequest, type ReelScriptRequest } from '../../shared/reelScript'
import { AuthError, requireAdmin } from '../lib/auth'

// AI 자동 릴스 대본·장면 생성. 주소: /.netlify/functions/reel-script
// 모드: topic(주제로 새로) / rewrite(붙여넣은 글 다시 쓰기) / scene(장면 하나 다시 쓰기)
// Netlify 동기 함수 30초 제한 때문에 OpenAI 호출은 25초에서 끊는다.
const TIMEOUT_MS = 25_000

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8' } })

export default async (req: Request) => {
  if (req.method !== 'POST') return json(405, { error: '허용되지 않은 요청입니다.' })
  try {
    await requireAdmin(req)
  } catch (e) {
    return json(401, { error: e instanceof AuthError ? e.message : '로그인을 확인하지 못했습니다.' })
  }

  let input: ReelScriptRequest
  try {
    input = sanitizeReelRequest(await req.json())
  } catch {
    return json(400, { error: '요청 형식이 올바르지 않습니다.' })
  }
  if (input.mode === 'topic' && !input.topic) return json(400, { error: '주제를 입력해 주세요.' })
  if (input.mode === 'rewrite' && !input.source) return json(400, { error: '다시 쓸 글을 대본 칸에 붙여넣어 주세요.' })
  if (input.mode === 'scene' && !input.scenes?.length) return json(400, { error: '다시 쓸 장면이 없습니다.' })

  const apiKey = process.env.OPENAI_API_KEY
  const model = process.env.OPENAI_MODEL
  if (!apiKey || !model) {
    return json(500, { error: '서버에 OpenAI 설정(OPENAI_API_KEY, OPENAI_MODEL)이 없습니다. 릴스 설정 탭에서 로컬 AI를 쓰거나 대본을 직접 입력해 주세요.' })
  }

  const body: Record<string, unknown> = {
    model,
    messages: buildReelMessages(input),
    response_format: { type: 'json_schema', json_schema: { name: 'reel_script', strict: true, schema: REEL_SCRIPT_SCHEMA } },
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
    return json(504, { error: timeout ? '대본 생성이 너무 오래 걸렸습니다. 다시 시도해 주세요.' : 'AI 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.' })
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    console.error('OpenAI 릴스 대본 오류', res.status, detail.slice(0, 500))
    let reason = ''
    try {
      reason = JSON.parse(detail)?.error?.message ?? ''
    } catch {
      // 원문이 JSON이 아니면 상태 코드만 안내
    }
    return json(502, { error: `대본을 만들지 못했습니다. (OpenAI ${res.status}${reason ? `: ${reason.slice(0, 160)}` : ''})` })
  }

  const data = await res.json().catch(() => null)
  let parsed: unknown
  try {
    parsed = JSON.parse(data?.choices?.[0]?.message?.content)
  } catch {
    return json(502, { error: 'AI 응답을 읽지 못했습니다. 다시 시도해 주세요.' })
  }
  const result = finalizeReelScript(parsed, input)
  if (!result.scenes.length) return json(502, { error: 'AI가 장면을 만들지 못했습니다. 주제를 조금 더 구체적으로 적어 주세요.' })
  return json(200, result)
}
