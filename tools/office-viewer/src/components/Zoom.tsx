// 화면 배율: 엑셀·워드 각각 마지막으로 고른 배율을 이 브라우저에 기억한다
const STEPS = [25, 50, 67, 75, 80, 90, 100, 110, 125, 150, 175, 200]
const QUICK = [100, 80, 50]
const key = (kind: string) => `office-viewer.zoom.${kind}`

export function loadZoom(kind: 'sheet' | 'doc'): number | null {
  try {
    const v = Number(localStorage.getItem(key(kind)))
    return v >= 25 && v <= 200 ? v : null
  } catch {
    return null
  }
}
export function saveZoom(kind: 'sheet' | 'doc', z: number) {
  try {
    localStorage.setItem(key(kind), String(z))
  } catch {
    // 저장소를 못 쓰는 환경(사생활 보호 창 등)에서는 기억하지 않는다
  }
}

const btn = 'h-7 w-7 rounded-lg text-base leading-none text-ink hover:bg-cream-200 disabled:opacity-40'

export function ZoomControl({ value, onChange, onFit }: { value: number; onChange: (z: number) => void; onFit?: () => void }) {
  const down = [...STEPS].reverse().find((s) => s < value) ?? STEPS[0]
  const up = STEPS.find((s) => s > value) ?? STEPS[STEPS.length - 1]
  return (
    <div className="flex items-center gap-1 text-sm">
      {/* 자주 쓰는 보기 배율 */}
      <span className="text-xs text-muted">보기</span>
      <div className="mr-1 flex overflow-hidden rounded-lg border border-cream-300 bg-white">
        {QUICK.map((q) => (
          <button
            key={q}
            onClick={() => onChange(q)}
            className={`px-2 py-0.5 text-sm ${value === q ? 'bg-forest-700 font-semibold text-cream-50' : 'text-ink hover:bg-cream-100'}`}
          >
            {q}%
          </button>
        ))}
      </div>
      <button className={btn} onClick={() => onChange(down)} disabled={value <= STEPS[0]} title="축소">
        −
      </button>
      <select
        value={STEPS.includes(value) ? value : ''}
        onChange={(e) => onChange(Number(e.target.value))}
        className="rounded-lg border border-cream-300 bg-white px-1 py-0.5 text-sm"
        title="화면 배율"
      >
        {!STEPS.includes(value) && <option value="">{value}%</option>}
        {STEPS.map((s) => (
          <option key={s} value={s}>
            {s}%
          </option>
        ))}
      </select>
      <button className={btn} onClick={() => onChange(up)} disabled={value >= STEPS[STEPS.length - 1]} title="확대">
        +
      </button>
      {onFit && (
        <button className="rounded-lg px-2 py-1 text-sm text-ink hover:bg-cream-200" onClick={onFit} title="표 너비를 화면에 맞춤">
          화면 맞춤
        </button>
      )}
    </div>
  )
}
