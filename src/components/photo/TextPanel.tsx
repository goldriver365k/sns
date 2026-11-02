import { TEXT_FONTS, type TextLayer } from '../../photo/compose'
import { inputBase } from '../ui'

const COLORS = ['#ffffff', '#111111', '#1f4d3a', '#d6332a', '#f2b705', '#2b6cb0', '#ec6fa0']
const BOXES = [
  { value: '', label: '없음' },
  { value: '#ffffff', label: '흰 띠' },
  { value: '#111111', label: '검은 띠' },
  { value: '#d6332a', label: '빨간 띠' },
  { value: '#1f4d3a', label: '초록 띠' },
  { value: '#f2b705', label: '노란 띠' },
]

/** 글자 추가 버튼의 기본 모양 */
const PRESETS: { label: string; layer: Omit<TextLayer, 'id'> }[] = [
  { label: '제목', layer: { text: '상품 이름', x: 0.5, y: 0.12, size: 84, color: '#111111', font: 'pretendard', bold: true, box: '' } },
  { label: '가격표', layer: { text: '9,900원', x: 0.78, y: 0.2, size: 64, color: '#ffffff', font: 'pretendard', bold: true, box: '#d6332a' } },
  { label: '할인 띠', layer: { text: '오늘만 30% 할인', x: 0.5, y: 0.9, size: 56, color: '#ffffff', font: 'pretendard', bold: true, box: '#111111' } },
  { label: '감성 문구', layer: { text: '불로 굽고, 밥으로 완성하다', x: 0.5, y: 0.88, size: 54, color: '#1f4d3a', font: 'maruburi', bold: true, box: '' } },
]

type Props = {
  texts: TextLayer[]
  selectedId: string | null
  onAdd: (layer: Omit<TextLayer, 'id'>) => void
  onSelect: (id: string) => void
  onChange: (id: string, patch: Partial<TextLayer>, commit: boolean) => void
  onRemove: (id: string) => void
}

/** 글자 넣기: 추가(제목·가격표·할인 띠·감성 문구), 고른 글자의 내용·크기·색·글꼴·띠 바꾸기 */
export default function TextPanel({ texts, selectedId, onAdd, onSelect, onChange, onRemove }: Props) {
  const cur = texts.find((t) => t.id === selectedId) ?? null
  const chip = (on: boolean) => `rounded-full border px-3 py-1.5 text-sm ${on ? 'border-forest-700 bg-forest-700 text-cream-50' : 'border-cream-300 bg-white text-ink'}`

  return (
    <div className="space-y-5">
      <div>
        <p className="mb-2 text-sm font-semibold text-forest-900">글자 추가</p>
        <div className="grid grid-cols-2 gap-1.5">
          {PRESETS.map((p) => (
            <button key={p.label} type="button" onClick={() => onAdd(p.layer)} className="rounded-lg border border-cream-300 bg-white px-3 py-2 text-sm text-ink hover:border-forest-500">
              ＋ {p.label}
            </button>
          ))}
        </div>
      </div>

      {texts.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {texts.map((t, i) => (
            <button key={t.id} type="button" aria-pressed={t.id === selectedId} onClick={() => onSelect(t.id)} className={`${chip(t.id === selectedId)} max-w-full truncate`}>
              {i + 1}. {t.text.split('\n')[0] || '(빈 글자)'}
            </button>
          ))}
        </div>
      )}

      {cur ? (
        <div className="space-y-4 rounded-xl border border-cream-300 bg-white p-3">
          <textarea aria-label="글자 내용" rows={2} maxLength={80} value={cur.text} onChange={(e) => onChange(cur.id, { text: e.target.value }, true)} className={`${inputBase} resize-y px-3 py-2 text-sm`} />
          <div>
            <label htmlFor="text-size" className="text-sm font-semibold text-forest-900">
              크기 <span className="font-normal text-muted">{cur.size}</span>
            </label>
            <input id="text-size" type="range" min={20} max={240} value={cur.size} onChange={(e) => onChange(cur.id, { size: Number(e.target.value) }, false)} onPointerUp={() => onChange(cur.id, {}, true)} className="w-full accent-forest-700" />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {TEXT_FONTS.map((f) => (
              <button key={f.value} type="button" aria-pressed={cur.font === f.value} onClick={() => onChange(cur.id, { font: f.value }, true)} className={chip(cur.font === f.value)} style={{ fontFamily: `"${f.family}"` }}>
                {f.label}
              </button>
            ))}
            <button type="button" aria-pressed={cur.bold} onClick={() => onChange(cur.id, { bold: !cur.bold }, true)} className={chip(cur.bold)}>
              <b>굵게</b>
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {COLORS.map((c) => (
              <button key={c} type="button" aria-label={`글자색 ${c}`} aria-pressed={cur.color === c} onClick={() => onChange(cur.id, { color: c }, true)} className={`h-7 w-7 rounded-full border-2 ${cur.color === c ? 'border-forest-700 ring-2 ring-forest-100' : 'border-cream-300'}`} style={{ background: c }} />
            ))}
            <input type="color" aria-label="글자색 직접 고르기" value={cur.color} onChange={(e) => onChange(cur.id, { color: e.target.value }, true)} className="h-7 w-7 cursor-pointer rounded-full border border-cream-300 bg-white p-0.5" />
          </div>
          <div>
            <p className="mb-1.5 text-sm font-semibold text-forest-900">글자 뒤 띠</p>
            <div className="flex flex-wrap gap-1.5">
              {BOXES.map((b) => (
                <button key={b.label} type="button" aria-pressed={cur.box === b.value} onClick={() => onChange(cur.id, { box: b.value }, true)} className={chip(cur.box === b.value)}>
                  {b.label}
                </button>
              ))}
            </div>
          </div>
          <button type="button" onClick={() => onRemove(cur.id)} className="text-sm text-red-700 hover:underline">
            이 글자 지우기
          </button>
        </div>
      ) : (
        <p className="text-sm text-muted">{texts.length ? '고칠 글자를 사진에서 누르거나 위에서 고르세요. 끌어서 옮기고, 모서리 동그라미로 크기를 바꿉니다.' : '위 버튼으로 글자를 넣은 뒤 사진 위에서 끌어 옮기세요.'}</p>
      )}
      {texts.length > 0 && <p className="text-xs text-muted">글자는 사진 저장·릴스에는 들어가고, AI 제품 영상에는 넣지 않습니다(AI가 글자를 망가뜨릴 수 있어서). 고른 글자는 Delete 키로도 지울 수 있습니다.</p>}
    </div>
  )
}
