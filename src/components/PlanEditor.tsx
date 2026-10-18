import { useState } from 'react'
import Modal from './Modal'
import { btnGhost, btnPrimary, inputBase } from './ui'
import { newId, WEEKDAYS, type Channel, type PlanItem } from '../lib/channels'

type Period = PlanItem['period']
// 한 줄에 여러 칸을 놓기 위해 너비 지정(w-full)을 뺀 입력 스타일
const cell = inputBase.replace('w-full', '')

const PERIODS: { value: Period; label: string }[] = [
  { value: 'weekly', label: '주간 계획' },
  { value: 'monthly', label: '월간 계획' },
]

export default function PlanEditor({ channel, onSave, onClose }: { channel: Channel; onSave: (ch: Channel) => Promise<void>; onClose: () => void }) {
  const [plans, setPlans] = useState<PlanItem[]>(channel.plans)
  const [period, setPeriod] = useState<Period>('weekly')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const rows = plans.filter((p) => p.period === period)

  function update(id: string, patch: Partial<PlanItem>) {
    setPlans((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)))
  }

  function addRow() {
    const when = period === 'weekly' ? WEEKDAYS[rows.length % 7] : `${rows.length + 1}주차`
    setPlans((prev) => [...prev, { id: newId(), period, when, topic: '' }])
  }

  async function save() {
    setBusy(true)
    setError(null)
    try {
      // 주제가 빈 줄은 저장하지 않는다.
      await onSave({ ...channel, plans: plans.filter((p) => p.topic.trim()).map((p) => ({ ...p, topic: p.topic.trim(), when: p.when.trim() })) })
      onClose()
    } catch {
      setError('저장하지 못했습니다. 네트워크 연결을 확인한 뒤 다시 시도해 주세요.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title={`${channel.name} 계획 편집`}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className={btnGhost}>취소</button>
          <button type="button" onClick={save} disabled={busy} className={btnPrimary}>{busy ? '저장 중…' : '저장'}</button>
        </>
      }
    >
      <div className="mb-4 flex gap-1 rounded-xl bg-cream-200 p-1">
        {PERIODS.map((p) => (
          <button
            key={p.value}
            type="button"
            onClick={() => setPeriod(p.value)}
            className={`flex-1 rounded-lg py-2 text-sm font-medium transition ${period === p.value ? 'bg-white text-forest-900 shadow-sm' : 'text-muted'}`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <ul className="space-y-2">
        {rows.map((row) => (
          <li key={row.id} className="flex items-center gap-2">
            {period === 'weekly' ? (
              <select aria-label="요일" value={row.when} onChange={(e) => update(row.id, { when: e.target.value })} className={`${cell} w-20 shrink-0 px-3`}>
                {WEEKDAYS.map((d) => <option key={d}>{d}</option>)}
              </select>
            ) : (
              <input aria-label="시기" value={row.when} onChange={(e) => update(row.id, { when: e.target.value })} placeholder="1주차" className={`${cell} w-24 shrink-0 px-3`} />
            )}
            <input aria-label="주제" value={row.topic} onChange={(e) => update(row.id, { topic: e.target.value })} placeholder="주제" className={`${cell} min-w-0 flex-1`} />
            <button type="button" aria-label="삭제" onClick={() => setPlans((prev) => prev.filter((p) => p.id !== row.id))} className="shrink-0 rounded-lg px-2 py-2 text-sm text-muted hover:bg-red-50 hover:text-red-700">
              삭제
            </button>
          </li>
        ))}
      </ul>
      {rows.length === 0 && <p className="py-4 text-center text-sm text-muted">아직 {period === 'weekly' ? '주간' : '월간'} 계획이 없습니다.</p>}
      <button type="button" onClick={addRow} className="mt-3 w-full rounded-xl border border-dashed border-cream-300 py-2.5 text-sm font-medium text-forest-700 hover:border-forest-500">
        + 줄 추가
      </button>
      {period === 'monthly' && <p className="mt-2 text-xs text-muted">시기는 자유롭게 적습니다. 예) 1주차, 15일, 월말</p>}
      {error && <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
    </Modal>
  )
}
