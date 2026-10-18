import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { CARD_H, CARD_W, renderCard, type CardInput, type RenderReport } from '../cards/render'
import { ensureFonts } from '../cards/fonts'
import type { DesignId } from '../cards/designs'

export type CardCheck = RenderReport & { fontOk: boolean }

export type CardCanvasHandle = {
  /** 폰트 준비를 확인하고 최신 내용으로 다시 그린 뒤 캔버스와 검사 결과를 돌려준다 */
  prepare: () => Promise<{ canvas: HTMLCanvasElement; check: CardCheck }>
}

type Props = {
  design: DesignId
  card: CardInput
  onCheck?: (c: CardCheck) => void
  className?: string
}

/** 카드 1장. 실제 크기(1080×1350)로 그리고 화면에는 줄여서 보여준다 → 미리보기 = PNG */
const CardCanvas = forwardRef<CardCanvasHandle, Props>(function CardCanvas({ design, card, onCheck, className }, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [ready, setReady] = useState(false)
  const text = `${card.title}${card.body}${card.emphasis}${card.siteUrl}${card.index + 1}/0123456789`

  async function draw(): Promise<CardCheck | null> {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return null
    const fontOk = await ensureFonts(design, text)
    const report = renderCard(ctx, design, card)
    return { ...report, fontOk }
  }

  useEffect(() => {
    let alive = true
    draw().then((c) => {
      if (!alive || !c) return
      setReady(true)
      onCheck?.(c)
    })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [design, card.title, card.body, card.emphasis, card.siteUrl, card.index, card.total, card.image])

  useImperativeHandle(ref, () => ({
    async prepare() {
      const check = await draw()
      if (!check || !canvasRef.current) throw new Error('카드를 그리지 못했습니다.')
      return { canvas: canvasRef.current, check }
    },
  }))

  return (
    <canvas
      ref={canvasRef}
      width={CARD_W}
      height={CARD_H}
      className={`block aspect-[4/5] w-full rounded-lg bg-cream-200 shadow-sm transition-opacity ${ready ? 'opacity-100' : 'opacity-40'} ${className ?? ''}`}
      aria-label={`카드 ${card.index + 1}`}
    />
  )
})

export default CardCanvas
