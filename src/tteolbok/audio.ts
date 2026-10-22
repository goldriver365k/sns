import { auth } from '../lib/firebase'
import { FPS, type Cues } from './timeline'

/**
 * 털복이 숏폼 소리: AI 음성(OpenAI, 서버 함수) + 직접 만든 배경음악(외부 음원 없음 → 저작권 걱정 없음).
 * 음성이 나올 때는 음악을 줄이고, 음성 크기로 털복이 입 모양 데이터(30fps)를 만든다.
 */

/** 문장별 음성 파일(mp3) 보관 — 같은 문장은 다시 만들지 않는다(비용 절약) */
const voiceCache = new Map<string, ArrayBuffer>()

export async function fetchVoice(text: string, signal?: AbortSignal): Promise<ArrayBuffer> {
  const key = text.trim()
  const hit = voiceCache.get(key)
  if (hit) return hit
  const user = auth?.currentUser
  if (!user) throw new Error('로그인이 필요합니다.')
  let res: Response
  try {
    res = await fetch('/.netlify/functions/tteolbok-voice', {
      method: 'POST',
      headers: { authorization: `Bearer ${await user.getIdToken()}`, 'content-type': 'application/json' },
      body: JSON.stringify({ text: key }),
      signal: signal ?? AbortSignal.timeout(35_000),
    })
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') throw e
    if (e instanceof Error && e.name === 'TimeoutError') throw new Error('음성 만들기 응답이 너무 늦습니다. 다시 시도해 주세요.')
    throw new Error('네트워크 연결을 확인한 뒤 다시 시도해 주세요.')
  }
  const data = await res.json().catch(() => null)
  if (!res.ok || !data?.audio) throw new Error(data?.error || `음성을 만들지 못했습니다. (HTTP ${res.status})`)
  const bin = Uint8Array.from(atob(data.audio), (ch) => ch.charCodeAt(0)).buffer
  voiceCache.set(key, bin)
  return bin
}

/** 테스트·직접 녹음 파일 등으로 음성을 미리 넣어 둔다 */
export function putVoice(text: string, mp3: ArrayBuffer) {
  voiceCache.set(text.trim(), mp3)
}

export const hasVoice = (text: string) => voiceCache.has(text.trim())

/** mp3 → 지정한 표본 수의 모노 소리 */
async function decodeMono(buf: ArrayBuffer, sampleRate: number): Promise<Float32Array> {
  const ctx = new OfflineAudioContext(1, 1, sampleRate)
  const audio = await ctx.decodeAudioData(buf.slice(0))
  if (audio.numberOfChannels === 1) return audio.getChannelData(0).slice()
  const a = audio.getChannelData(0)
  const b = audio.getChannelData(1)
  const out = new Float32Array(a.length)
  for (let i = 0; i < a.length; i++) out[i] = (a[i] + b[i]) / 2
  return out
}

/** 구간별 음성을 풀어 둔 결과 */
export type VoiceClips = { sampleRate: number; clips: Float32Array[]; durations: [number, number, number] }

export async function decodeVoices(texts: [string, string, string], sampleRate: number): Promise<VoiceClips> {
  const r = await decodeVoiceList(texts, sampleRate)
  return { sampleRate, clips: r.clips, durations: r.durations as [number, number, number] }
}

/** 여러 문장의 음성을 풀어 둔다(없는 문장은 빈 소리). 핵심어 타이포처럼 장면 수가 정해지지 않은 곳에서 쓴다 */
export async function decodeVoiceList(texts: string[], sampleRate: number): Promise<{ clips: Float32Array[]; durations: number[] }> {
  const clips: Float32Array[] = []
  for (const t of texts) {
    const buf = t ? voiceCache.get(t.trim()) : undefined
    clips.push(buf ? await decodeMono(buf, sampleRate) : new Float32Array(0))
  }
  // 앞뒤 무음을 조금 잘라 타이밍을 맞춘다
  const trimmed = clips.map((x) => trimSilence(x, sampleRate))
  return { clips: trimmed, durations: trimmed.map((x) => x.length / sampleRate) }
}

function trimSilence(x: Float32Array, sr: number) {
  if (!x.length) return x
  const th = 0.01
  let a = 0
  let b = x.length - 1
  while (a < x.length && Math.abs(x[a]) < th) a++
  while (b > a && Math.abs(x[b]) < th) b--
  a = Math.max(0, a - Math.round(sr * 0.03))
  b = Math.min(x.length - 1, b + Math.round(sr * 0.08))
  return a >= b ? new Float32Array(0) : x.slice(a, b + 1)
}

