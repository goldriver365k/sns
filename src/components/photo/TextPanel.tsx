import { TEXT_FONTS, type TextAlign, type TextEffect, type TextLayer } from '../../photo/compose'
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

type Layer = Omit<TextLayer, 'id'>
const light = { color: '#ffffff', effect: 'shadow' as const }

/** 포스터 문구 세트: 한 번에 여러 글자를 넣는다 (사진 배경 위에서 잘 읽히게 흰 글자 + 그림자) */
export const POSTER_SETS: { label: string; layers: Layer[] }[] = [
  {
    label: '행사 포스터',
    layers: [
      { text: '가을맞이 특별 행사', x: 0.5, y: 0.14, size: 130, font: 'blackhan', bold: false, box: '', ...light },
      { text: '전 메뉴 20% 할인', x: 0.5, y: 0.25, size: 76, font: 'pretendard', bold: true, box: '', ...light },
      { text: '기간  11.01 ~ 11.30\n장소  화산불백 본점\n문의  010-0000-0000', x: 0.5, y: 0.86, size: 44, font: 'pretendard', bold: true, box: '#111111', color: '#ffffff', align: 'left' },
    ],
  },
  {
    label: '세일 포스터',
    layers: [
      { text: 'SALE', x: 0.5, y: 0.16, size: 260, font: 'blackhan', bold: false, box: '', color: '#ffffff', effect: 'outline' },
      { text: '최대 50%', x: 0.5, y: 0.31, size: 110, font: 'blackhan', bold: false, box: '#d6332a', color: '#ffffff' },
      { text: '11월 한 달 동안', x: 0.5, y: 0.9, size: 56, font: 'pretendard', bold: true, box: '', ...light },
    ],
  },
  {
    label: '메뉴 포스터',
    layers: [
      { text: '오늘의 추천 메뉴', x: 0.5, y: 0.1, size: 70, font: 'jua', bold: false, box: '#1f4d3a', color: '#ffffff' },
      { text: '직화 불고기 덮밥', x: 0.5, y: 0.8, size: 110, font: 'dohyeon', bold: false, box: '', ...light },
      { text: '9,900원', x: 0.5, y: 0.9, size: 80, font: 'dohyeon', bold: false, box: '#f2b705', color: '#111111' },
    ],
  },
  {
    label: '감성 포스터',
    layers: [
      { text: '불로 굽고,\n밥으로 완성하다', x: 0.5, y: 0.2, size: 110, font: 'nanummyeongjo', bold: true, box: '', ...light },
      { text: 'bulbaek.com', x: 0.5, y: 0.93, size: 42, font: 'gowunbatang', bold: false, box: '', ...light },
    ],
  },
]

/** 글자 포스터(그림 없이 글자만) 세트: 밝은 샘플 배경 위에서 잘 읽히게 진한 글자 */
export const TYPO_SETS: { label: string; layers: Layer[] }[] = [
  {
    label: '큰 제목형',
    layers: [
      { text: '오늘의 한마디', x: 0.5, y: 0.14, size: 46, font: 'pretendard', bold: true, box: '', color: '#1f4d3a' },
      { text: '불로 굽고\n밥으로 완성하다', x: 0.5, y: 0.45, size: 150, font: 'blackhan', bold: false, box: '', color: '#111111' },
      { text: 'bulbaek.com', x: 0.5, y: 0.9, size: 44, font: 'pretendard', bold: true, box: '', color: '#111111' },
    ],
  },
  {
    label: '인용문형',
    layers: [
      { text: '“', x: 0.5, y: 0.22, size: 260, font: 'notoserif', bold: true, box: '', color: '#d6332a' },
      { text: '작은 배려가\n큰 신뢰를 만듭니다', x: 0.5, y: 0.48, size: 104, font: 'nanummyeongjo', bold: true, box: '', color: '#111111' },
      { text: '— 오늘의 문장', x: 0.5, y: 0.72, size: 46, font: 'gowunbatang', bold: false, box: '', color: '#555555' },
    ],
  },
  {
    label: '공지형',
    layers: [
      { text: '공지', x: 0.5, y: 0.16, size: 80, font: 'blackhan', bold: false, box: '#d6332a', color: '#ffffff' },
      { text: '11월 30일(토)은\n임시 휴무입니다', x: 0.5, y: 0.46, size: 110, font: 'dohyeon', bold: false, box: '', color: '#111111' },
      { text: '이용에 불편을 드려 죄송합니다', x: 0.5, y: 0.7, size: 50, font: 'pretendard', bold: true, box: '', color: '#333333' },
      { text: '화산불백', x: 0.5, y: 0.9, size: 44, font: 'pretendard', bold: true, box: '', color: '#111111' },
    ],
  },
  {
    label: '숫자 강조형',
    layers: [
      { text: '단 3일', x: 0.5, y: 0.2, size: 90, font: 'dohyeon', bold: false, box: '', color: '#111111' },
      { text: '50%', x: 0.5, y: 0.45, size: 320, font: 'blackhan', bold: false, box: '', color: '#d6332a' },
      { text: '전 메뉴 할인', x: 0.5, y: 0.68, size: 96, font: 'blackhan', bold: false, box: '', color: '#111111' },
      { text: '11.01 – 11.03', x: 0.5, y: 0.86, size: 50, font: 'pretendard', bold: true, box: '', color: '#333333' },
    ],
  },
]

