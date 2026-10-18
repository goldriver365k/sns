import { useState } from 'react'
import PageHeader from '../components/PageHeader'
import Placeholder from '../components/Placeholder'
import { btnPrimary } from '../components/ui'
import { checkServer } from '../lib/api'

const LABELS: Record<string, string> = {
  openaiKey: 'OpenAI API 키 (OPENAI_API_KEY)',
  openaiModel: '모델 이름 (OPENAI_MODEL)',
  imageModel: '이미지 모델 (OPENAI_IMAGE_MODEL)',
  reasoningEffort: '추론 정도 (OPENAI_REASONING_EFFORT)',
  adminEmails: '관리자 이메일 (ADMIN_EMAILS)',
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

export default function OpsSettings() {
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="운영 설정" description="자동 생성 시간, 채널, 주간 편성표를 관리합니다." />
      <ServerCheck />
      <Placeholder step="6단계" items={['자동 생성 시간', '채널 켜기/끄기와 [지금 생성]', '채널별 주간 편성표와 기본 디자인']} />
    </div>
  )
}
