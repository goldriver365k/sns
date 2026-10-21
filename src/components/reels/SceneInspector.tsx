import { sceneTimes } from '../../reels/store'
import type { ReelPlayer } from '../../reels/player'
import type { EffectId, MotionId, ReelProject, ReelScene, SubtitleAnim } from '../../reels/types'

const MOTIONS: { id: MotionId; label: string }[] = [
  { id: 'zoomIn', label: '천천히 확대' },
  { id: 'zoomOut', label: '천천히 축소' },
  { id: 'panLeft', label: '왼쪽으로 이동' },
  { id: 'panRight', label: '오른쪽으로 이동' },
  { id: 'none', label: '움직임 없음' },
]
const ANIMS: { id: SubtitleAnim; label: string }[] = [
  { id: 'pop', label: '톡 튀어나오기' },
  { id: 'slideUp', label: '아래에서 올라오기' },
  { id: 'typewriter', label: '타자 치듯' },
  { id: 'fade', label: '서서히 나타나기' },
]
const EFFECTS: { id: EffectId; label: string }[] = [
  { id: 'sparkle', label: '반짝임' },
  { id: 'fireworks', label: '불꽃' },
  { id: 'highlight', label: '강조 박스' },
  { id: 'priceTag', label: '가격표' },
  { id: 'cta', label: 'CTA 버튼' },
]

const field = 'w-full rounded-lg border border-cream-300 bg-white px-3 py-2 text-sm outline-none focus:border-forest-500'
const label = 'mb-1 block text-xs font-semibold text-muted'

type Props = {
  project: ReelProject
  scene: ReelScene
  player: ReelPlayer
  onChange: (patch: Partial<ReelScene>) => void
  onMove: (dir: -1 | 1) => void
  onDuplicate: () => void
  onDelete: () => void
}

