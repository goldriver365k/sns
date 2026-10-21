import { ArrayBufferTarget, Muxer } from 'mp4-muxer'
import { drawReelFrame, ensureReelFonts, REEL_H, REEL_W } from './render'
import { sceneTimes } from './store'
import type { ReelProject } from './types'

/**
 * 릴스를 사용자의 PC(브라우저)에서 MP4로 만든다 — 서버 비용 없음.
 * 미리보기와 같은 drawReelFrame으로 한 프레임씩 그려 WebCodecs로 인코딩하고 MP4로 포장한다.
 * H.264를 먼저 쓰고(모든 휴대폰·인스타그램 재생), 브라우저가 H.264 인코딩을 못 하면 VP9로 대신 만든다.
 */
export type ExportResult = { blob: Blob; codec: 'avc' | 'vp9'; seconds: number }

const FPS = 30

/** MP4를 만드는 동안 미리보기가 영상 재생 위치를 건드리지 않게 하는 표시 */
let exporting = false
export const isExporting = () => exporting
const BITRATE = 8_000_000

const CANDIDATES: { codec: string; mux: 'avc' | 'vp9' }[] = [
  { codec: 'avc1.640028', mux: 'avc' }, // High 4.0
  { codec: 'avc1.4d0028', mux: 'avc' }, // Main 4.0
  { codec: 'avc1.42e028', mux: 'avc' }, // Baseline 4.0
  { codec: 'vp09.00.40.08', mux: 'vp9' },
]

export async function pickCodec() {
  if (typeof VideoEncoder === 'undefined') return null
  for (const c of CANDIDATES) {
    try {
      const r = await VideoEncoder.isConfigSupported({ codec: c.codec, width: REEL_W, height: REEL_H, bitrate: BITRATE, framerate: FPS })
      if (r.supported) return c
    } catch {
      // 다음 후보
    }
  }
  return null
}

function seekVideo(v: HTMLVideoElement, time: number) {
  if (Math.abs(v.currentTime - time) < 0.001 && v.readyState >= 2) return Promise.resolve()
  return new Promise<void>((resolve) => {
    const done = () => {
      v.removeEventListener('seeked', done)
      resolve()
    }
    v.addEventListener('seeked', done)
    v.currentTime = time
    setTimeout(done, 1500) // 응답이 없어도 멈추지 않게
  })
}

export async function exportReelMp4(
  p: ReelProject,
  opts: { onProgress?: (ratio: number) => void; signal?: AbortSignal } = {},
): Promise<ExportResult> {
  const picked = await pickCodec()
  if (!picked) {
    throw new Error('이 브라우저는 영상 만들기를 지원하지 않습니다. PC의 크롬·엣지 최신 버전에서 다시 시도해 주세요.')
  }
  const started = performance.now()
  await ensureReelFonts(p)
  await document.fonts.ready

  const canvas = document.createElement('canvas')
  canvas.width = REEL_W
  canvas.height = REEL_H
  const ctx = canvas.getContext('2d')!

  const target = new ArrayBufferTarget()
  const muxer = new Muxer({ target, video: { codec: picked.mux, width: REEL_W, height: REEL_H, frameRate: FPS }, fastStart: 'in-memory' })
  let failure: unknown = null
  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => {
      failure = e
    },
  })
  encoder.configure({
    codec: picked.codec,
    width: REEL_W,
    height: REEL_H,
    bitrate: BITRATE,
    framerate: FPS,
    latencyMode: 'quality',
    ...(picked.mux === 'avc' ? { avc: { format: 'avc' as const } } : {}),
  })

  exporting = true
  const videos = p.assets.filter((a) => a.type === 'video')
  videos.forEach((a) => (a.el as HTMLVideoElement).pause())
  const times = sceneTimes(p)
  const assets = new Map(p.assets.map((a) => [a.id, a]))
  const total = Math.ceil(p.duration * FPS)

  try {
    for (let i = 0; i < total; i++) {
      if (opts.signal?.aborted) throw new DOMException('취소되었습니다.', 'AbortError')
      if (failure) throw failure
      const t = i / FPS
      // 지금 장면이 영상이면 그 시점으로 맞춘 뒤 그린다
      const si = times.findIndex((x) => t >= x.start && t < x.start + x.len)
      const a = si >= 0 && p.scenes[si].assetId ? assets.get(p.scenes[si].assetId!) : undefined
      if (a?.type === 'video') await seekVideo(a.el as HTMLVideoElement, (t - times[si].start) % Math.max(0.1, a.duration ?? 1))
      drawReelFrame(ctx, p, t)
      const frame = new VideoFrame(canvas, { timestamp: Math.round((i * 1e6) / FPS), duration: Math.round(1e6 / FPS) })
      encoder.encode(frame, { keyFrame: i % (FPS * 2) === 0 })
      frame.close()
      // 인코더가 밀리면 잠깐 기다린다(메모리 보호) + 화면이 멈추지 않게 양보
      while (encoder.encodeQueueSize > 6) await new Promise((r) => setTimeout(r, 5))
      if (i % 5 === 0) {
        opts.onProgress?.(i / total)
        await new Promise((r) => setTimeout(r, 0))
      }
    }
    await encoder.flush()
    if (failure) throw failure
    muxer.finalize()
    opts.onProgress?.(1)
    return { blob: new Blob([target.buffer], { type: 'video/mp4' }), codec: picked.mux, seconds: (performance.now() - started) / 1000 }
  } finally {
    exporting = false
    if (encoder.state !== 'closed') encoder.close()
  }
}
