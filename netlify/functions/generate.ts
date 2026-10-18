import type { GenerateRequest, GeneratedPost } from '../../shared/generate'
import { getSnsProfile } from '../../shared/sns'
import { AuthError, requireAdmin } from '../lib/auth'
import { buildMessages, finalizePost, POST_SCHEMA } from '../lib/prompt'

// SNS 게시물 1개(1개 언어)를 생성한다. 주소: /.netlify/functions/generate
// (/.netlify/ 주소는 netlify.toml의 페이지 리다이렉트 규칙에 영향을 받지 않는다) 여러 언어는 화면에서 언어별로 나눠 동시에 호출한다.
// Netlify 동기 함수는 30초 제한이 있어 OpenAI 호출은 25초에서 끊고 안내한다.
const OPENAI_TIMEOUT_MS = 25_000

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8' } })

export default async (req: Request) => {
  if (req.method !== 'POST') return json(405, { error: '허용되지 않은 요청입니다.' })

  try {
    await requireAdmin(req)
  } catch (e) {
    return json(401, { error: e instanceof AuthError ? e.message : '로그인을 확인하지 못했습니다.' })
  }

  let input: GenerateRequest
  try {
    input = await req.json()
  } catch {
    return json(400, { error: '요청 형식이 올바르지 않습니다.' })
  }
  const profile = getSnsProfile(input.snsType)
  if (!profile) return json(400, { error: 'SNS 종류를 선택해 주세요.' })
  if (!input.language) return json(400, { error: '언어를 선택해 주세요.' })
  if (!input.content?.trim() && !input.topic) return json(400, { error: '콘텐츠 내용이나 계획을 입력해 주세요.' })
  if ((input.content?.length ?? 0) > 1000 || (input.instructions?.length ?? 0) > 1000) {
    return json(400, { error: '입력은 1000자까지 가능합니다.' })
  }

  const apiKey = process.env.OPENAI_API_KEY
  const model = process.env.OPENAI_MODEL
  if (!apiKey || !model) {
    return json(500, { error: '서버에 OpenAI 설정(OPENAI_API_KEY, OPENAI_MODEL)이 없습니다. 운영 안내를 확인해 주세요.' })
  }

  const body: Record<string, unknown> = {
    model,
    messages: buildMessages(input, profile),
    response_format: { type: 'json_schema', json_schema: { name: 'sns_post', strict: true, schema: POST_SCHEMA } },
  }
  // 추론형 모델은 생각하는 정도를 낮춰 응답 시간을 줄일 수 있다(선택 설정).
  if (process.env.OPENAI_REASONING_EFFORT) body.reasoning_effort = process.env.OPENAI_REASONING_EFFORT

  let res: Response
  try {
    res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(OPENAI_TIMEOUT_MS),
    })
  } catch (e) {
    const timeout = e instanceof Error && e.name === 'TimeoutError'
    return json(504, {
      error: timeout
        ? '생성 시간이 너무 오래 걸렸습니다. 내용을 줄이거나 다시 시도해 주세요.'
        : 'AI 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.',
    })
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    console.error('OpenAI 오류', res.status, detail.slice(0, 500))
    // OpenAI가 알려준 원인(영문)을 함께 보여준다 — 관리자만 보는 화면이라 진단에 도움이 된다.
    let reason = ''
    try {
      reason = String(JSON.parse(detail)?.error?.message ?? '').slice(0, 300)
    } catch {
      reason = detail.slice(0, 200)
    }
    const message =
      res.status === 401
        ? 'OpenAI API 키가 올바르지 않습니다.'
        : res.status === 429
          ? 'OpenAI 사용 한도에 걸렸습니다. 잠시 후 다시 시도하거나 결제 한도를 확인해 주세요.'
          : res.status === 404 || res.status === 400
            ? `AI 요청이 거절되었습니다. 모델 이름(${model})과 설정을 확인해 주세요.`
            : 'AI 생성 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.'
    return json(502, { error: reason ? `${message} (OpenAI ${res.status}: ${reason})` : `${message} (OpenAI ${res.status})` })
  }

  try {
    const data = await res.json()
    const choice = data.choices?.[0]
    if (choice?.message?.refusal) return json(422, { error: 'AI가 이 요청의 작성을 거절했습니다. 내용을 바꿔 다시 시도해 주세요.' })
    const raw = JSON.parse(choice?.message?.content ?? '') as GeneratedPost
    return json(200, { post: finalizePost(raw, input, profile) })
  } catch {
    return json(502, { error: 'AI 응답을 읽지 못했습니다. 다시 시도해 주세요.' })
  }
}
