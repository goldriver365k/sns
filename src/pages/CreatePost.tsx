import { useState } from 'react'
import PageHeader from '../components/PageHeader'
import { IconPhone } from '../components/Icons'
import { BRANDS, LANGUAGES, MAX_TEXT, SNS_TYPES, type Brand, type Language, type SnsType } from '../lib/options'

const fieldLabel = 'mb-2 block text-[15px] font-semibold text-forest-900'
const inputBase =
  'w-full rounded-xl border border-cream-300 bg-white px-4 py-3 text-[15px] outline-none transition focus:border-forest-500 focus:ring-2 focus:ring-forest-100'

function Required() {
  return <span className="ml-0.5 text-forest-500">*</span>
}

export default function CreatePost() {
  const [snsType, setSnsType] = useState<SnsType | ''>('')
  const [brand, setBrand] = useState<Brand>('')
  const [content, setContent] = useState('')
  const [languages, setLanguages] = useState<Language[]>(['ko'])
  const [instructions, setInstructions] = useState('')
  const [notice, setNotice] = useState<string | null>(null)

  const canSubmit = snsType !== '' && content.trim().length > 0 && languages.length > 0

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
          </div>

          <div>
            <label htmlFor="brand" className={fieldLabel}>브랜드</label>
            <select id="brand" value={brand} onChange={(e) => setBrand(e.target.value as Brand)} className={inputBase}>
              {BRANDS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          <div>
            <label htmlFor="content" className={fieldLabel}>SNS 콘텐츠 내용<Required /></label>
            <textarea
              id="content"
              rows={6}
              maxLength={MAX_TEXT}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="SNS에 게시할 콘텐츠의 내용을 간단히 작성해 주세요"
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
    </div>
  )
}
