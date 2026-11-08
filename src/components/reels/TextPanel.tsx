import { REEL_TEXT_FONTS } from '../../reels/render'
import { newSceneId, updateProject } from '../../reels/store'
import type { ReelProject, ReelScene, ReelText, ReelTextFont, ReelTextStyle } from '../../reels/types'
import { field, label, card } from '../ui'

const COLORS = ['#FFFFFF', '#111111', '#FFD43B', '#E8492F', '#1E5B3A', '#2F7DF6']
const STYLES: { id: ReelTextStyle; label: string }[] = [
  { id: 'shadow', label: '그림자' },
  { id: 'outline', label: '테두리' },
  { id: 'box', label: '배경 상자' },
]

type Props = {
  project: ReelProject
  /** 지금 장면 */
  scene: ReelScene | null
  sceneIndex: number
  selected: string | null
  onSelect: (id: string | null) => void
  /** 글자를 넣은 장면이 미리보기에 보이게 */
  onShowScene: () => void
}

export function patchText(id: string, patch: Partial<ReelText>) {
  updateProject((cur) => ({ texts: cur.texts.map((x) => (x.id === id ? { ...x, ...patch } : x)) }))
}

/** 영상 위에 글자 더 넣기: 글자·크기·글꼴·색·꾸미기·위치(미리보기에서 끌기 또는 막대)·보일 범위 */
export default function TextPanel({ project, scene, sceneIndex, selected, onSelect, onShowScene }: Props) {
  // 지금 장면에 보이는 글자: 이 장면 것 + 영상 전체 것
  const visible = project.texts.filter((x) => !x.sceneId || x.sceneId === scene?.id)
  const cur = visible.find((x) => x.id === selected) ?? null

  function add(all: boolean) {
    const t: ReelText = {
      id: newSceneId(),
      sceneId: all ? null : (scene?.id ?? null),
      text: '글자를 입력하세요',
      x: 0.5,
      y: 0.3,
      size: 88,
      color: '#FFFFFF',
      font: 'gothic',
      style: 'outline',
    }
    updateProject((p) => ({ texts: [...p.texts, t] }))
    onSelect(t.id)
    onShowScene()
  }

  function remove(id: string) {
    updateProject((p) => ({ texts: p.texts.filter((x) => x.id !== id) }))
    onSelect(null)
  }

  return (
    <section className={card}>
      <h2 className="mb-1 text-sm font-bold text-forest-900">글자 넣기</h2>
      <p className="mb-2 text-[11px] leading-snug text-muted">자막과 별도로 영상 위에 글자를 더 넣습니다. 미리보기에서 글자를 눌러 끌면 위치가 옮겨집니다.</p>
      <div className="grid grid-cols-2 gap-1.5">
        <button onClick={() => add(false)} disabled={!scene} className="rounded-xl bg-forest-700 py-2 text-xs font-semibold text-cream-50 disabled:opacity-50">
          + 장면 {sceneIndex + 1}에 글자
        </button>
        <button onClick={() => add(true)} className="rounded-xl border border-forest-700 bg-white py-2 text-xs font-semibold text-forest-700">
          + 모든 장면에 글자
        </button>
      </div>

      {visible.length > 0 && (
        <ul className="mt-2 space-y-1">
          {visible.map((x) => (
            <li key={x.id}>
              <button
                onClick={() => onSelect(x.id === selected ? null : x.id)}
                aria-pressed={x.id === selected}
                className={`flex w-full items-center gap-2 rounded-lg border px-2 py-1.5 text-left text-xs ${x.id === selected ? 'border-forest-700 bg-white' : 'border-cream-300 bg-white/60'}`}
              >
                <span className="shrink-0 rounded bg-cream-200 px-1 text-[10px] text-muted">{x.sceneId ? `장면 ${sceneIndex + 1}` : '전체'}</span>
                <span className="truncate">{x.text.replace(/\n/g, ' ') || '(빈 글자)'}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {cur && (
        <div className="mt-3 space-y-2.5 border-t border-cream-300 pt-3">
          <div>
            <label className={label} htmlFor="tx-text">글자 (줄바꿈 가능)</label>
            <textarea id="tx-text" rows={2} value={cur.text} onChange={(e) => patchText(cur.id, { text: e.target.value })} className={`${field} resize-y`} maxLength={80} />
          </div>
          <div>
            <label className={label} htmlFor="tx-size">크기 {cur.size}</label>
            <input id="tx-size" type="range" min={24} max={240} step={2} value={cur.size} onChange={(e) => patchText(cur.id, { size: Number(e.target.value) })} className="w-full accent-forest-700" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={label} htmlFor="tx-font">글꼴</label>
              <select id="tx-font" value={cur.font} onChange={(e) => patchText(cur.id, { font: e.target.value as ReelTextFont })} className={field}>
                {(Object.keys(REEL_TEXT_FONTS) as ReelTextFont[]).map((f) => (
                  <option key={f} value={f}>{REEL_TEXT_FONTS[f].label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={label} htmlFor="tx-style">꾸미기</label>
              <select id="tx-style" value={cur.style} onChange={(e) => patchText(cur.id, { style: e.target.value as ReelTextStyle })} className={field}>
                {STYLES.map((s) => (
                  <option key={s.id} value={s.id}>{s.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <span className={label}>색</span>
            <div className="flex flex-wrap items-center gap-1.5">
              {COLORS.map((c) => (
                <button key={c} onClick={() => patchText(cur.id, { color: c })} aria-label={`색 ${c}`} aria-pressed={cur.color.toUpperCase() === c} className={`h-7 w-7 rounded-full border-2 ${cur.color.toUpperCase() === c ? 'border-forest-700' : 'border-cream-300'}`} style={{ background: c }} />
              ))}
              <input type="color" value={cur.color} onChange={(e) => patchText(cur.id, { color: e.target.value })} aria-label="다른 색" className="h-7 w-9 cursor-pointer rounded border border-cream-300" />
            </div>
          </div>
          <div>
            <span className={label}>위치 (미리보기에서 끌어도 됩니다)</span>
            <div className="mb-1 grid grid-cols-3 gap-1">
              {(
                [
                  ['위', 0.15],
                  ['가운데', 0.5],
                  // 자막(화면 약 80% 높이)과 겹치지 않게 그 아래
                  ['아래', 0.9],
                ] as const
              ).map(([t, y]) => (
                <button key={t} onClick={() => patchText(cur.id, { x: 0.5, y })} className="rounded-lg border border-cream-300 bg-white py-1 text-xs">
                  {t}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-2 text-xs text-muted">
              가로
              <input type="range" min={2} max={98} value={Math.round(cur.x * 100)} onChange={(e) => patchText(cur.id, { x: Number(e.target.value) / 100 })} className="flex-1 accent-forest-700" aria-label="가로 위치" />
            </label>
            <label className="flex items-center gap-2 text-xs text-muted">
              세로
              <input type="range" min={2} max={98} value={Math.round(cur.y * 100)} onChange={(e) => patchText(cur.id, { y: Number(e.target.value) / 100 })} className="flex-1 accent-forest-700" aria-label="세로 위치" />
            </label>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={cur.sceneId ? 'scene' : 'all'}
              onChange={(e) => patchText(cur.id, { sceneId: e.target.value === 'all' ? null : (scene?.id ?? null) })}
              className={field}
              aria-label="보일 범위"
            >
              <option value="scene">장면 {sceneIndex + 1}에만</option>
              <option value="all">모든 장면에</option>
            </select>
            <button onClick={() => remove(cur.id)} className="shrink-0 rounded-lg px-3 py-1.5 text-xs text-red-700 hover:bg-red-50">
              삭제
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
