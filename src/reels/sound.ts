import { makeMusic } from '../tteolbok/audio'
import { getFile } from './localFiles'
import { sceneTimes } from './store'
import type { ReelProject } from './types'
import { findVoice, narration, voiceKey, voiceRequest } from './voice'

/**
 * 릴스 소리 합치기: 장면마다 나레이션을 장면 시작 0.15초 뒤에 놓고, 배경음악을 깐다.
 * 나레이션이 나올 때는 음악을 줄인다(덕킹). 미리보기·MP4가 같은 결과를 쓴다.
 */
export type ReelMix = { sampleRate: number; pcm: Float32Array; voiced: number; scenes: number; musicMissing: boolean }

export const VOICE_DELAY = 0.15
/** 장면 사이 여유(초) — 장면 길이 맞추기에 쓴다 */
export const VOICE_GAP = 0.45

const decoded = new Map<string, Float32Array>()

async function decodeMono(buf: ArrayBuffer, sr: number): Promise<Float32Array> {
  const ctx = new OfflineAudioContext(1, 1, sr)
  const audio = await ctx.decodeAudioData(buf.slice(0))
  const out = new Float32Array(audio.length)
  for (let c = 0; c < audio.numberOfChannels; c++) {
    const d = audio.getChannelData(c)
    for (let i = 0; i < d.length; i++) out[i] += d[i] / audio.numberOfChannels
  }
  return out
}

/** 앞뒤 무음을 잘라 자막과 소리가 맞게 한다 */
function trimSilence(x: Float32Array, sr: number) {
  let a = 0
  let b = x.length - 1
  while (a < x.length && Math.abs(x[a]) < 0.01) a++
  while (b > a && Math.abs(x[b]) < 0.01) b--
  if (a >= b) return new Float32Array(0)
  return x.slice(Math.max(0, a - Math.round(sr * 0.03)), Math.min(x.length, b + Math.round(sr * 0.08)))
}

/** 장면별 나레이션 소리(없으면 null) */
async function sceneVoices(p: ReelProject, sr: number): Promise<(Float32Array | null)[]> {
  return Promise.all(
    p.scenes.map(async (s) => {
      const text = narration(s)
      if (!text) return null
      const key = voiceKey(voiceRequest(text, p.audio, p.language))
      const id = `${key}@${sr}`
      const hit = decoded.get(id)
      if (hit) return hit
      const buf = await findVoice(key)
      if (!buf) return null
      try {
        const clip = trimSilence(await decodeMono(buf, sr), sr)
        decoded.set(id, clip)
        return clip
      } catch {
        return null
      }
    }),
  )
}

/** 장면별 나레이션 길이(초). 음성이 없는 장면은 null */
export async function voiceSeconds(p: ReelProject): Promise<(number | null)[]> {
  const sr = 24000
  return (await sceneVoices(p, sr)).map((c) => (c ? c.length / sr : null))
}

async function musicTrack(p: ReelProject, sr: number, N: number): Promise<{ data: Float32Array | null; missing: boolean }> {
  const a = p.audio
  if (a.music === 'builtin') return { data: makeMusic(p.duration, sr), missing: false }
  if (a.music !== 'file' || !a.musicFile) return { data: null, missing: false }
  const blob = await getFile(a.musicFile.id)
  if (!blob) return { data: null, missing: true }
  let src: Float32Array
  try {
    src = await decodeMono(await blob.arrayBuffer(), sr)
  } catch {
    return { data: null, missing: true }
  }
  if (!src.length) return { data: null, missing: true }
  // 영상보다 짧으면 이어 붙이고, 앞 0.3초·끝 1.5초는 부드럽게
  const out = new Float32Array(N)
  for (let i = 0; i < N; i++) out[i] = src[i % src.length]
  let peak = 0
  for (let i = 0; i < N; i++) {
    const t = i / sr
    out[i] *= Math.min(t / 0.3, 1) * Math.max(0, Math.min(1, (p.duration - t) / 1.5))
    peak = Math.max(peak, Math.abs(out[i]))
  }
  if (peak > 0) for (let i = 0; i < N; i++) out[i] = (out[i] / peak) * 0.5
  return { data: out, missing: false }
}

/** 미리보기·MP4용 소리. 목소리도 음악도 끄면 null */
export async function buildReelMix(p: ReelProject, sr: number): Promise<ReelMix | null> {
  const a = p.audio
  if (!a.voiceOn && a.music === 'none') return null
  const N = Math.floor(sr * p.duration)
  const voice = new Float32Array(N)
  const duck = new Float32Array(N).fill(1)
  let voiced = 0
  if (a.voiceOn) {
    const times = sceneTimes(p)
    const clips = await sceneVoices(p, sr)
    clips.forEach((clip, i) => {
      if (!clip?.length) return
      voiced++
      let peak = 0
      for (const x of clip) peak = Math.max(peak, Math.abs(x))
      const g = peak > 0 ? 0.9 / peak : 1
      const s = Math.floor((times[i].start + VOICE_DELAY) * sr)
      for (let j = 0; j < clip.length && s + j < N; j++) voice[s + j] += clip[j] * g
      const d0 = Math.max(0, s - Math.floor(0.15 * sr))
      const d1 = Math.min(N, s + clip.length + Math.floor(0.2 * sr))
      for (let j = d0; j < d1; j++) duck[j] = 0.3
    })
  }
  const music = await musicTrack(p, sr, N)
  const pcm = new Float32Array(N)
  if (music.data) {
    // 음악 줄이기를 부드럽게 (0.15초 이동 평균)
    const k = Math.max(1, Math.floor(0.15 * sr))
    let acc = 0
    const vol = a.musicVolume * 2
    for (let i = 0; i < N + k; i++) {
      if (i < N) acc += duck[i]
      if (i - k >= 0) acc -= duck[i - k]
      const c = i - Math.floor(k / 2)
      if (c >= 0 && c < N) pcm[c] = music.data[c] * vol * (a.ducking ? acc / Math.min(k, i + 1) : 1)
    }
  }
  let peak = 0
  for (let i = 0; i < N; i++) {
    pcm[i] += voice[i]
    peak = Math.max(peak, Math.abs(pcm[i]))
  }
  if (peak > 0.95) for (let i = 0; i < N; i++) pcm[i] = (pcm[i] / peak) * 0.95
  return { sampleRate: sr, pcm, voiced, scenes: p.scenes.length, musicMissing: music.missing }
}
