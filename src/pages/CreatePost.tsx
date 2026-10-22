import { useRef, useState } from 'react'
import { brandLanguages, brandSite } from '../../shared/site'
import PageHeader from '../components/PageHeader'
import PostResult, { finalText, type LangResult } from '../components/PostResult'
import ImagePicker from '../components/ImagePicker'
import { useStoredImages } from '../lib/imageStore'
import { IconPhone } from '../components/Icons'
import BrandEditor from '../components/BrandEditor'
import PlanEditor from '../components/PlanEditor'
import { btnLink, fieldLabel, inputBase } from '../components/ui'
import { getSnsProfile, LANGUAGES, MAX_TEXT, SNS_TYPES, type Language, type SnsType } from '../lib/options'
import { newId, todayWeekday, useChannels, type Channel } from '../lib/channels'
import { generatePost } from '../lib/api'
import { copyText } from '../lib/clipboard'
import { newContentId, saveContent, updateContent, type StoredPost } from '../lib/contents'
import { checkReach, type SnsProfile } from '../../shared/sns'
import { pickHashtags } from '../../shared/hashtags'
import type { GenerateRequest, GeneratedPost } from '../../shared/generate'

/** [자동 완성]을 누른 순간의 입력값. 결과를 다시 만들거나 저장할 때 이 값을 쓴다. */
type Run = {
  id: string
  profile: SnsProfile
  languages: string[]
  request: Omit<GenerateRequest, 'language'>
  channelId: string | null
  brandName: string
  siteUrl: string
  defaultDesign: string
  topic: string
  fixedHashtags: string[]
}