/** 밝은 우쿨렐레풍 배경음악 (C–G–Am–F 진행, 112BPM). 항상 같은 소리가 나온다. */
export function makeMusic(seconds: number, sr: number): Float32Array {
  const N = Math.floor(sr * seconds)
  const out = new Float32Array(N)
  const beat = 60 / 112
  const f = (m: number) => 440 * Math.pow(2, (m - 69) / 12)
  const note = (m: number, st: number, d: number, kind: 'sine' | 'tri' | 'sq', vol: number) => {
    const n = Math.floor((d + 0.05) * sr)
    const s = Math.floor(st * sr)
    const w = 2 * Math.PI * f(m)
    for (let i = 0; i < n && s + i < N; i++) {
      const t = i / sr
      const ph = w * t
      const v = kind === 'sine' ? Math.sin(ph) : kind === 'tri' ? (2 / Math.PI) * Math.asin(Math.sin(ph)) : Math.sign(Math.sin(ph)) * 0.6
      out[s + i] += v * Math.min(t / 0.02, 1) * Math.exp(-t * (4.5 / d)) * vol
    }
  }
  const chords = [[60, 64, 67], [59, 62, 67], [57, 60, 64], [57, 60, 65], [60, 64, 67], [55, 59, 62]]
  const bass = [48, 43, 45, 41, 48, 43]
  const mel = [[72, 74, 76, 79], [79, 76, 74, 74], [76, 72, 74, 72], [69, 72, 74, 77], [76, 79, 81, 79], [76, 74, 72, 72]]
  let seed = 1
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1
  const bars = Math.ceil(seconds / (4 * beat)) + 1
  for (let i = 0; i < bars; i++) {
    const b = i % 6
    const bs = 0.05 + i * 4 * beat
    note(bass[b], bs, beat * 1.8, 'sine', 0.35)
    note(bass[b], bs + 2 * beat, beat * 1.8, 'sine', 0.28)
    for (let k = 0; k < 8; k++) chords[b].forEach((m, j) => note(m, bs + (k * beat) / 2 + j * 0.012, 0.25, 'tri', k % 2 ? 0.05 : 0.08))
    mel[b].forEach((m, j) => note(m, bs + j * beat, beat * 0.85, 'sq', 0.035))
    for (let k = 0; k < 4; k++) {
      const s = Math.floor((bs + k * beat + beat / 2) * sr)
      const n = Math.floor(0.06 * sr)
      for (let j = 0; j < n && s + j < N; j++) out[s + j] += rnd() * (1 - j / n) * (k % 2 ? 0.12 : 0.05)
    }
  }
  let peak = 0
  for (let i = 0; i < N; i++) {
    const t = i / sr
    out[i] *= Math.min(t / 0.6, 1) * Math.max(0, Math.min(1, (seconds - t) / 1.5))
    peak = Math.max(peak, Math.abs(out[i]))
  }
  if (peak > 0) for (let i = 0; i < N; i++) out[i] = (out[i] / peak) * 0.5
  return out
}

export type Mix = { sampleRate: number; pcm: Float32Array; env: Float32Array }

/** 음성 3구간 + 배경음악을 한 줄의 소리로 합치고, 입 모양 데이터를 만든다 */
export function mixAudio(v: VoiceClips | null, cues: Cues, music: boolean, sr: number): Mix {
  return mixTrack(v?.clips ?? [], [cues.a0, cues.sB, cues.sC], cues.end, music, sr)
}

/** 음성 조각들을 정해진 시각(초)에 놓고 배경음악과 합친다. 음성이 나올 때는 음악을 줄인다 */
export function mixTrack(clips: Float32Array[], starts: number[], end: number, music: boolean, sr: number): Mix {
  const N = Math.floor(sr * end)
  const voice = new Float32Array(N)
  const duck = new Float32Array(N).fill(1)
  {
    clips.forEach((clip, i) => {
      if (!clip.length) return
      let peak = 0
      for (const x of clip) peak = Math.max(peak, Math.abs(x))
      const g = peak > 0 ? 0.9 / peak : 1
      const s = Math.floor(starts[i] * sr)
      for (let j = 0; j < clip.length && s + j < N; j++) voice[s + j] += clip[j] * g
      const d0 = Math.max(0, s - Math.floor(0.15 * sr))
      const d1 = Math.min(N, s + clip.length + Math.floor(0.2 * sr))
      for (let j = d0; j < d1; j++) duck[j] = 0.45
    })
  }
  // 음악 줄이기를 부드럽게 (0.15초 이동 평균)
  const k = Math.floor(0.15 * sr)
  const smooth = new Float32Array(N)
  let acc = 0
  for (let i = 0; i < N + k; i++) {
    if (i < N) acc += duck[i]
    if (i - k >= 0) acc -= duck[i - k]
    const c = i - Math.floor(k / 2)
    if (c >= 0 && c < N) smooth[c] = acc / Math.min(k, i + 1)
  }
  const pcm = new Float32Array(N)
  const mus = music ? makeMusic(end, sr) : null
  let peak = 0
  for (let i = 0; i < N; i++) {
    pcm[i] = (mus ? mus[i] * smooth[i] : 0) + voice[i]
    peak = Math.max(peak, Math.abs(pcm[i]))
  }
  if (peak > 0.95) for (let i = 0; i < N; i++) pcm[i] = (pcm[i] / peak) * 0.95

  // 입 모양: 프레임별 음성 세기
  const frames = Math.ceil(end * FPS)
  const hop = sr / FPS
  const raw = new Float32Array(frames)
  for (let f = 0; f < frames; f++) {
    const a = Math.floor(f * hop)
    const b = Math.min(N, Math.floor((f + 1) * hop))
    let sum = 0
    for (let i = a; i < b; i++) sum += voice[i] * voice[i]
    raw[f] = b > a ? Math.sqrt(sum / (b - a)) : 0
  }
  const env = new Float32Array(frames)
  for (let f = 0; f < frames; f++) env[f] = 0.25 * (raw[f - 1] ?? 0) + 0.5 * raw[f] + 0.25 * (raw[f + 1] ?? 0)
  const active = Array.from(env).filter((x) => x > 0.01).sort((a, b) => a - b)
  const ref = active.length ? active[Math.floor(active.length * 0.9)] : 0
  for (let f = 0; f < frames; f++) env[f] = ref ? Math.min(1, env[f] / ref) : 0
  return { sampleRate: sr, pcm, env }
}
