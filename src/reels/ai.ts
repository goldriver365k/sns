import { auth } from '../lib/firebase'
import {
  buildReelMessages,
  finalizeReelScript,
  parseLooseJson,
  REEL_SCRIPT_SCHEMA,
  sanitizeReelRequest,
  type ReelScriptRequest,
  type ReelScriptResult,
} from '../../shared/reelScript'

/**
 * 릴스 대본 AI 연결
 * - server: Netlify 서버 함수(reel-script) → OpenAI. 키는 Netlify 환경변수에만 있다.
 * - local: 이 PC에서 돌리는 로컬 AI(Ollama·LM Studio 등 OpenAI 호환 주소). 비밀값을 저장하지 않는다.
 */
export type AiSettings = { provider: 'server' | 'local'; localUrl: string; localModel: string }

const KEY = 'snsroom.reels.ai'
export const DEFAULT_AI: AiSettings = { provider: 'server', localUrl: 'http://localhost:11434', localModel: '' }

export function loadAiSettings(): AiSettings {
  try {
    return { ...DEFAULT_AI, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }
  } catch {
    return DEFAULT_AI
  }
}

export function saveAiSettings(s: AiSettings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    // 저장하지 못하면 이번 접속 동안만 쓰임
  }
}

const base = (url: string) => url.trim().replace(/\/+$/, '').replace(/\/v1$/, '')

const LOCAL_HELP =
  '로컬 AI에 연결하지 못했습니다. 프로그램이 켜져 있는지, 주소가 맞는지, 이 사이트의 접속을 허용했는지 확인해 주세요. (Ollama는 OLLAMA_ORIGINS 설정 필요 — 릴스 설정 탭 안내 참고)'

/** 로컬 AI 연결 확인 — 쓸 수 있는 모델 이름 목록을 돌려준다 */
export async function listLocalModels(url: string): Promise<string[]> {
  let res: Response
  try {
    res = await fetch(`${base(url)}/v1/models`, { signal: AbortSignal.timeout(8000) })
  } catch {
    throw new Error(LOCAL_HELP)
  }
  if (!res.ok) throw new Error(`로컬 AI가 응답했지만 모델 목록을 주지 않았습니다. (HTTP ${res.status})`)
  const data = await res.json().catch(() => null)
  return Array.isArray(data?.data) ? data.data.map((m: { id?: string }) => String(m.id ?? '')).filter(Boolean) : []
}

async function viaServer(req: ReelScriptRequest): Promise<ReelScriptResult> {
  const user = auth?.currentUser
  if (!user) throw new Error('로그인이 필요합니다.')
  let res: Response
  try {
    res = await fetch('/.netlify/functions/reel-script', {
      method: 'POST',
      headers: { authorization: `Bearer ${await user.getIdToken()}`, 'content-type': 'application/json' },
      body: JSON.stringify(req),
      signal: AbortSignal.timeout(35_000),
    })
  } catch (e) {
    if (e instanceof Error && e.name === 'TimeoutError') throw new Error('응답이 너무 늦습니다. 다시 시도해 주세요.')
    throw new Error('네트워크 연결을 확인한 뒤 다시 시도해 주세요.')
  }
  const data = await res.json().catch(() => null)
  if (!res.ok || !Array.isArray(data?.scenes)) {
    if (res.status === 404) throw new Error('대본 생성 서버를 찾지 못했습니다. 배포 로그의 Functions 항목을 확인해 주세요. (HTTP 404)')
    throw new Error(data?.error || `대본을 만들지 못했습니다. (HTTP ${res.status})`)
  }
  return data as ReelScriptResult
}

async function viaLocal(req: ReelScriptRequest, s: AiSettings): Promise<ReelScriptResult> {
  if (!s.localModel) throw new Error('릴스 설정 탭에서 로컬 AI 모델을 골라 주세요.')
  const messages = buildReelMessages(req)
  messages[0].content += '\n반드시 {"title": "...", "scenes": [{"text", "seconds", "effect", "priceText", "ctaText"}]} 형식의 JSON만 답한다.'
  const call = (withSchema: boolean) =>
    fetch(`${base(s.localUrl)}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: s.localModel,
        messages,
        stream: false,
        ...(withSchema ? { response_format: { type: 'json_schema', json_schema: { name: 'reel_script', strict: true, schema: REEL_SCRIPT_SCHEMA } } } : {}),
      }),
      // 로컬 AI는 PC 성능에 따라 느릴 수 있다
      signal: AbortSignal.timeout(180_000),
    })
  let res: Response
  try {
    res = await call(true)
    // 형식 지정(json_schema)을 모르는 프로그램이면 형식 없이 한 번 더
    if (res.status === 400 || res.status === 422) res = await call(false)
  } catch (e) {
    if (e instanceof Error && e.name === 'TimeoutError') throw new Error('로컬 AI 응답이 3분 넘게 없습니다. 더 작은 모델을 써 보세요.')
    throw new Error(LOCAL_HELP)
  }
  if (!res.ok) throw new Error(`로컬 AI가 대본을 만들지 못했습니다. (HTTP ${res.status}) 모델 이름을 확인해 주세요.`)
  const data = await res.json().catch(() => null)
  const parsed = parseLooseJson(String(data?.choices?.[0]?.message?.content ?? ''))
  return finalizeReelScript(parsed, req)
}

/** 설정한 AI로 릴스 대본(또는 장면 하나)을 만든다. 실패하면 한국어 메시지로 예외를 던진다. */
export async function runReelScript(raw: ReelScriptRequest): Promise<ReelScriptResult> {
  const req = sanitizeReelRequest(raw)
  const s = loadAiSettings()
  const result = s.provider === 'local' ? await viaLocal(req, s) : await viaServer(req)
  if (!result.scenes.length) throw new Error('AI가 장면을 만들지 못했습니다. 주제를 조금 더 구체적으로 적어 주세요.')
  return result
}
