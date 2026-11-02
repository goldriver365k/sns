import { productVideoPrompt, type ProductVideoRequest } from '../../shared/productVideo'
import { AuthError, requireAdmin } from '../lib/auth'

/**
 * 제품 애니메이션: 상품 사진 1장으로 짧은 AI 영상을 만든다. 주소: /.netlify/functions/video
 * Google Gemini Omni Flash(Interactions API)를 쓴다. 영상 하나에 몇 분 걸릴 수 있어 Netlify 30초 제한에 맞게
 * 3단계로 나눈다(화면이 차례로 부름).
 * - POST { action: 'start', ...ProductVideoRequest } → { id }  (background=true로 작업만 시작)
 * - POST { action: 'status', id } → { status, size? }        (in_progress / completed / failed / cancelled)
 * - POST { action: 'part', id, index } → 영상 조각(MP4 바이트)  (응답 크기 제한 때문에 3MB씩 나눠 받음)
 * - POST { action: 'delete', id }                          (받은 뒤 Google에 저장된 작업을 지움)
 * 키·모델은 Netlify 환경변수 GEMINI_API_KEY, GEMINI_VIDEO_MODEL에만 둔다.
 */
const API = 'https://generativelanguage.googleapis.com/v1beta/interactions'
const PART_BYTES = 3 * 1024 * 1024
/** 화면에서 보내는 사진 크기 상한 (base64 글자 수) */
const MAX_IMAGE_CHARS = 4_000_000

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8' } })

type Input = Partial<ProductVideoRequest> & { action?: string; id?: string; index?: number }
type Interaction = {
  id?: string
  status?: string
  steps?: { type?: string; content?: { type?: string; data?: string; mime_type?: string }[] }[]
  error?: { message?: string }
}

/** Google 오류 응답을 사람이 읽을 수 있는 안내로 */
async function googleError(res: Response, what: string) {
  const detail = await res.text().catch(() => '')
  console.error(`Gemini ${what} 오류`, res.status, detail.slice(0, 500))
  let reason = ''
  try {
    reason = String(JSON.parse(detail)?.error?.message ?? '').slice(0, 300)
  } catch {
    reason = detail.slice(0, 200)
  }
  const hint =
    res.status === 400 && /safety|policy|block|person|people|face/i.test(reason)
      ? '안전 정책에 걸렸습니다. 사람 얼굴이 없는 상품 사진으로, 설명을 바꿔 다시 시도해 주세요.'
      : res.status === 403 || res.status === 401
        ? 'Gemini API 키를 확인해 주세요. 영상 모델은 유료 요금제(결제 등록)에서만 쓸 수 있습니다.'
        : res.status === 429
          ? '요청이 많거나 사용 한도에 걸렸습니다. 잠시 후 다시 시도해 주세요.'
          : res.status === 404
            ? '영상 작업을 찾지 못했습니다(만료되었을 수 있음). 다시 만들어 주세요.'
            : `영상 ${what}에 실패했습니다.`
  return json(502, { error: `${hint} (Gemini ${res.status}${reason ? `: ${reason}` : ''})` })
}

/** 완성된 작업에서 영상(base64)을 꺼낸다 */
function videoData(it: Interaction) {
  for (const step of it.steps ?? []) {
    if (step.type !== 'model_output') continue
    for (const c of step.content ?? []) if (c.type === 'video' && c.data) return c.data
  }
  return null
}

const validId = (id: unknown): id is string => typeof id === 'string' && /^[\w.-]{1,200}$/.test(id)

