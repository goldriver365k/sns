import { useState } from 'react'
import Modal from './Modal'
import { btnDanger, btnGhost, btnPrimary, fieldLabel, inputBase } from './ui'
import { SNS_TYPES } from '../lib/options'
import type { Channel } from '../lib/channels'
import { parseHashtags } from '../../shared/hashtags'
import { DESIGNS } from '../cards/designs'

type Props = {
  /** 수정할 브랜드. 새로 추가할 때는 빈 값이 들어온다. */
  initial: Channel
  isNew: boolean
  onSave: (ch: Channel) => Promise<void>
  onDelete?: () => Promise<void>
  onClose: () => void
}

export default function BrandEditor({ initial, isNew, onSave, onDelete, onClose }: Props) {
  const [ch, setCh] = useState<Channel>(initial)
  // 해시태그는 입력하는 동안 글자 그대로 두고, 저장할 때 정리한다.
  const [tagText, setTagText] = useState(initial.hashtags.join(' '))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = <K extends keyof Channel>(key: K, value: Channel[K]) => setCh((prev) => ({ ...prev, [key]: value }))

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setError(null)
    try {
      await action()
      onClose()
    } catch {
      setError('저장하지 못했습니다. 네트워크 연결을 확인한 뒤 다시 시도해 주세요.')
    } finally {
      setBusy(false)
    }
  }

  function handleDelete() {
    if (!onDelete) return
    if (!confirm(`'${initial.name}' 브랜드와 계획을 삭제할까요?`)) return
    run(onDelete)
  }

  return (
    <Modal
      title={isNew ? '브랜드 추가' : '브랜드 수정'}
      onClose={onClose}
      footer={
        <>
          {!isNew && onDelete && (
            <button type="button" onClick={handleDelete} disabled={busy} className={btnDanger}>삭제</button>
          )}
          <button type="button" onClick={onClose} className={btnGhost}>취소</button>
          <button type="button" disabled={busy || !ch.name.trim()} onClick={() => run(() => onSave({ ...ch, name: ch.name.trim(), hashtags: parseHashtags(tagText) }))} className={btnPrimary}>
            {busy ? '저장 중…' : '저장'}
          </button>
        </>
      }
    >
      <div className="space-y-5">
        <div>
          <label htmlFor="b-name" className={fieldLabel}>브랜드 이름</label>
          <input id="b-name" value={ch.name} onChange={(e) => set('name', e.target.value)} className={inputBase} placeholder="예) 화산불백" />
        </div>
        <div>
          <label htmlFor="b-sns" className={fieldLabel}>주로 쓰는 SNS</label>
          <select id="b-sns" value={ch.sns} onChange={(e) => set('sns', e.target.value as Channel['sns'])} className={inputBase}>
            <option value="">정하지 않음</option>
            {SNS_TYPES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="b-design" className={fieldLabel}>인스타그램 카드 기본 디자인</label>
          <select id="b-design" value={ch.defaultDesign ?? 'simple'} onChange={(e) => set('defaultDesign', e.target.value)} className={inputBase}>
            {DESIGNS.map((d) => <option key={d.id} value={d.id}>{d.name} — {d.fontLabel}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="b-url" className={fieldLabel}>사이트 주소</label>
          <input id="b-url" value={ch.siteUrl} onChange={(e) => set('siteUrl', e.target.value)} className={inputBase} placeholder="예) bulbaek.com" />
          <p className="mt-1 text-xs text-muted">입력하면 생성되는 모든 게시물에 이 주소가 들어갑니다.</p>
        </div>
        <div>
          <label htmlFor="b-tags" className={fieldLabel}>고정 해시태그</label>
          <input id="b-tags" value={tagText} onChange={(e) => setTagText(e.target.value)} className={inputBase} placeholder="#화산불백 #불백" />
          <p className="mt-1 text-xs text-muted">한 번 정해 두면 [복사하기]를 누를 때마다 글 끝에 항상 붙습니다. 띄어쓰기나 쉼표로 구분하고 #은 빼도 됩니다.</p>
        </div>
        <div>
          <label htmlFor="b-desc" className={fieldLabel}>브랜드 설명</label>
          <textarea id="b-desc" rows={2} value={ch.description} onChange={(e) => set('description', e.target.value)} className={`${inputBase} resize-y`} />
        </div>
        <div>
          <label htmlFor="b-rules" className={fieldLabel}>항상 지킬 규칙</label>
          <textarea id="b-rules" rows={3} value={ch.rules} onChange={(e) => set('rules', e.target.value)} className={`${inputBase} resize-y`} placeholder="예) 확인되지 않은 수치는 쓰지 않는다" />
        </div>
        {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      </div>
    </Modal>
  )
}
