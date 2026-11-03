import { CUSTOM_MAX, CUSTOM_MIN, SIZES, type PhotoSettings, type SizeGroup } from '../../photo/compose'

const GROUPS: SizeGroup[] = ['쇼핑몰', 'SNS', '가로', '인쇄', '기타']

type Props = {
  settings: PhotoSettings
  onChange: (patch: Partial<PhotoSettings>) => void
}

/** 결과 크기 고르기: 쇼핑몰·SNS·가로·기타(원본, 직접 입력) 묶음 + 직접 입력 칸 */
export default function SizePicker({ settings, onChange }: Props) {
  return (
    <div className="space-y-3">
      {GROUPS.map((g) => (
        <div key={g}>
          <p className="mb-1 text-xs font-semibold text-muted">{g}</p>
          <div className="grid gap-1.5">
            {SIZES.filter((s) => s.group === g).map((s) => {
              const on = settings.size === s.id
              return (
                <button key={s.id} type="button" aria-pressed={on} onClick={() => onChange({ size: s.id })} className={`flex items-baseline justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm transition ${on ? 'border-forest-700 bg-forest-700 text-cream-50' : 'border-cream-300 bg-white text-ink hover:border-forest-500'}`}>
                  <span className="font-medium">{s.label}</span>
                  <span className={`text-right text-xs ${on ? 'text-cream-100' : 'text-muted'}`}>{s.hint}</span>
                </button>
              )
            })}
          </div>
        </div>
      ))}
      {settings.size === 'custom' && (
        <div className="flex items-center gap-2 rounded-lg border border-cream-300 bg-white p-3">
          <SizeInput label="가로" value={settings.customW} onChange={(v) => onChange({ customW: v })} />
          <span className="text-muted">×</span>
          <SizeInput label="세로" value={settings.customH} onChange={(v) => onChange({ customH: v })} />
          <span className="text-xs text-muted">px</span>
        </div>
      )}
      {settings.size === 'custom' && <p className="text-xs text-muted">{CUSTOM_MIN}~{CUSTOM_MAX}px 사이로 넣어 주세요.</p>}
    </div>
  )
}

function SizeInput({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="flex flex-1 items-center gap-1.5 text-sm">
      <span className="shrink-0 text-muted">{label}</span>
      <input
        type="number"
        inputMode="numeric"
        min={CUSTOM_MIN}
        max={CUSTOM_MAX}
        step={10}
        value={value}
        // 입력 중에는 범위를 강제하지 않고, 그릴 때 범위 안으로 맞춘다(targetSize)
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        className="w-full rounded-md border border-cream-300 px-2 py-1.5 text-right outline-none focus:border-forest-500"
        aria-label={`${label} 픽셀`}
      />
    </label>
  )
}
