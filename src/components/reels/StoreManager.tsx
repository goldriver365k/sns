import { useState } from 'react'
import Modal from '../Modal'
import { newStore, saveStores, type TteolbokStore } from '../../tteolbok/stores'

const field = 'w-full rounded-lg border border-cream-300 bg-white px-3 py-2 text-sm outline-none focus:border-forest-500'

/** 상호 추가·수정·삭제 (Firestore settings/tteolbok) */
export default function StoreManager({ stores, onClose, onSaved }: { stores: TteolbokStore[]; onClose: () => void; onSaved: (s: TteolbokStore[]) => void }) {
  const [list, setList] = useState(stores.map((s) => ({ ...s })))
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const patch = (i: number, p: Partial<TteolbokStore>) => setList(list.map((s, j) => (j === i ? { ...s, ...p } : s)))

  async function save() {
    const clean = list.filter((s) => s.name.trim() || s.loc.trim())
    setSaving(true)
    setErr(null)
    try {
      await saveStores(clean)
      onSaved(clean)
    } catch {
      setErr('저장하지 못했습니다. 인터넷 연결을 확인한 뒤 다시 저장해 주세요.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title="상호 관리"
      onClose={onClose}
      footer={
        <>
          <button className="rounded-xl border border-cream-300 bg-white px-4 py-2 text-sm" onClick={onClose}>
            닫기
          </button>
          <button className="rounded-xl bg-forest-700 px-4 py-2 text-sm font-semibold text-cream-50 disabled:bg-cream-300" disabled={saving} onClick={save}>
            {saving ? '저장 중…' : '저장'}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {list.map((s, i) => (
          <div key={s.id} className="rounded-xl border border-cream-300 bg-white p-3">
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs text-muted">
                상호
                <input className={field + ' mt-1 text-ink'} value={s.name} maxLength={30} onChange={(e) => patch(i, { name: e.target.value })} />
              </label>
              <label className="text-xs text-muted">
                위치 (선택)
                <input className={field + ' mt-1 text-ink'} value={s.loc} maxLength={30} placeholder="예: 모인관 2층" onChange={(e) => patch(i, { loc: e.target.value })} />
              </label>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted">
              <label className="flex items-center gap-1.5">
                <input type="checkbox" checked={Boolean(s.bg)} onChange={(e) => patch(i, e.target.checked ? { bg: '#3A2418', fg: '#FFF8EE' } : { bg: '', fg: '' })} /> 상호 색 지정
              </label>
              {s.bg && (
                <>
                  <label className="flex items-center gap-1">
                    배경 <input type="color" value={s.bg} onChange={(e) => patch(i, { bg: e.target.value })} />
                  </label>
                  <label className="flex items-center gap-1">
                    글자 <input type="color" value={s.fg || '#ffffff'} onChange={(e) => patch(i, { fg: e.target.value })} />
                  </label>
                  <span className="rounded-full px-3 py-1 text-sm" style={{ background: s.bg, color: s.fg || '#fff' }}>
                    {s.name || '상호'}
                  </span>
                </>
              )}
              <button className="ml-auto text-red-700 hover:underline" onClick={() => setList(list.filter((_, j) => j !== i))}>
                삭제
              </button>
            </div>
          </div>
        ))}
        <button className="rounded-xl border border-dashed border-cream-300 py-2 text-sm text-forest-700 hover:border-forest-500" onClick={() => setList([...list, newStore()])}>
          + 상호 추가
        </button>
        {err && <p className="text-sm text-red-700">{err}</p>}
      </div>
    </Modal>
  )
}
