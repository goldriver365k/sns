import { useEffect, useRef } from 'react'
import { drawReelFrame, ensureReelFonts, lastTextBoxes, REEL_H, REEL_W } from '../../reels/render'
import { sceneTimes } from '../../reels/store'
import type { ReelPlayer } from '../../reels/player'
import type { ReelProject } from '../../reels/types'
import { isExporting } from '../../reels/exporter'

/** 9:16 실제 크기(1080×1920)로 그리고 화면에 맞춰 줄여 보여 주는 미리보기 */
type TextEdit = {
  /** 편집 중인 글자 (점선으로 표시) */
  selected: string | null
  onPick: (id: string) => void
  /** 끌어서 옮긴 위치 (화면 비율 0~1) */
  onMove: (id: string, x: number, y: number) => void
}

export default function ReelPreview({ project, player, className, textEdit }: { project: ReelProject; player?: ReelPlayer; className?: string; textEdit?: TextEdit }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const projectRef = useRef(project)
  projectRef.current = project
  const selectedRef = useRef<string | null>(null)
  selectedRef.current = textEdit?.selected ?? null
  const drag = useRef<{ id: string; dx: number; dy: number } | null>(null)

  /** 화면 좌표 → 1080×1920 캔버스 좌표 */
  function toCanvas(e: React.PointerEvent<HTMLCanvasElement>) {
    const r = e.currentTarget.getBoundingClientRect()
    return { x: ((e.clientX - r.left) / r.width) * REEL_W, y: ((e.clientY - r.top) / r.height) * REEL_H }
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!textEdit) return
    const c = toCanvas(e)
    // 위에 그려진 글자부터 찾는다
    const hit = [...lastTextBoxes.entries()].reverse().find(([, b]) => c.x >= b.x && c.x <= b.x + b.w && c.y >= b.y && c.y <= b.y + b.h)
    if (!hit) return
    const tx = projectRef.current.texts.find((x) => x.id === hit[0])
    if (!tx) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    textEdit.onPick(tx.id)
    drag.current = { id: tx.id, dx: c.x - tx.x * REEL_W, dy: c.y - tx.y * REEL_H }
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const d = drag.current
    if (!d || !textEdit) return
    const c = toCanvas(e)
    const clamp = (v: number) => Math.max(0.02, Math.min(0.98, v))
    textEdit.onMove(d.id, clamp((c.x - d.dx) / REEL_W), clamp((c.y - d.dy) / REEL_H))
  }

  function onPointerUp() {
    drag.current = null
  }

  // 글자·템플릿이 바뀌면 폰트를 먼저 받는다
  const fontKey = `${project.template}|${project.title}|${project.scenes.map((s) => s.text + s.priceText + s.ctaText).join('|')}|${project.texts.map((x) => x.text + x.font).join('|')}`
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
        drawReelFrame(ctx, p, t, { highlight: selectedRef.current })
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      projectRef.current.assets.forEach((a) => a.type === 'video' && (a.el as HTMLVideoElement).pause())
    }
  }, [player])

  const editable = !!textEdit && project.texts.length > 0
  return (
    <canvas
      ref={canvasRef}
      width={REEL_W}
      height={REEL_H}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      // 글자가 있으면 미리보기 위에서 끌어 옮길 수 있게(휴대폰 화면 스크롤 대신)
      style={{ touchAction: editable ? 'none' : 'auto' }}
      className={`block aspect-[9/16] w-full rounded-2xl bg-black shadow-lg ${className ?? ''}`}
      aria-label="릴스 미리보기"
    />
  )
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
