import { useEffect, useRef } from 'react'
import { drawReelFrame, ensureReelFonts, REEL_H, REEL_W } from '../../reels/render'
import { sceneTimes } from '../../reels/store'
import type { ReelPlayer } from '../../reels/player'
import type { ReelProject } from '../../reels/types'
import { isExporting } from '../../reels/exporter'

/** 9:16 실제 크기(1080×1920)로 그리고 화면에 맞춰 줄여 보여 주는 미리보기 */
export default function ReelPreview({ project, player, className }: { project: ReelProject; player?: ReelPlayer; className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const projectRef = useRef(project)
  projectRef.current = project

  // 글자·템플릿이 바뀌면 폰트를 먼저 받는다
  const fontKey = `${project.template}|${project.title}|${project.scenes.map((s) => s.text + s.priceText + s.ctaText).join('|')}`
  useEffect(() => {
    void ensureReelFonts(project)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fontKey])

  useEffect(() => {
    let raf = 0
    // player가 없으면(디자인 미리보기) 혼자 반복 재생
    let ownTime = 0
    let last = performance.now()
    const tick = (now: number) => {
      const p = projectRef.current
      const ctx = canvasRef.current?.getContext('2d')
      ownTime = (ownTime + (now - last) / 1000) % Math.max(1, p.duration)
      last = now
      const t = player ? player.timeRef.current : ownTime
      const playing = player ? player.playingRef.current : true
      // MP4를 만드는 동안에는 영상 위치를 만들기 쪽이 쓰므로 미리보기는 쉰다
      if (ctx && !isExporting()) {
        syncVideos(p, t, playing)
        drawReelFrame(ctx, p, t)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      projectRef.current.assets.forEach((a) => a.type === 'video' && (a.el as HTMLVideoElement).pause())
    }
  }, [player])

  return <canvas ref={canvasRef} width={REEL_W} height={REEL_H} className={`block aspect-[9/16] w-full rounded-2xl bg-black shadow-lg ${className ?? ''}`} aria-label="릴스 미리보기" />
}

/** 지금 장면의 영상만 재생 위치를 맞춰 돌리고, 나머지 영상은 멈춘다 */
function syncVideos(p: ReelProject, t: number, playing: boolean) {
  const times = sceneTimes(p)
  const i = times.findIndex((x) => t >= x.start && t < x.start + x.len)
  const active = i >= 0 ? p.scenes[i]?.assetId : null
  for (const a of p.assets) {
    if (a.type !== 'video') continue
    const v = a.el as HTMLVideoElement
    if (a.id !== active) {
      if (!v.paused) v.pause()
      continue
    }
    const want = (t - times[i].start) % Math.max(0.1, a.duration ?? 1)
    if (playing) {
      if (v.paused) void v.play().catch(() => {})
      if (Math.abs(v.currentTime - want) > 0.35) v.currentTime = want
    } else {
      if (!v.paused) v.pause()
      if (Math.abs(v.currentTime - want) > 0.04) v.currentTime = want
    }
  }
}