export default async (req: Request) => {
  if (req.method !== 'POST') return json(405, { error: '허용되지 않은 요청입니다.' })
  try {
    await requireAdmin(req)
  } catch (e) {
    return json(401, { error: e instanceof AuthError ? e.message : '로그인을 확인하지 못했습니다.' })
  }

  const key = process.env.GEMINI_API_KEY
  const model = process.env.GEMINI_VIDEO_MODEL
  if (!key || !model) {
    return json(500, { error: '서버에 영상 생성 설정(GEMINI_API_KEY, GEMINI_VIDEO_MODEL)이 없습니다. 운영 안내를 확인해 Netlify 환경변수에 넣어 주세요.' })
  }
  const headers = { 'x-goog-api-key': key, 'content-type': 'application/json' }

  let input: Input
  try {
    input = await req.json()
  } catch {
    return json(400, { error: '요청 형식이 올바르지 않습니다.' })
  }

  if (input.action === 'start') {
    const image = String(input.image ?? '')
    if (!image || image.length > MAX_IMAGE_CHARS || !/^[A-Za-z0-9+/=]+$/.test(image.slice(0, 200))) {
      return json(400, { error: '상품 사진을 다시 골라 주세요.' })
    }
    const seconds = input.seconds === 8 ? 8 : 5
    const prompt = productVideoPrompt({ motion: input.motion ?? 'dolly', custom: String(input.custom ?? '').slice(0, 300), seconds, sound: !!input.sound })
    let res: Response
    try {
      res = await fetch(API, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model,
          background: true,
          input: [
            { type: 'image', data: image, mime_type: 'image/jpeg' },
            { type: 'text', text: prompt },
          ],
          response_format: { type: 'video', aspect_ratio: input.aspect === '16:9' ? '16:9' : '9:16', resolution: input.resolution === '360p' ? '360p' : '720p' },
        }),
        signal: AbortSignal.timeout(25_000),
      })
    } catch {
      return json(504, { error: '영상 AI 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.' })
    }
    if (!res.ok) return googleError(res, '시작')
    const it = (await res.json().catch(() => ({}))) as Interaction
    if (!it.id) return json(502, { error: '영상 작업 번호를 받지 못했습니다. 다시 시도해 주세요.' })
    return json(200, { id: it.id, status: it.status ?? 'in_progress' })
  }

  if (!validId(input.id)) return json(400, { error: '영상 작업 번호가 올바르지 않습니다.' })
  const url = `${API}/${encodeURIComponent(input.id)}`

  if (input.action === 'delete') {
    await fetch(url, { method: 'DELETE', headers, signal: AbortSignal.timeout(10_000) }).catch(() => null)
    return json(200, { ok: true })
  }

  if (input.action !== 'status' && input.action !== 'part') return json(400, { error: '알 수 없는 요청입니다.' })

  let res: Response
  try {
    res = await fetch(url, { headers, signal: AbortSignal.timeout(25_000) })
  } catch {
    return json(504, { error: '영상 상태를 확인하지 못했습니다. 잠시 후 다시 확인합니다.' })
  }
  if (!res.ok) return googleError(res, '확인')
  const it = (await res.json().catch(() => ({}))) as Interaction
  const status = it.status ?? 'in_progress'

  if (input.action === 'status') {
    if (status === 'failed' || status === 'cancelled') {
      return json(200, { status, error: it.error?.message ? `영상을 만들지 못했습니다: ${it.error.message.slice(0, 200)}` : '영상을 만들지 못했습니다. 설명을 바꿔 다시 시도해 주세요.' })
    }
    if (status !== 'completed') return json(200, { status })
    const data = videoData(it)
    if (!data) return json(200, { status: 'failed', error: '완성된 영상이 비어 있습니다(안전 정책에 걸렸을 수 있음). 설명을 바꿔 다시 시도해 주세요.' })
    const size = Math.floor((data.length * 3) / 4) - (data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0)
    return json(200, { status, size, parts: Math.ceil(size / PART_BYTES) })
  }

  // part: 영상 바이트를 3MB씩 잘라 보낸다
  const data = status === 'completed' ? videoData(it) : null
  if (!data) return json(409, { error: '영상이 아직 준비되지 않았습니다.' })
  const bytes = Buffer.from(data, 'base64')
  const index = Math.max(0, Math.floor(Number(input.index) || 0))
  const chunk = bytes.subarray(index * PART_BYTES, (index + 1) * PART_BYTES)
  if (!chunk.length) return json(400, { error: '영상 조각 번호가 올바르지 않습니다.' })
  return new Response(chunk, { status: 200, headers: { 'content-type': 'application/octet-stream', 'cache-control': 'no-store' } })
}
