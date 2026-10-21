import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import ReelPreview from '../../components/reels/ReelPreview'
import { REEL_TEMPLATES } from '../../reels/templates'
import { blankScene, getProject, updateProject } from '../../reels/store'
import type { ReelProject } from '../../reels/types'

/** 디자인: 5종 템플릿을 같은 예시 장면으로 움직이며 보여 주고, 고르면 제작 화면에 적용 */
export default function ReelDesigns() {
  const navigate = useNavigate()
  const sample = useMemo(() => {
    const cur = getProject()
    const scenes = [
      { ...blankScene('점심 고민 끝!'), weight: 2, subtitleAnim: 'pop' as const, effects: ['sparkle' as const], assetId: cur.assets.find((a) => a.kind === 'media')?.id ?? null },
      { ...blankScene('오늘만 특가'), weight: 2, subtitleAnim: 'slideUp' as const, effects: ['priceTag' as const, 'highlight' as const], priceText: '9,900원', motion: 'panLeft' as const, assetId: cur.assets.filter((a) => a.kind === 'media')[1]?.id ?? cur.assets.find((a) => a.kind === 'media')?.id ?? null },
      { ...blankScene('지금 바로 확인하세요'), weight: 2, subtitleAnim: 'typewriter' as const, effects: ['cta' as const, 'fireworks' as const], ctaText: '지금 주문하기', motion: 'zoomOut' as const },
    ]
    return { ...cur, title: '디자인 미리보기', duration: 10, scenes } as ReelProject
  }, [])

  return (
    <div>
      <p className="mb-4 text-sm text-muted">같은 예시 장면을 5가지 디자인으로 보여 줍니다(반짝임·가격표·강조 박스·CTA·불꽃 포함). 제작 화면에서 넣은 사진이 있으면 그 사진으로 보여 줍니다.</p>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
        {REEL_TEMPLATES.map((t) => (
          <div key={t.id} className="rounded-2xl border border-cream-300 bg-cream-50 p-3">
            <ReelPreview project={{ ...sample, template: t.id }} />
            <div className="mt-2 font-semibold text-forest-900">{t.name}</div>
            <p className="mt-0.5 min-h-10 text-xs text-muted">{t.description}</p>
            <button
              onClick={() => {
                updateProject({ template: t.id })
                navigate('/reels')
              }}
              className="mt-2 w-full rounded-lg bg-forest-700 py-2 text-sm font-semibold text-cream-50 hover:bg-forest-900"
            >
              이 디자인으로 만들기
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
