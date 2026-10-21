import { saveNow, useSaveStatus } from '../../reels/persist'
import { useReelProject } from '../../reels/store'

const time = (d: Date) => d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })

/** 자동 저장 상태 표시 */
export default function SaveIndicator() {
  const s = useSaveStatus()
  const p = useReelProject()
  let text: string
  let tone = 'text-muted'
  if (s.loading) text = '프로젝트를 불러오는 중…'
  else if (s.state === 'error') {
    text = `저장하지 못했습니다: ${s.message ?? ''}`
    tone = 'text-red-700'
  } else if (s.state === 'saving') text = '저장 중…'
  else if (s.state === 'pending') text = '수정됨 · 곧 자동 저장'
  else if (s.state === 'saved') text = s.savedAt ? `자동 저장됨 · ${time(s.savedAt)}` : '저장된 프로젝트'
  else text = p.id ? '저장된 프로젝트' : '내용을 넣으면 자동 저장됩니다'

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs" role="status" aria-live="polite">
      <span className={tone}>{text}</span>
      {s.state === 'error' && (
        <button onClick={() => void saveNow()} className="rounded-md border border-red-300 bg-white px-2 py-0.5 font-medium text-red-700">
          다시 저장
        </button>
      )}
      {s.warning && <span className="text-amber-800">{s.warning}</span>}
    </div>
  )
}
