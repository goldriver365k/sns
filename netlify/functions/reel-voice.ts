import { sanitizeVoiceRequest, voiceInstructions, type ReelVoiceRequest } from '../../shared/reelVoice'
import { AuthError, requireAdmin } from '../lib/auth'

// AI 자동 릴스 나레이션 한 장면을 만든다(mp3). 주소: /.netlify/functions/reel-voice
// OpenAI 음성(TTS)은 상업 이용이 가능하지만, 듣는 사람에게 AI 음성임을 알려야 한다(영상에 "AI 음성" 표시).
const TIMEOUT_MS = 25_000
const DEFAULT_MODEL = 'gpt-4o-mini-tts'

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8' } })

export default async (req: Request) => {
  if (req.method !== 'POST') return json(405, { error: '허용되지 않은 요청입니다.' })
  try {
    await requireAdmin(req)
  } catch (e) {
    return json(401, { error: e instanceof AuthError ? e.message : '로그인을 확인하지 못했습니다.' })
  }

  let input: ReelVoiceRequest
  try {
    input = sanitizeVoiceRequest(await req.json())
  } catch {
    return json(400, { error: '요청 형식이 올바르지 않습니다.' })
  }
  if (!input.text) return json(400, { error: '읽을 자막이 없습니다.' })

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return json(500, { error: '서버에 OpenAI 설정(OPENAI_API_KEY)이 없습니다. 운영 안내를 확인해 주세요.' })
  const model = process.env.OPENAI_TTS_MODEL || DEFAULT_MODEL

  const body: Record<string, unknown> = { model, voice: input.voice, input: input.text, response_format: 'mp3' }
  // tts-1 계열은 숫자 속도를, 그 외(gpt-4o-mini-tts)는 말투 지시로 속도를 요청한다
  if (model.startsWith('tts-1')) body.speed = input.speed
  else body.instructions = voiceInstructions(input)

  let res: Response
  try {
    res = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (e) {
    const timeout = e instanceof Error && e.name === 'TimeoutError'
    return json(504, { error: timeout ? '음성 만들기가 너무 오래 걸렸습니다. 다시 시도해 주세요.' : 'AI 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.' })
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    console.error('OpenAI 릴스 음성 오류', res.status, detail.slice(0, 500))
    let reason = ''
    try {
      reason = JSON.parse(detail)?.error?.message ?? ''
    } catch {
      // 원문이 JSON이 아니면 상태 코드만 안내
    }
    return json(502, { error: `음성을 만들지 못했습니다. (OpenAI ${res.status}${reason ? `: ${reason.slice(0, 160)}` : ''})` })
  }
  const audio = Buffer.from(await res.arrayBuffer()).toString('base64')
  return json(200, { audio, mime: 'audio/mpeg' })
}
