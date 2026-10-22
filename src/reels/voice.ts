import { auth } from '../lib/firebase'
import { sanitizeVoiceRequest, type ReelVoiceRequest } from '../../shared/reelVoice'
import { loadVoiceCloud, saveVoiceCloud } from './cloud'
import { getFile, putFile } from './localFiles'
import type { ReelAudio, ReelScene } from './types'

/**
 * 장면 나레이션 음성(mp3).
 * 같은 자막·목소리·말투·속도면 다시 만들지 않는다: 이 기기 저장소 → Firestore `reelVoices` → 서버(OpenAI, 사용료 발생) 순서로 찾는다.
 */
const memory = new Map<string, ArrayBuffer>()

/** 나레이션으로 읽을 글 (자막 줄바꿈은 띄어쓰기로) */
export const narration = (s: Pick<ReelScene, 'text'>) => s.text.replace(/\s+/g, ' ').trim()

function hash(s: string) {
  // FNV-1a 두 번(64비트 흉내) — 파일 이름용
  let a = 0x811c9dc5
  let b = 0x01000193
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    a = Math.imul(a ^ c, 0x01000193) >>> 0
    b = Math.imul(b ^ c, 0x85ebca6b) >>> 0
  }
  return a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0')
}

export function voiceRequest(text: string, a: Pick<ReelAudio, 'voice' | 'style' | 'speed'>): ReelVoiceRequest {
  return sanitizeVoiceRequest({ text, voice: a.voice, style: a.style, speed: a.speed })
}

export const voiceKey = (r: ReelVoiceRequest) => 'v' + hash(`${r.voice}|${r.style}|${r.speed}|${r.text}`)

/** 메모리에 올라온 음성 (화면·소리 합치기용) */
export const cachedVoice = (key: string) => memory.get(key) ?? null

const toBase64 = (buf: ArrayBuffer) => {
  let s = ''
  const bytes = new Uint8Array(buf)
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}
const fromBase64 = (b64: string) => Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0)).buffer

/** 저장된 음성만 찾는다(새로 만들지 않음 → 비용 없음) */
export async function findVoice(key: string): Promise<ArrayBuffer | null> {
  const hit = memory.get(key)
  if (hit) return hit
  const local = await getFile(key)
  if (local) {
    const buf = await local.arrayBuffer()
    memory.set(key, buf)
    return buf
  }
  const cloud = await loadVoiceCloud(key)
  if (cloud) {
    const buf = fromBase64(cloud)
    memory.set(key, buf)
    void putFile(key, new Blob([buf], { type: 'audio/mpeg' })).catch(() => undefined)
    return buf
  }
  return null
}

/** 음성을 가져오고, 없으면 서버에서 만든다(OpenAI 사용료 발생) */
export async function getVoice(r: ReelVoiceRequest, signal?: AbortSignal): Promise<ArrayBuffer> {
  const key = voiceKey(r)
  const found = await findVoice(key)
  if (found) return found
  const user = auth?.currentUser
  if (!user) throw new Error('로그인이 필요합니다.')
  let res: Response
  try {
    res = await fetch('/.netlify/functions/reel-voice', {
      method: 'POST',
      headers: { authorization: `Bearer ${await user.getIdToken()}`, 'content-type': 'application/json' },
      body: JSON.stringify(r),
      signal: signal ?? AbortSignal.timeout(35_000),
    })
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e
    if (e instanceof Error && e.name === 'TimeoutError') throw new Error('음성 만들기 응답이 너무 늦습니다. 다시 시도해 주세요.')
    throw new Error('네트워크 연결을 확인한 뒤 다시 시도해 주세요.')
  }
  const data = await res.json().catch(() => null)
  if (!res.ok || !data?.audio) {
    if (res.status === 404) throw new Error('음성 서버를 찾지 못했습니다. 배포 로그의 Functions 항목을 확인해 주세요. (HTTP 404)')
    throw new Error(data?.error || `음성을 만들지 못했습니다. (HTTP ${res.status})`)
  }
  const buf = fromBase64(data.audio)
  memory.set(key, buf)
  await putFile(key, new Blob([buf], { type: 'audio/mpeg' })).catch(() => undefined)
  void saveVoiceCloud(key, data.audio).catch(() => undefined)
  return buf
}

/** 테스트·직접 녹음 등으로 음성을 넣어 둔다 */
export function putVoiceBuffer(key: string, buf: ArrayBuffer) {
  memory.set(key, buf)
  void putFile(key, new Blob([buf], { type: 'audio/mpeg' })).catch(() => undefined)
  void saveVoiceCloud(key, toBase64(buf)).catch(() => undefined)
}
