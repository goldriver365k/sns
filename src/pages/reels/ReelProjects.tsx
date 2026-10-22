import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { btnPrimary } from '../../components/ui'
import { listReelDocs, type ReelListItem } from '../../reels/cloud'
import { deleteProject, newProject, openProject, useSaveStatus } from '../../reels/persist'
import { useReelProject } from '../../reels/store'
import { REEL_TEMPLATES } from '../../reels/templates'

const when = (d: Date | null) =>
  d ? d.toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '저장 중'

/** 내 프로젝트: 자동 저장된 릴스 목록 → 열어서 다시 편집, 삭제 */
export default function ReelProjects() {
  const navigate = useNavigate()
  const current = useReelProject()
  const status = useSaveStatus()
  const [items, setItems] = useState<ReelListItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    listReelDocs()
      .then((list) => alive && setItems(list))
      .catch(() => alive && setError('프로젝트 목록을 불러오지 못했습니다. 네트워크를 확인해 주세요.'))
    return () => {
      alive = false
    }
    // 저장이 끝날 때마다 목록을 새로 받는다
  }, [status.savedAt])

  async function open(id: string) {
    setError(null)
    setBusyId(id)
    try {
      if (current.id !== id) await openProject(id)
      navigate('/reels')
    } catch (e) {
      setError(e instanceof Error ? e.message : '프로젝트를 열지 못했습니다.')
    } finally {
      setBusyId(null)
    }
  }

  async function remove(item: ReelListItem) {
    if (!confirm(`"${item.title}" 프로젝트를 삭제할까요? 넣은 사진·영상 파일도 함께 지워지며 되돌릴 수 없습니다.`)) return
    setError(null)
    setBusyId(item.id)
    try {
      await deleteProject(item.id, [...(item.assets ?? []).map((a) => a.id), ...(item.audio?.musicFile ? [item.audio.musicFile.id] : [])])
      setItems((list) => list?.filter((x) => x.id !== item.id) ?? null)
    } catch {
      setError('삭제하지 못했습니다. 네트워크를 확인해 주세요.')
    } finally {
      setBusyId(null)
    }
  }

  async function startNew() {
    await newProject()
    navigate('/reels')
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">만든 릴스는 자동으로 저장됩니다. 눌러서 열면 이어서 편집하고 MP4를 다시 만들 수 있습니다.</p>
        <button onClick={startNew} className={btnPrimary}>
          + 새 프로젝트
        </button>
      </div>
      {error && <p className="text-sm text-red-700">{error}</p>}
      {items === null && !error && <p className="text-sm text-muted">불러오는 중…</p>}
      {items?.length === 0 && (
        <div className="rounded-2xl border border-dashed border-cream-300 bg-cream-50 p-8 text-center text-sm text-muted">
          아직 저장된 프로젝트가 없습니다. [자동 릴스] 탭에서 대본이나 사진을 넣으면 자동으로 저장됩니다.
        </div>
      )}
      {!!items?.length && (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {items.map((it) => {
            const videos = (it.assets ?? []).filter((a) => a.type === 'video').length
            const isCurrent = current.id === it.id
            return (
              <li key={it.id} className={`overflow-hidden rounded-2xl border bg-cream-50 ${isCurrent ? 'border-forest-700' : 'border-cream-300'}`}>
                <button onClick={() => open(it.id)} disabled={!!busyId} className="block w-full text-left" aria-label={`${it.title} 열기`}>
                  <div className="aspect-[9/16] w-full bg-cream-200">
                    {it.thumbnail && <img src={it.thumbnail} alt="" className="h-full w-full object-cover" />}
                  </div>
                  <div className="p-2.5">
                    <div className="truncate text-sm font-semibold text-forest-900">{it.title || '제목 없음'}</div>
                    <div className="mt-0.5 text-[11px] text-muted">
                      {it.duration}초 · {REEL_TEMPLATES.find((t) => t.id === it.template)?.name ?? ''} · 장면 {it.scenes?.length ?? 0}개
                      {videos > 0 && ` · 영상 ${videos}개`}
                    </div>
                    <div className="text-[11px] text-muted">{when(it.updatedAt)}</div>
                    {isCurrent && <div className="mt-0.5 text-[11px] font-semibold text-forest-700">지금 편집 중</div>}
                    {busyId === it.id && <div className="mt-0.5 text-[11px] text-forest-700">처리 중…</div>}
                  </div>
                </button>
                <div className="flex border-t border-cream-300">
                  <button onClick={() => open(it.id)} disabled={!!busyId} className="flex-1 py-2 text-xs font-medium text-forest-700 hover:bg-cream-100">
                    열기
                  </button>
                  <button onClick={() => remove(it)} disabled={!!busyId} className="flex-1 border-l border-cream-300 py-2 text-xs text-red-700 hover:bg-red-50">
                    삭제
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
      <p className="text-[11px] leading-snug text-muted">
        사진·로고·캐릭터는 어느 기기에서나 보입니다. 영상 파일은 넣은 기기의 브라우저에만 저장되므로, 다른 기기에서 열면 [다시 넣기]로 같은 영상을 넣어 주세요. 브라우저의 "사이트 데이터 삭제"를 하면 이 기기에 저장된 영상도 지워집니다.
      </p>
    </div>
  )
}
