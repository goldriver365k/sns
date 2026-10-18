import { useState } from 'react'
import PageHeader from '../components/PageHeader'
import { IconPhone } from '../components/Icons'
import BrandEditor from '../components/BrandEditor'
import PlanEditor from '../components/PlanEditor'
import { btnLink, fieldLabel, inputBase } from '../components/ui'
import { getSnsProfile, LANGUAGES, MAX_TEXT, SNS_TYPES, type Language, type SnsType } from '../lib/options'
import { newId, todayWeekday, useChannels, type Channel } from '../lib/channels'

function Required() {
  return <span className="ml-0.5 text-forest-500">*</span>
}

export default function CreatePost() {
  const [snsType, setSnsType] = useState<SnsType | ''>('')
  const { channels, error: channelError, saveChannel, removeChannel } = useChannels()
  const [brandId, setBrandId] = useState('')
  const [planId, setPlanId] = useState('')
  /** 열려 있는 편집 창: 브랜드 수정 / 브랜드 추가 / 계획 편집 */
  const [editing, setEditing] = useState<'brand' | 'newBrand' | 'plan' | null>(null)
  const [content, setContent] = useState('')
  const [languages, setLanguages] = useState<Language[]>(['ko'])
  const [instructions, setInstructions] = useState('')
  const [notice, setNotice] = useState<string | null>(null)

  const profile = getSnsProfile(snsType)
  const brand = channels.find((c) => c.id === brandId)
  const plan = brand?.plans.find((p) => p.id === planId)
  const weeklyPlans = brand?.plans.filter((p) => p.period === 'weekly') ?? []
  const monthlyPlans = brand?.plans.filter((p) => p.period === 'monthly') ?? []

  // 계획을 고르면 내용은 선택 사항이 된다.
  const canSubmit = snsType !== '' && (content.trim().length > 0 || !!plan) && languages.length > 0

  /** 브랜드를 바꾸면 오늘 요일의 주간 계획을 기본으로 고른다. */
  function selectBrand(id: string, list: Channel[] = channels) {
    setBrandId(id)
    const today = list.find((c) => c.id === id)?.plans.find((p) => p.period === 'weekly' && p.when === todayWeekday())
    setPlanId(today?.id ?? '')
    const ch = list.find((c) => c.id === id)
    if (ch?.sns && snsType === '') setSnsType(ch.sns)
  }

  async function handleSaveBrand(ch: Channel) {
    await saveChannel(ch)
    if (editing === 'newBrand') selectBrand(ch.id, [...channels, ch])
  }

  async function handleDeleteBrand() {
    if (!brand) return
    await removeChannel(brand.id)
    setBrandId('')
    setPlanId('')
  }

  async function handleSavePlans(ch: Channel) {
    await saveChannel(ch)
    if (!ch.plans.some((p) => p.id === planId)) setPlanId('')
  }

  function toggleLanguage(lang: Language) {
    setLanguages((prev) => (prev.includes(lang) ? prev.filter((l) => l !== lang) : [...prev, lang]))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    // 3단계에서 Netlify Function(OpenAI 호출)과 연결한다.
    setNotice('생성 기능은 다음 단계(스레드 생성)에서 연결됩니다.')
  }

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="SNS 게시물 만들기" description="내용을 입력하고 [자동 완성]을 누르면 바로 게시물을 만들어 드려요." />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        {/* 왼쪽: 입력 폼 */}
        <form onSubmit={handleSubmit} className="space-y-6 rounded-2xl border border-cream-300 bg-cream-50 p-5 sm:p-6">
          <div>
            <label htmlFor="sns" className={fieldLabel}>SNS 종류<Required /></label>
            <select id="sns" value={snsType} onChange={(e) => setSnsType(e.target.value as SnsType)} className={inputBase}>
              <option value="" disabled>선택해 주세요</option>
              {SNS_TYPES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            {profile && (
              <>
                <p className="mt-1 text-xs text-muted">결과: {profile.summary}</p>
                <details className="mt-2 rounded-xl bg-forest-50 px-4 py-3 text-sm" open>
                  <summary className="cursor-pointer font-semibold text-forest-700">{profile.label} 노출 핵심 — 생성할 때 반드시 반영</summary>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-[13px] leading-relaxed text-ink">
                    {profile.essentials.map((e) => <li key={e}>{e}</li>)}
                  </ul>
                </details>
              </>
            )}
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <label htmlFor="brand" className={`${fieldLabel} mb-0`}>브랜드</label>
              <div className="flex gap-3">
                {brand && <button type="button" onClick={() => setEditing('brand')} className={btnLink}>수정</button>}
                <button type="button" onClick={() => setEditing('newBrand')} className={btnLink}>+ 추가</button>
              </div>
            </div>
            <select id="brand" value={brandId} onChange={(e) => selectBrand(e.target.value)} className={inputBase}>
              <option value="">선택 안 함</option>
              {channels.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            {brand?.siteUrl && <p className="mt-1 text-xs text-muted">게시물에 {brand.siteUrl} 주소가 들어갑니다.</p>}
            {brand && brand.hashtags.length > 0 && (
              <p className="mt-1 text-xs text-muted">복사할 때 항상 붙는 해시태그:{' '}
                {brand.hashtags.map((t) => <span key={t} className="mr-1 inline-block text-forest-700">{t}</span>)}
              </p>
            )}
            {brand && profile && brand.hashtags.length > profile.hashtags[1] && (
              <p className="mt-1 text-xs text-red-700">
                {profile.hashtags[1] === 0
                  ? `${profile.label}에는 해시태그를 붙이지 않습니다.`
                  : `${profile.label}는 해시태그 최대 ${profile.hashtags[1]}개라 고정 해시태그 중 앞의 ${profile.hashtags[1]}개만 붙습니다.`}
              </p>
            )}
            {channelError && <p className="mt-1 text-xs text-red-700">{channelError}</p>}
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <label htmlFor="plan" className={`${fieldLabel} mb-0`}>콘텐츠 계획</label>
              {brand && <button type="button" onClick={() => setEditing('plan')} className={btnLink}>계획 편집</button>}
            </div>
            <select id="plan" value={planId} onChange={(e) => setPlanId(e.target.value)} disabled={!brand} className={`${inputBase} disabled:bg-cream-200 disabled:text-muted`}>
              <option value="">{brand ? '계획 없이 직접 입력' : '브랜드를 먼저 선택해 주세요'}</option>
              {weeklyPlans.length > 0 && (
                <optgroup label="주간 계획">
                  {weeklyPlans.map((p) => <option key={p.id} value={p.id}>{p.when} · {p.topic}</option>)}
                </optgroup>
              )}
              {monthlyPlans.length > 0 && (
                <optgroup label="월간 계획">
                  {monthlyPlans.map((p) => <option key={p.id} value={p.id}>{p.when} · {p.topic}</option>)}
                </optgroup>
              )}
            </select>
            {plan?.period === 'weekly' && plan.when === todayWeekday() && <p className="mt-1 text-xs text-muted">오늘({plan.when}요일) 계획이 선택되어 있습니다.</p>}
          </div>

          <div>
            <label htmlFor="content" className={fieldLabel}>SNS 콘텐츠 내용{!plan && <Required />}</label>
            <textarea
              id="content"
              rows={6}
              maxLength={MAX_TEXT}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={plan ? `비워 두면 '${plan.topic}' 계획에 맞춰 작성합니다` : 'SNS에 게시할 콘텐츠의 내용을 간단히 작성해 주세요'}
              className={`${inputBase} resize-y`}
            />
            <div className="mt-1 text-right text-xs text-muted">{content.length}/{MAX_TEXT}</div>
          </div>

          <div>
            <span className={fieldLabel}>언어<Required /></span>
            <div className="flex flex-wrap gap-2">
              {LANGUAGES.map((l) => {
                const on = languages.includes(l.value)
                return (
                  <button
                    key={l.value}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleLanguage(l.value)}
                    className={`rounded-full border px-4 py-2 text-sm transition ${
                      on ? 'border-forest-700 bg-forest-700 text-cream-50' : 'border-cream-300 bg-white text-ink hover:border-forest-500'
                    }`}
                  >
                    {l.label}
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <label htmlFor="inst" className={fieldLabel}>그 외 지시사항</label>
            <textarea
              id="inst"
              rows={4}
              maxLength={MAX_TEXT}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="SNS 게시물 작성을 위해 필요한 요청사항을 작성해 주세요"
              className={`${inputBase} resize-y`}
            />
            <div className="mt-1 text-right text-xs text-muted">{instructions.length}/{MAX_TEXT}</div>
          </div>

          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full rounded-xl bg-forest-700 py-3.5 text-[16px] font-semibold text-cream-50 transition hover:bg-forest-900 disabled:cursor-not-allowed disabled:bg-cream-300 disabled:text-muted"
          >
            자동 완성
          </button>
          {notice && <p className="text-center text-sm text-forest-700">{notice}</p>}
        </form>

        {/* 오른쪽: 결과 */}
        <section className="flex min-h-[420px] items-center justify-center rounded-2xl border border-cream-300 bg-white p-6">
          <div className="text-center">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-forest-50 text-forest-700">
              <IconPhone className="h-10 w-10" />
            </div>
            <p className="mt-5 text-[16px] font-medium text-forest-900">클릭 한 번으로 SNS 게시물을 작성해 드려요!</p>
          </div>
        </section>
      </div>

      {editing === 'brand' && brand && (
        <BrandEditor initial={brand} isNew={false} onSave={handleSaveBrand} onDelete={handleDeleteBrand} onClose={() => setEditing(null)} />
      )}
      {editing === 'newBrand' && (
        <BrandEditor
          initial={{ id: newId(), name: '', sns: snsType, siteUrl: '', description: '', rules: '', hashtags: [], plans: [], order: Math.max(-1, ...channels.map((c) => c.order)) + 1 }}
          isNew
          onSave={handleSaveBrand}
          onClose={() => setEditing(null)}
        />
      )}
      {editing === 'plan' && brand && <PlanEditor channel={brand} onSave={handleSavePlans} onClose={() => setEditing(null)} />}
    </div>
  )
}