/** 노출 검사에서 통과하지 못한 항목 */
function failedChecks(profile: SnsProfile, post: GeneratedPost, fixed: string[]) {
  const hashtags = pickHashtags(post.body, post.hashtags, fixed, profile.hashtags[1])
  return checkReach(profile.value, { title: post.title, body: post.body, hashtags, keyword: post.keyword })
    .filter((c) => !c.ok)
    .map((c) => c.label)
}

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
  // 사진은 넣는 즉시 저장소에 올리고, 이미 저장된 결과가 있으면 사진 목록도 함께 기록한다(다른 기기에서 보이도록)
  const imageIdsRef = useRef<string[]>([])
  const runRef = useRef<Run | null>(null)
  const { images, setImages, error: imageError } = useStoredImages(null, (ids) => {
    imageIdsRef.current = ids
    if (runRef.current && savedRef.current) updateContent(runRef.current.id, { imageIds: ids }).catch(() => setSaveState('error'))
  })
  const [run, setRun] = useState<Run | null>(null)
  const [results, setResultsState] = useState<Record<string, LangResult>>({})
  const resultsRef = useRef<Record<string, LangResult>>({})
  const [approved, setApproved] = useState(false)
  const [saveState, setSaveState] = useState<'saving' | 'saved' | 'error' | null>(null)
  const [autoCopyNotice, setAutoCopyNotice] = useState<string | null>(null)
  const savedRef = useRef(false)
  const saveTimer = useRef<number | undefined>(undefined)
  const resultRef = useRef<HTMLElement>(null)

  const generating = Object.values(results).some((r) => r.status === 'loading' || r.status === 'fixing')

  const profile = getSnsProfile(snsType)
  const brand = channels.find((c) => c.id === brandId)
  const brandLangs = brandLanguages(brand?.name)
  // 음식 브랜드는 AI 이미지에서 실제 메뉴처럼 보이는 음식 사진을 만들지 않는다
  const foodBrand = !!brand && /음식|메뉴|덮밥|맛집|식당|요리|불백|찹찹/.test(`${brand.name} ${brand.description}`)
  const plan = brand?.plans.find((p) => p.id === planId)
  const weeklyPlans = brand?.plans.filter((p) => p.period === 'weekly') ?? []
  const monthlyPlans = brand?.plans.filter((p) => p.period === 'monthly') ?? []

  // 계획을 고르면 내용은 선택 사항이 된다.
  const canSubmit = snsType !== '' && (content.trim().length > 0 || !!plan) && languages.length > 0 && !generating

  /** 브랜드를 바꾸면 오늘 요일의 주간 계획을 기본으로 고른다. */
  function selectBrand(id: string, list: Channel[] = channels) {
    setBrandId(id)
    const today = list.find((c) => c.id === id)?.plans.find((p) => p.period === 'weekly' && p.when === todayWeekday())
    setPlanId(today?.id ?? '')
    const ch = list.find((c) => c.id === id)
    if (ch?.sns && snsType === '') setSnsType(ch.sns)
    // 번역 언어가 정해진 브랜드(Hello Korean)는 한국어 + 그 언어들을 기본으로 고른다
    const langs = brandLanguages(ch?.name)
    if (langs.length) setLanguages(['ko', ...langs] as Language[])
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

  function setResult(lang: string, r: LangResult) {
    resultsRef.current = { ...resultsRef.current, [lang]: r }
    setResultsState(resultsRef.current)
  }

  /** 완료된 언어 결과를 언어 순서대로 모은다. */
  function collectPosts(r: Run): StoredPost[] {
    return r.languages.flatMap((language) => {
      const post = resultsRef.current[language]?.post
      return post && resultsRef.current[language].status === 'done' ? [{ ...post, language }] : []
    })
  }

  /** 결과를 Firestore에 저장한다(처음엔 새 문서, 이후엔 수정). */
  async function persist(r: Run) {
    const posts = collectPosts(r)
    if (posts.length === 0) return
    setSaveState('saving')
    try {
      if (!savedRef.current) {
        await saveContent(r.id, {
          channelId: r.channelId,
          brandName: r.brandName,
          snsType: r.profile.value,
          topic: r.topic,
          fixedHashtags: r.fixedHashtags,
          input: { content: r.request.content, instructions: r.request.instructions, languages: r.languages },
          posts,
          imageIds: imageIdsRef.current,
        })
        savedRef.current = true
      } else {
        await updateContent(r.id, { posts })
      }
      setSaveState('saved')
    } catch {
      setSaveState('error')
    }
  }

  /** 한 언어를 생성하고, 노출 검사에 걸리면 한 번 보완해서 다시 만든다. */
  async function generateOne(r: Run, language: string): Promise<GeneratedPost | null> {
    setResult(language, { status: 'loading' })
    try {
      let post = await generatePost({ ...r.request, language })
      const failed = failedChecks(r.profile, post, r.fixedHashtags)
      if (failed.length > 0) {
        setResult(language, { status: 'fixing', post })
        try {
          const fixed = await generatePost({ ...r.request, language, fix: { previous: post, failed } })
          if (failedChecks(r.profile, fixed, r.fixedHashtags).length <= failed.length) post = fixed
        } catch {
          // 보완에 실패하면 첫 결과를 그대로 쓴다.
        }
      }
      setResult(language, { status: 'done', post })
      return post
    } catch (e) {
      setResult(language, { status: 'error', error: e instanceof Error ? e.message : '생성하지 못했습니다.' })
      return null
    }
  }

  async function startRun(r: Run) {
    setRun(r)
    runRef.current = r
    setApproved(false)
    setAutoCopyNotice(null)
    resultsRef.current = {}
    r.languages.forEach((l) => setResult(l, { status: 'loading' }))
    const posts = await Promise.all(r.languages.map((l) => generateOne(r, l)))
    const firstIndex = posts.findIndex(Boolean)
    if (firstIndex < 0) return
    await persist(r)
    // 생성되자마자 첫 번째 언어 결과를 복사한다(브라우저가 막으면 버튼 안내).
    const ok = await copyText(finalText(r.profile, posts[firstIndex]!, r.fixedHashtags))
    setAutoCopyNotice(ok ? '생성 완료 — 복사되었습니다' : '생성 완료 — [복사하기]를 눌러 주세요')
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit || !profile) return
    savedRef.current = false
    // 모바일에서는 결과가 입력 폼 아래에 있으므로 결과로 이동
    if (window.innerWidth < 1024) setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
    startRun({
      id: newContentId(),
      profile,
      languages: [...languages],
      request: {
        snsType: profile.value,
        content,
        instructions,
        topic: plan?.topic,
        brand: brand && { name: brand.name, siteUrl: brandSite(brand.name, brand.siteUrl), description: brand.description, rules: brand.rules, hashtags: brand.hashtags },
      },
      channelId: brand?.id ?? null,
      brandName: brand?.name ?? '',
      siteUrl: brand ? brandSite(brand.name, brand.siteUrl) : '',
      defaultDesign: brand?.defaultDesign ?? 'simple',
      topic: plan?.topic ?? '',
      fixedHashtags: brand?.hashtags ?? [],
    })
  }

  async function handleRetry(language: string) {
    if (!run) return
    if (await generateOne(run, language)) await persist(run)
  }

  function handleEdit(language: string, post: GeneratedPost) {
    if (!run) return
    setResult(language, { status: 'done', post })
    // 수정 내용은 입력이 멈추고 1초 뒤 자동 저장
    window.clearTimeout(saveTimer.current)
    setSaveState('saving')
    saveTimer.current = window.setTimeout(() => persist(run), 1000)
  }

  async function handleApprove() {
    if (!run) return
    setApproved(true)
    try {
      await updateContent(run.id, { status: 'approved' })
    } catch {
      setApproved(false)
      setSaveState('error')
    }
  }

  function handleRegenerate() {
    if (!run) return
    if (approved) updateContent(run.id, { status: 'draft' }).catch(() => setSaveState('error'))
    startRun(run)
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

          <ImagePicker
            images={images}
            onChange={setImages}
            snsType={snsType}
            brandName={brand?.name ?? ''}
            foodBrand={foodBrand}
            suggestion={content.trim() || plan?.topic || ''}
            isInstagram={profile?.kind === 'cards'}
          />
          {imageError && <p className="-mt-4 text-sm text-red-700">{imageError}</p>}

          <div>
            <span className={fieldLabel}>언어<Required /></span>
            {brandLangs.length > 0 && (
              <button
                type="button"
                onClick={() => setLanguages(['ko', ...brandLangs] as Language[])}
                className="mb-2 rounded-lg border border-forest-700 bg-white px-3 py-1.5 text-sm font-medium text-forest-700"
              >
                {brand?.name}: 한국어 + {brandLangs.map((l) => LANGUAGES.find((x) => x.value === l)?.label).join('·')} 모두 고르기
              </button>
            )}
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
            {generating ? '작성 중…' : '자동 완성'}
          </button>
        </form>

        {/* 오른쪽: 결과 */}
        <section ref={resultRef} className="min-h-[420px] scroll-mt-20 rounded-2xl border border-cream-300 bg-white p-5 sm:p-6">
          {run ? (
            <PostResult
              profile={run.profile}
              languages={run.languages}
              results={results}
              fixedHashtags={run.fixedHashtags}
              images={images}
              onImagesChange={setImages}
              brand={{ name: run.brandName, siteUrl: run.siteUrl, defaultDesign: run.defaultDesign, fileKey: (run.channelId ?? '').replace(/[^a-zA-Z0-9-]/g, '') || 'card' }}
              approved={approved}
              saveState={saveState}
              autoCopyNotice={autoCopyNotice}
              onEdit={handleEdit}
              onRetry={handleRetry}
              onRegenerate={handleRegenerate}
              onApprove={handleApprove}
            />
          ) : (
            <div className="flex h-full min-h-[380px] items-center justify-center text-center">
              <div>
                <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-forest-50 text-forest-700">
                  <IconPhone className="h-10 w-10" />
                </div>
                <p className="mt-5 text-[16px] font-medium text-forest-900">클릭 한 번으로 SNS 게시물을 작성해 드려요!</p>
              </div>
            </div>
          )}
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
