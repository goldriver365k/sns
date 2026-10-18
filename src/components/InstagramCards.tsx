import { useMemo, useRef, useState } from 'react'
import type { CardText } from '../../shared/generate'
import { DESIGNS, getDesign, type DesignId } from '../cards/designs'
import type { CardInput } from '../cards/render'
import { canShareImages, canvasToPng, downloadPng, downloadZip, saveToGallery } from '../cards/export'
import CardCanvas, { type CardCanvasHandle, type CardCheck } from './CardCanvas'
import { todayKst } from '../lib/contents'
import { btnGhost, btnPrimary } from './ui'

type Props = {
  cards: CardText[]
  /** 파일 이름에 쓰는 영문 이름 (압축 파일에서 한글 이름이 깨지지 않게) */
  fileKey: string
  brandName: string
  siteUrl: string
  defaultDesign: string
  onChange: (cards: CardText[]) => void
  onMessage: (msg: string) => void
}

const bare = (url: string) => url.replace(/^https?:\/\//i, '').replace(/\/$/, '')

export default function InstagramCards({ cards, fileKey, brandName, siteUrl, defaultDesign, onChange, onMessage }: Props) {
  const [perCard, setPerCard] = useState(false)
  const [selected, setSelected] = useState(0)
  const [checks, setChecks] = useState<Record<number, CardCheck>>({})
  const [busy, setBusy] = useState(false)
  const refs = useRef<(CardCanvasHandle | null)[]>([])
  const site = bare(siteUrl)

  const designOf = (i: number) => getDesign(cards[i]?.design ?? defaultDesign).id
  const inputs: CardInput[] = useMemo(
    () => cards.map((c, i) => ({ title: c.title, body: c.body, emphasis: c.emphasis, index: i, total: cards.length, siteUrl: site, brandName })),
    [cards, site, brandName],
  )

  function chooseDesign(id: DesignId) {
    onChange(cards.map((c, i) => (!perCard || i === selected ? { ...c, design: id } : c)))
  }

  const fileName = (i: number) => `${fileKey}_${todayKst().replace(/-/g, '')}_${i + 1}.png`

  /** 다운로드 전 검사: 한글 폰트, 글씨 잘림, 주소 표시. 문제가 있으면 막고 이유를 알려준다. */
  async function prepareAll(indexes: number[]) {
    const out: { name: string; blob: Blob }[] = []
    const problems: string[] = []
    let repaired = false
    for (const i of indexes) {
      const handle = refs.current[i]
      if (!handle) continue
      const { canvas, check } = await handle.prepare()
      setChecks((prev) => ({ ...prev, [i]: check }))
      if (!check.fontOk) problems.push(`카드 ${i + 1}: 폰트를 불러오지 못해 한글이 깨질 수 있습니다. 새로고침 후 다시 시도해 주세요.`)
      if (check.overflow.length) problems.push(`카드 ${i + 1}: ${check.overflow.join('·')}이 너무 길어 잘립니다. 글을 줄여 주세요.`)
      if (!check.footerOk) problems.push(`카드 ${i + 1}: ${site} 주소가 보이지 않습니다.`)
      if (check.footerRepaired) repaired = true
      out.push({ name: fileName(i), blob: await canvasToPng(canvas) })
    }
    if (problems.length) {
      onMessage(problems[0])
      return null
    }
    if (repaired) onMessage(`${site} 주소가 잘 보이지 않아 자동으로 복구했습니다.`)
    return out
  }

  async function run(action: (files: { name: string; blob: Blob }[]) => Promise<void> | void, indexes = cards.map((_, i) => i)) {
    setBusy(true)
    try {
      const files = await prepareAll(indexes)
      if (files) await action(files)
    } catch {
      onMessage('이미지를 만들지 못했습니다. 다시 시도해 주세요.')
    } finally {
      setBusy(false)
    }
  }

  const gallery = canShareImages()
  const problemOf = (i: number) => {
    const c = checks[i]
    if (!c) return null
    if (!c.fontOk) return '폰트 확인 필요'
    if (c.overflow.length) return `${c.overflow.join('·')} 잘림 — 글을 줄여 주세요`
    if (!c.footerOk) return '주소 표시 안 됨'
    return null
  }

  return (
    <div className="space-y-4">
      {/* 디자인 5종 */}
      <div>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm font-semibold text-forest-900">디자인</span>
          <label className="flex items-center gap-2 text-sm text-muted">
            <input type="checkbox" checked={perCard} onChange={(e) => setPerCard(e.target.checked)} className="accent-forest-700" />
            카드마다 다른 디자인
          </label>
        </div>
        <div className="grid grid-cols-5 gap-2">
          {DESIGNS.map((d) => {
            const on = perCard ? designOf(selected) === d.id : cards.every((_, i) => designOf(i) === d.id)
            return (
              <button
                key={d.id}
                type="button"
                onClick={() => chooseDesign(d.id)}
                aria-pressed={on}
                title={d.description}
                className={`rounded-xl border-2 p-1 text-center transition ${on ? 'border-forest-700' : 'border-transparent hover:border-cream-300'}`}
              >
                {inputs[0] && <CardCanvas design={d.id} card={inputs[0]} />}
                <span className="mt-1 block truncate text-[11px] text-ink sm:text-xs">{d.name}</span>
              </button>
            )
          })}
        </div>
        {perCard && <p className="mt-1 text-xs text-muted">아래에서 카드를 누른 뒤 디자인을 고르면 그 카드만 바뀝니다.</p>}
      </div>

      {/* 카드 3장 미리보기 */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        {inputs.map((card, i) => {
          const problem = problemOf(i)
          return (
            <div key={i} className="min-w-0">
              <button
                type="button"
                onClick={() => setSelected(i)}
                className={`block w-full rounded-xl border-2 p-0.5 ${perCard && selected === i ? 'border-forest-700' : 'border-transparent'}`}
                aria-label={`카드 ${i + 1} 선택`}
              >
                <CardCanvas
                  ref={(h) => {
                    refs.current[i] = h
                  }}
                  design={designOf(i)}
                  card={card}
                  onCheck={(c) => setChecks((prev) => ({ ...prev, [i]: c }))}
                />
              </button>
              <div className="mt-1 flex items-center justify-between gap-1">
                <span className="truncate text-xs text-muted">{i + 1} · {getDesign(designOf(i)).name}</span>
                <button type="button" disabled={busy} onClick={() => run((f) => downloadPng(f[0].blob, f[0].name), [i])} className="shrink-0 text-xs font-medium text-forest-500 hover:underline disabled:text-muted">
                  PNG
                </button>
              </div>
              {problem && <p className="text-xs text-red-700">{problem}</p>}
            </div>
          )
        })}
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy} onClick={() => run((f) => saveToGallery(f).then((r) => onMessage(r === 'shared' ? '저장할 곳을 선택해 주세요' : r === 'downloaded' ? 'PNG로 내려받았습니다' : '취소되었습니다')))} className={btnPrimary}>
          {busy ? '만드는 중…' : gallery ? '갤러리에 저장' : 'PNG 모두 저장'}
        </button>
        <button type="button" disabled={busy} onClick={() => run((f) => downloadZip(f, fileName(0).replace(/_1\.png$/, '.zip')))} className={btnGhost}>
          전체 ZIP 다운로드
        </button>
        <button type="button" disabled title="다음 단계(카드 편집기)에서 추가됩니다" className={`${btnGhost} cursor-not-allowed opacity-50`}>
          편집기에서 수정
        </button>
      </div>
      {site && <p className="text-xs text-muted">모든 카드 하단에 {site}가 고정 표시되며, 저장 전에 보이는지 자동 검사합니다.</p>}
    </div>
  )
}
