import { ArrayBufferTarget, Muxer } from 'mp4-muxer'
import { pickCodec } from '../reels/exporter'
import type { Mix } from './audio'
import { drawTteolbokFrame, ensureTteolbokFonts, TT_H, TT_W, type FrameInput } from './render'
import { FPS } from './timeline'

/**
 * 털복이 숏폼·핵심어 타이포 MP4를 사용자의 PC(브라우저)에서 만든다 — 서버 비용 없음.
 * 화면은 릴스와 같은 방식(WebCodecs, H.264 우선), 소리는 AAC를 먼저 쓰고 안 되면 Opus로 넣는다.
 */
export type TteolbokExport = { blob: Blob; codec: 'avc' | 'vp9'; audio: 'aac' | 'opus' | null; seconds: number }

const BITRATE = 8_000_000
const AUDIO_CANDIDATES: { codec: string; mux: 'aac' | 'opus'; sampleRate: number }[] = [
  { codec: 'mp4a.40.2', mux: 'aac', sampleRate: 44100 },
  { codec: 'opus', mux: 'opus', sampleRate: 48000 },
]

/** 이 브라우저에서 쓸 수 있는 소리 형식. 소리를 넣을 수 없으면 null */
export async function pickAudioCodec() {
  if (typeof AudioEncoder === 'undefined') return null
  for (const c of AUDIO_CANDIDATES) {
    try {
      const r = await AudioEncoder.isConfigSupported({ codec: c.codec, sampleRate: c.sampleRate, numberOfChannels: 1, bitrate: 128_000 })
      if (r.supported) return c
    } catch {
      // 다음 후보
    }
  }
  return null
}

/** 털복이 숏폼 MP4 */
export async function exportTteolbokMp4(
  frame: FrameInput,
  mix: Mix | null,
  audioCodec: Awaited<ReturnType<typeof pickAudioCodec>>,
  opts: { onProgress?: (ratio: number) => void; signal?: AbortSignal } = {},
): Promise<TteolbokExport> {
  await ensureTteolbokFonts(frame)
  const f = { ...frame, env: mix?.env ?? null }
  return exportCanvasMp4({ width: TT_W, height: TT_H, duration: frame.cues.end, draw: (ctx, t) => drawTteolbokFrame(ctx, f, t) }, mix, audioCodec, opts)
}

/**
 * 시간만으로 그리는 화면(draw)을 MP4로 만든다. 털복이 숏폼·핵심어 타이포가 함께 쓴다.
 * 화면은 H.264 우선(안 되면 VP9), 소리는 AAC 우선(안 되면 Opus).
 */
export async function exportCanvasMp4(
  src: { width: number; height: number; duration: number; draw: (ctx: CanvasRenderingContext2D, t: number) => void },
  mix: Mix | null,
  audioCodec: Awaited<ReturnType<typeof pickAudioCodec>>,
  opts: { onProgress?: (ratio: number) => void; signal?: AbortSignal } = {},
): Promise<TteolbokExport> {
  const picked = await pickCodec()
  if (!picked) throw new Error('이 브라우저는 영상 만들기를 지원하지 않습니다. PC의 크롬·엣지 최신 버전에서 다시 시도해 주세요.')
  const started = performance.now()
  const W = src.width
  const H = src.height

  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!
  const withAudio = Boolean(mix && audioCodec && mix.sampleRate === audioCodec.sampleRate)

  const target = new ArrayBufferTarget()
  const muxer = new Muxer({
    target,
    video: { codec: picked.mux, width: W, height: H, frameRate: FPS },
    ...(withAudio ? { audio: { codec: audioCodec!.mux, numberOfChannels: 1, sampleRate: audioCodec!.sampleRate } } : {}),
    fastStart: 'in-memory',
  })
  let failure: unknown = null
  const venc = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: (e) => (failure = e) })
  venc.configure({
    codec: picked.codec,
    width: W,
    height: H,
    bitrate: BITRATE,
    framerate: FPS,
    latencyMode: 'quality',
    ...(picked.mux === 'avc' ? { avc: { format: 'avc' as const } } : {}),
  })
  let aenc: AudioEncoder | null = null

  try {
    // 소리를 먼저 통째로 넣는다(짧은 영상이라 부담 없음)
    if (withAudio && mix) {
      aenc = new AudioEncoder({ output: (chunk, meta) => muxer.addAudioChunk(chunk, meta), error: (e) => (failure = e) })
      aenc.configure({ codec: audioCodec!.codec, sampleRate: mix.sampleRate, numberOfChannels: 1, bitrate: 128_000 })
      const block = 4096
      for (let i = 0; i < mix.pcm.length; i += block) {
        const data = mix.pcm.subarray(i, Math.min(mix.pcm.length, i + block))
        const ad = new AudioData({
          format: 'f32-planar',
          sampleRate: mix.sampleRate,
          numberOfFrames: data.length,
          numberOfChannels: 1,
          timestamp: Math.round((i * 1e6) / mix.sampleRate),
          data: new Float32Array(data),
        })
        aenc.encode(ad)
        ad.close()
      }
      await aenc.flush()
    }

    const total = Math.ceil(src.duration * FPS)
    for (let i = 0; i < total; i++) {
      if (opts.signal?.aborted) throw new DOMException('취소되었습니다.', 'AbortError')
      if (failure) throw failure
      src.draw(ctx, i / FPS)
      const vf = new VideoFrame(canvas, { timestamp: Math.round((i * 1e6) / FPS), duration: Math.round(1e6 / FPS) })
      venc.encode(vf, { keyFrame: i % (FPS * 2) === 0 })
      vf.close()
      while (venc.encodeQueueSize > 6) await new Promise((r) => setTimeout(r, 5))
      if (i % 5 === 0) {
        opts.onProgress?.(i / total)
        await new Promise((r) => setTimeout(r, 0))
      }
    }
    await venc.flush()
    if (failure) throw failure
    muxer.finalize()
    opts.onProgress?.(1)
    return {
      blob: new Blob([target.buffer], { type: 'video/mp4' }),
      codec: picked.mux,
      audio: withAudio ? audioCodec!.mux : null,
      seconds: (performance.now() - started) / 1000,
    }
  } finally {
    if (venc.state !== 'closed') venc.close()
    if (aenc && aenc.state !== 'closed') aenc.close()
  }
}
