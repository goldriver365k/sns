import { useState } from 'react'
import PageHeader from '../components/PageHeader'
import BrandEditor from '../components/BrandEditor'
import PlanEditor from '../components/PlanEditor'
import { btnGhost, btnPrimary } from '../components/ui'
import { checkServer } from '../lib/api'
import { newId, useChannels, type Channel } from '../lib/channels'
import { getSnsProfile } from '../lib/options'
import { getDesign } from '../cards/designs'

const LABELS: Record<string, string> = {
  openaiKey: 'OpenAI API 키 (OPENAI_API_KEY)',
  openaiModel: '모델 이름 (OPENAI_MODEL)',
  imageModel: '이미지 모델 (OPENAI_IMAGE_MODEL)',
  reasoningEffort: '추론 정도 (OPENAI_REASONING_EFFORT)',
  adminEmails: '관리자 이메일 (ADMIN_EMAILS)',
  ttsModel: '털복이 음성 모델 (OPENAI_TTS_MODEL)',
  ttsVoice: '털복이 목소리 (OPENAI_TTS_VOICE)',
}

/** 서버(Netlify Functions)와 환경변수가 제대로 연결됐는지 확인하는 상자 */
function ServerCheck() {
  const [result, setResult] = useState<Record<string, string> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function run() {
    setBusy(true)
    setError(null)
    setResult(null)
    try {
      setResult(await checkServer())
    } catch (e) {
      setError(e instanceof Error ? e.message : '점검하지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="mb-6 rounded-2xl border border-cream-300 bg-cream-50 p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-forest-900">서버 연결 점검</h2>
          <p className="mt-1 text-sm text-muted">Netlify 환경변수가 서버에 들어갔는지 확인합니다. 값은 보여주지 않습니다.</p>
        </div>
        <button onClick={run} disabled={busy} className={btnPrimary}>{busy ? '점검 중…' : '점검하기'}</button>
      </div>
      {error && <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      {result && (
        <dl className="mt-4 divide-y divide-cream-300 rounded-xl border border-cream-300 bg-white text-sm">
          {Object.entries(result).map(([k, v]) => (
            <div key={k} className="flex flex-wrap justify-between gap-2 px-4 py-2.5">
              <dt className="text-muted">{LABELS[k] ?? k}</dt>
              <dd className={v.startsWith('없음') ? 'font-semibold text-red-700' : 'font-medium text-forest-700'}>{v}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  )
}

/** 브랜드 관리: 목록, 수정, 계획 편집, 순서 바꾸기, 추가·삭제 */
function BrandManager() {
  const { channels, error, saveChannel, removeChannel } = useChannels()
  const [editing, setEditing] = useState<{ mode: 'brand' | 'plan' | 'new'; channel: Channel } | null>(null)

  async function move(i: number, dir: -1 | 1) {
    const a = channels[i]
    const b = channels[i + dir]
    if (!a || !b) return
    // 순서 값을 맞바꾼다 (같은 값이면 위치 번호로 다시 매김)
    const ao = a.order === b.order ? i : a.order
    const bo = a.order === b.order ? i + dir : b.order
    await Promise.all([saveChannel({ ...a, order: bo }), saveChannel({ ...b, order: ao })])
  }

  const nextOrder = Math.max(-1, ...channels.map((c) => c.order)) + 1

  return (
    <section className="mb-6 rounded-2xl border border-cream-300 bg-cream-50 p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-forest-900">브랜드 관리</h2>
          <p className="mt-1 text-sm text-muted">"SNS 게시물 만들기"의 브랜드·콘텐츠 계획 칸에 그대로 반영됩니다.</p>
        </div>
        <button
          onClick={() => setEditing({ mode: 'new', channel: { id: newId(), name: '', sns: '', siteUrl: '', description: '', rules: '', hashtags: [], plans: [], order: nextOrder } })}
          className={btnPrimary}
        >
          + 브랜드 추가
        </button>
      </div>
      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}

      <ul className="mt-4 space-y-2">
        {channels.map((c, i) => {
          const weekly = c.plans.filter((p) => p.period === 'weekly').length
          const monthly = c.plans.length - weekly
          return (
            <li key={c.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-cream-300 bg-white px-4 py-3">
              <div className="flex flex-col">
                <button aria-label={`${c.name} 위로`} onClick={() => move(i, -1)} disabled={i === 0} className="px-1 text-xs text-muted disabled:opacity-30">▲</button>
                <button aria-label={`${c.name} 아래로`} onClick={() => move(i, 1)} disabled={i === channels.length - 1} className="px-1 text-xs text-muted disabled:opacity-30">▼</button>
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-forest-900">{c.name}</div>
                <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted">
                  <span>{getSnsProfile(c.sns)?.label ?? 'SNS 미지정'}</span>
                  {c.siteUrl && <span>{c.siteUrl}</span>}
                  <span>카드: {getDesign(c.defaultDesign).name}</span>
                  <span>계획: 주간 {weekly} · 월간 {monthly}</span>
                  {c.hashtags.length > 0 && <span className="text-forest-700">{c.hashtags.join(' ')}</span>}
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setEditing({ mode: 'plan', channel: c })} className={`${btnGhost} px-3 py-2 text-sm`}>계획 편집</button>
                <button onClick={() => setEditing({ mode: 'brand', channel: c })} className={`${btnGhost} px-3 py-2 text-sm`}>수정</button>
              </div>
            </li>
          )
        })}
      </ul>
      {channels.length === 0 && <p className="mt-4 text-center text-sm text-muted">브랜드가 없습니다. [+ 브랜드 추가]를 눌러 주세요.</p>}

      {editing?.mode === 'plan' && <PlanEditor channel={editing.channel} onSave={saveChannel} onClose={() => setEditing(null)} />}
      {(editing?.mode === 'brand' || editing?.mode === 'new') && (
        <BrandEditor
          initial={editing.channel}
          isNew={editing.mode === 'new'}
          onSave={saveChannel}
          onDelete={editing.mode === 'brand' ? () => removeChannel(editing.channel.id) : undefined}
          onClose={() => setEditing(null)}
        />
      )}
    </section>
  )
}

export default function OpsSettings() {
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="운영 설정" description="브랜드와 콘텐츠 계획을 관리하고, 서버 연결 상태를 확인합니다." />
      <BrandManager />
      <ServerCheck />
      <section className="rounded-2xl border border-dashed border-cream-300 bg-cream-50 p-5 text-sm text-muted">
        <span className="font-semibold text-forest-900">매일 자동 생성</span> — 보류 중입니다. 다시 시작하면 생성 시간, 채널 켜기/끄기, [지금 생성]이 이곳에 추가됩니다.
      </section>
    </div>
  )
}
