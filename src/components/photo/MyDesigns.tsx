import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { deleteDesign, listDesigns, type DesignListItem } from '../../photo/designs'
import { getEditor } from '../../photo/editorStore'

const when = (d: Date | null) => (d ? `${d.getMonth() + 1}.${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : '')

/** 홈 화면의 내 디자인: 편집기에서 자동 저장한 작업 목록 (눌러서 이어서 편집, × 로 삭제) */
export default function MyDesigns() {
  const navigate = useNavigate()
  const [items, setItems] = useState<DesignListItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [opening, setOpening] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    listDesigns()
      .then((list) => alive && setItems(list))
      .catch((e) => {
        console.error('내 디자인 목록 실패', e)
        if (alive) setError('내 디자인을 불러오지 못했습니다. 네트워크를 확인해 주세요.')
      })
    return () => {
      alive = false
    }
  }, [])

  async function open(item: DesignListItem) {
    // 지금 편집기에 열려 있는 디자인이면 그대로 이어서
    if (getEditor().doc?.designId === item.id) return navigate('/photo/edit')
    setOpening(item.id)
    setError(null)
    try {
      const { openDesign } = await import('../../photo/openDesign')
      await openDesign(item)
      navigate('/photo/edit')
    } catch (e) {
      setError(e instanceof Error ? e.message : '디자인을 열지 못했습니다.')
      setOpening(null)
    }
  }

  async function remove(item: DesignListItem) {
    if (!window.confirm(`"${item.title}" 디자인을 지울까요? 저장된 사진도 함께 지워집니다.`)) return
    try {
      await deleteDesign(item)
      setItems((list) => list?.filter((x) => x.id !== item.id) ?? null)
    } catch {
      setError('지우지 못했습니다. 다시 시도해 주세요.')
    }
  }

  return (
    <section aria-label="내 디자인" className="mt-10">
      <h2 className="mb-3 text-lg font-bold text-forest-900">내 디자인</h2>
      {error && <p className="mb-2 text-sm text-red-700">{error}</p>}
      {items === null && !error && <p className="text-sm text-muted">불러오는 중…</p>}
      {items?.length === 0 && <p className="rounded-2xl border border-dashed border-cream-300 bg-cream-50 p-6 text-sm text-muted">편집기에서 만든 사진은 여기에 자동으로 저장됩니다. 다른 기기에서도 이어서 편집할 수 있습니다.</p>}
      {!!items?.length && (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {items.map((it) => (
            <li key={it.id} className="group relative overflow-hidden rounded-2xl border border-cream-300 bg-white">
              <button type="button" onClick={() => open(it)} disabled={!!opening} className="block w-full text-left disabled:opacity-60">
                <span className="flex aspect-square items-center justify-center bg-cream-100">
                  {it.thumbnail ? <img src={it.thumbnail} alt="" className="max-h-full max-w-full object-contain" /> : <span className="text-xs text-muted">미리보기 없음</span>}
                </span>
                <span className="block truncate px-3 pt-2 text-sm font-medium text-ink">{opening === it.id ? '여는 중…' : it.title}</span>
                <span className="block px-3 pb-2 text-xs text-muted">{when(it.updatedAt)}</span>
              </button>
              <button type="button" aria-label={`${it.title} 지우기`} onClick={() => remove(it)} className="absolute top-1.5 right-1.5 h-7 w-7 rounded-full bg-black/55 text-sm text-white opacity-80 hover:bg-red-600 hover:opacity-100">
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