const ALIGNS: { value: TextAlign; label: string }[] = [
  { value: 'left', label: '왼쪽' },
  { value: 'center', label: '가운데' },
  { value: 'right', label: '오른쪽' },
]
const EFFECTS: { value: TextEffect; label: string }[] = [
  { value: 'none', label: '없음' },
  { value: 'shadow', label: '그림자' },
  { value: 'outline', label: '테두리' },
]
const FONT_GROUPS = ['고딕', '명조', '손글씨·디자인'] as const

type Props = {
  texts: TextLayer[]
  selectedId: string | null
  onAdd: (layer: Omit<TextLayer, 'id'>) => void
  /** 포스터 문구 세트처럼 여러 글자를 한 번에 */
  onAddMany: (layers: Omit<TextLayer, 'id'>[]) => void
  onSelect: (id: string) => void
  onChange: (id: string, patch: Partial<TextLayer>, commit: boolean) => void
  onRemove: (id: string) => void
}

/** 글자 넣기: 추가(제목·가격표·할인 띠·감성 문구), 고른 글자의 내용·크기·색·글꼴·띠 바꾸기 */
export default function TextPanel({ texts, selectedId, onAdd, onAddMany, onSelect, onChange, onRemove }: Props) {
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
        <p className="mt-3 mb-2 text-sm font-semibold text-forest-900">포스터 문구 세트</p>
        <div className="grid grid-cols-2 gap-1.5">
          {POSTER_SETS.map((p) => (
            <button key={p.label} type="button" onClick={() => onAddMany(p.layers)} className="rounded-lg border border-cream-300 bg-white px-3 py-2 text-sm text-ink hover:border-forest-500">
              ＋ {p.label}
            </button>
          ))}
        </div>
        <p className="mt-3 mb-2 text-sm font-semibold text-forest-900">글자 포스터 세트 (그림 없이)</p>
        <div className="grid grid-cols-2 gap-1.5">
          {TYPO_SETS.map((p) => (
            <button key={p.label} type="button" onClick={() => onAddMany(p.layers)} className="rounded-lg border border-cream-300 bg-white px-3 py-2 text-sm text-ink hover:border-forest-500">
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
            <input id="text-size" type="range" min={20} max={400} value={cur.size} onChange={(e) => onChange(cur.id, { size: Number(e.target.value) }, false)} onPointerUp={() => onChange(cur.id, {}, true)} className="w-full accent-forest-700" />
          </div>
          <div className="space-y-2">
            <p className="text-sm font-semibold text-forest-900">글꼴 <span className="font-normal text-muted">(모두 상업적 무료)</span></p>
            {FONT_GROUPS.map((g) => (
              <div key={g}>
                <p className="mb-1 text-xs text-muted">{g}</p>
                <div className="flex flex-wrap gap-1.5">
                  {TEXT_FONTS.filter((f) => f.group === g).map((f) => (
                    <button key={f.value} type="button" aria-pressed={cur.font === f.value} onClick={() => onChange(cur.id, { font: f.value }, true)} className={chip(cur.font === f.value)} style={{ fontFamily: `"${f.family}"` }}>
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <button type="button" aria-pressed={cur.bold} onClick={() => onChange(cur.id, { bold: !cur.bold }, true)} className={chip(cur.bold)}>
              <b>굵게</b>
            </button>
          </div>
          <div className="space-y-3">
            <div>
              <p className="mb-1.5 text-sm font-semibold text-forest-900">줄 맞춤</p>
              <div className="flex flex-wrap gap-1.5">
                {ALIGNS.map((a) => (
                  <button key={a.value} type="button" aria-pressed={(cur.align ?? 'center') === a.value} onClick={() => onChange(cur.id, { align: a.value }, true)} className={chip((cur.align ?? 'center') === a.value)}>
                    {a.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-1.5 text-sm font-semibold text-forest-900">글자 효과</p>
              <div className="flex flex-wrap gap-1.5">
                {EFFECTS.map((x) => (
                  <button key={x.value} type="button" aria-pressed={(cur.effect ?? 'none') === x.value} onClick={() => onChange(cur.id, { effect: x.value }, true)} className={chip((cur.effect ?? 'none') === x.value)}>
                    {x.label}
                  </button>
                ))}
              </div>
            </div>
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