/** 선택한 장면 설정: 자막, 길이, 사진·영상, 움직임, 자막 효과, 모션그래픽 */
export default function SceneInspector({ project, scene, player, onChange, onMove, onDuplicate, onDelete }: Props) {
  const index = project.scenes.findIndex((s) => s.id === scene.id)
  const t = sceneTimes(project)[index]
  const media = project.assets.filter((a) => a.kind === 'media')
  const characters = project.assets.filter((a) => a.kind === 'character')
  const looping = !!player.range && Math.abs(player.range[0] - t.start) < 0.001

  function toggleEffect(id: EffectId) {
    onChange({ effects: scene.effects.includes(id) ? scene.effects.filter((e) => e !== id) : [...scene.effects, id] })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-forest-900">장면 {index + 1} 설정 <span className="font-normal text-muted">· {t.start.toFixed(1)}~{(t.start + t.len).toFixed(1)}초</span></h3>
        <div className="flex flex-wrap gap-1 text-sm">
          <button
            onClick={() => {
              if (looping) player.setRange(null)
              else {
                player.setRange([t.start, t.start + t.len])
                player.play()
              }
            }}
            className={`rounded-lg px-3 py-1.5 ${looping ? 'bg-forest-700 text-cream-50' : 'border border-cream-300 bg-white'}`}
          >
            {looping ? '■ 반복 끄기' : '▶ 이 장면만 미리보기'}
          </button>
          <button onClick={() => onMove(-1)} disabled={index === 0} className="rounded-lg border border-cream-300 bg-white px-2 py-1.5 disabled:opacity-40" aria-label="앞으로">◀</button>
          <button onClick={() => onMove(1)} disabled={index === project.scenes.length - 1} className="rounded-lg border border-cream-300 bg-white px-2 py-1.5 disabled:opacity-40" aria-label="뒤로">▶</button>
          <button onClick={onDuplicate} className="rounded-lg border border-cream-300 bg-white px-3 py-1.5">복제</button>
          <button onClick={onDelete} disabled={project.scenes.length <= 1} className="rounded-lg px-3 py-1.5 text-red-700 hover:bg-red-50 disabled:opacity-40">삭제</button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-3">
          <div>
            <label className={label} htmlFor="sc-text">자막</label>
            <textarea id="sc-text" rows={3} value={scene.text} onChange={(e) => onChange({ text: e.target.value })} className={`${field} resize-y`} placeholder="이 장면에 나올 자막" />
          </div>
          <div>
            <label className={label} htmlFor="sc-len">장면 길이 비율 {scene.weight} → 약 {t.len.toFixed(1)}초</label>
            <input id="sc-len" type="range" min={1} max={12} value={scene.weight} onChange={(e) => onChange({ weight: Number(e.target.value) })} className="w-full accent-forest-700" />
          </div>
          <div>
            <span className={label}>사진·영상</span>
            <div className="flex flex-wrap gap-1.5">
              <button onClick={() => onChange({ assetId: null })} className={`h-14 w-10 rounded-md border-2 text-[10px] ${!scene.assetId ? 'border-forest-700' : 'border-cream-300'} bg-cream-100`}>없음</button>
              {media.map((a) => (
                <button key={a.id} onClick={() => onChange({ assetId: a.id })} aria-pressed={scene.assetId === a.id} className={`relative h-14 w-10 overflow-hidden rounded-md border-2 ${scene.assetId === a.id ? 'border-forest-700' : 'border-transparent'}`}>
                  {a.type === 'image' ? <img src={a.url} alt="" className="h-full w-full object-cover" /> : <video src={a.url} muted className="h-full w-full object-cover" />}
                  {a.type === 'video' && <span className="absolute right-0 bottom-0 bg-black/60 px-0.5 text-[9px] text-white">영상</span>}
                </button>
              ))}
            </div>
            {media.length === 0 && <p className="mt-1 text-xs text-muted">왼쪽 자료에서 사진·영상을 먼저 넣어 주세요.</p>}
          </div>
          {characters.length > 0 && (
            <div>
              <label className={label} htmlFor="sc-char">캐릭터</label>
              <select id="sc-char" value={scene.characterId ?? ''} onChange={(e) => onChange({ characterId: e.target.value || null })} className={field}>
                <option value="">없음</option>
                {characters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}
        </div>

        <div className="space-y-3">
          <div>
            <label className={label} htmlFor="sc-motion">사진 움직임</label>
            <select id="sc-motion" value={scene.motion} onChange={(e) => onChange({ motion: e.target.value as MotionId })} className={field}>
              {MOTIONS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </div>
          <div>
            <label className={label} htmlFor="sc-anim">자막 움직임</label>
            <select id="sc-anim" value={scene.subtitleAnim} onChange={(e) => onChange({ subtitleAnim: e.target.value as SubtitleAnim })} className={field}>
              {ANIMS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </div>
          <div>
            <span className={label}>모션그래픽</span>
            <div className="flex flex-wrap gap-1.5">
              {EFFECTS.map((e) => {
                const on = scene.effects.includes(e.id)
                return (
                  <button key={e.id} onClick={() => toggleEffect(e.id)} aria-pressed={on} className={`rounded-full border px-3 py-1 text-xs ${on ? 'border-forest-700 bg-forest-700 text-cream-50' : 'border-cream-300 bg-white'}`}>
                    {e.label}
                  </button>
                )
              })}
            </div>
          </div>
          {scene.effects.includes('priceTag') && (
            <div>
              <label className={label} htmlFor="sc-price">가격표 글자</label>
              <input id="sc-price" value={scene.priceText} onChange={(e) => onChange({ priceText: e.target.value })} className={field} placeholder="예) 9,900원" />
            </div>
          )}
          {scene.effects.includes('cta') && (
            <div>
              <label className={label} htmlFor="sc-cta">CTA 버튼 글자</label>
              <input id="sc-cta" value={scene.ctaText} onChange={(e) => onChange({ ctaText: e.target.value })} className={field} placeholder="예) 지금 주문하기" />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
