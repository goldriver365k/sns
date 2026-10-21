import { useState } from 'react'
import { sceneTimes } from '../../reels/store'
import type { ReelPlayer } from '../../reels/player'
import type { ReelProject } from '../../reels/types'

type Props = {
  project: ReelProject
  player: ReelPlayer
  selected: string | null
  onSelect: (id: string) => void
  onReorder: (from: number, to: number) => void
  onAdd: () => void
}

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}.${Math.floor((s % 1) * 10)}`

/** 장면별 타임라인: 길이 비율대로 칸이 나뉘고, 누르면 그 장면으로 이동, 끌어서 순서 변경 */
export default function Timeline({ project, player, selected, onSelect, onReorder, onAdd }: Props) {
  const times = sceneTimes(project)
  const [dragFrom, setDragFrom] = useState<number | null>(null)
  const assets = new Map(project.assets.map((a) => [a.id, a]))

  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-xs text-muted">
        <span>
          {fmt(player.time)} / {fmt(project.duration)} · 장면 {project.scenes.length}개
        </span>
        <button onClick={onAdd} className="rounded-lg border border-cream-300 bg-white px-3 py-1 text-sm text-forest-700 hover:border-forest-500">+ 장면 추가</button>
      </div>
      <div className="relative overflow-x-auto">
        <div className="relative flex min-w-[560px] gap-1">
          {project.scenes.map((s, i) => {
            const a = s.assetId ? assets.get(s.assetId) : undefined
            const on = selected === s.id
            return (
              <button
                key={s.id}
                draggable
                onDragStart={() => setDragFrom(i)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  if (dragFrom !== null && dragFrom !== i) onReorder(dragFrom, i)
                  setDragFrom(null)
                }}
                onClick={() => {
                  onSelect(s.id)
                  player.setRange(null)
                  // 장면이 바뀌며 나타나는 0.25초를 지난 화면에서 멈춘다
                  player.seek(times[i].start + Math.min(0.3, times[i].len / 2))
                }}
                style={{ flexGrow: s.weight, flexBasis: 0 }}
                className={`relative h-24 min-w-14 overflow-hidden rounded-lg border-2 text-left transition ${on ? 'border-forest-700' : 'border-cream-300 hover:border-forest-500'} ${dragFrom === i ? 'opacity-50' : ''}`}
                aria-label={`장면 ${i + 1}`}
                title="누르면 이 장면으로 이동, 끌어서 순서를 바꿉니다"
              >
                {a ? (
                  a.type === 'image' ? <img src={a.url} alt="" className="absolute inset-0 h-full w-full object-cover opacity-60" /> : <video src={a.url} muted className="absolute inset-0 h-full w-full object-cover opacity-60" />
                ) : (
                  <span className="absolute inset-0 bg-cream-200" />
                )}
                <span className="relative block px-1.5 pt-1 text-[11px] font-bold text-forest-900">{i + 1} · {times[i].len.toFixed(1)}초</span>
                <span className="relative line-clamp-2 px-1.5 text-[11px] leading-tight text-ink">{s.text || '(자막 없음)'}</span>
                {s.effects.length > 0 && <span className="absolute right-1 bottom-1 rounded bg-forest-700 px-1 text-[10px] text-cream-50">효과 {s.effects.length}</span>}
              </button>
            )
          })}
          {/* 재생 위치 */}
          <span className="pointer-events-none absolute top-0 bottom-0 w-0.5 bg-red-600" style={{ left: `${Math.min(100, (player.time / project.duration) * 100)}%` }} />
        </div>
      </div>
      <input
        type="range"
        aria-label="재생 위치"
        min={0}
        max={project.duration}
        step={0.05}
        value={player.time}
        onChange={(e) => {
          player.setRange(null)
          player.seek(Number(e.target.value))
        }}
        className="mt-2 w-full accent-forest-700"
      />
    </div>
  )
}
