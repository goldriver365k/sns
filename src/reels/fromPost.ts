import type { GeneratedPost } from '../../shared/generate'
import { composeCopyText } from '../../shared/hashtags'
import type { SnsProfile } from '../../shared/sns'
import { ensureSiteLink } from '../../shared/site'
import type { PickedImage } from '../lib/images'
import { loadAsset } from './assets'
import { newProject, saveNow } from './persist'
import { updateProject } from './store'
import { maxScenesFor, splitScript } from './storyboard'
import type { ReelAsset, ReelDuration } from './types'

/**
 * SNS 게시물 만들기의 인스타그램 결과를 자동 릴스 새 프로젝트로 옮긴다.
 * - 카드 3장의 제목·본문·강조 문구 → 대본(한 줄 = 한 장면) → 장면 나누기
 * - 게시물 사진 → 사진 자료(장면에 순서대로 배정)
 * - 언어별 캡션(해시태그·사이트 링크 포함) → 릴스 인스타그램 캡션
 * 지금 편집 중인 릴스는 먼저 저장된다.
 */
export type PostForReel = {
  profile: SnsProfile
  posts: { language: string; post: GeneratedPost }[]
  fixedHashtags: string[]
  images: PickedImage[]
  brandId: string | null
  siteUrl: string
  topic: string
}

const DURATION: ReelDuration = 15

/** 카드 글을 대본 줄로: 제목 → 본문 줄들 → 강조 문구, 같은 줄은 한 번만 */
export function scriptFromCards(post: GeneratedPost) {
  const seen = new Set<string>()
  const lines: string[] = []
  for (const c of post.cards) {
    for (const raw of [c.title, ...c.body.split('\n'), c.emphasis]) {
      const l = raw.replace(/\s+/g, ' ').trim()
      if (l && !seen.has(l)) {
        seen.add(l)
        lines.push(l)
      }
    }
  }
  return lines.join('\n')
}

export async function reelFromPost(src: PostForReel) {
  const main = src.posts.find((p) => p.language === 'ko') ?? src.posts[0]
  if (!main) throw new Error('옮길 게시물이 없습니다.')
  const script = scriptFromCards(main.post) || main.post.body
  await newProject()

  const assets: ReelAsset[] = []
  for (const [i, img] of src.images.entries()) {
    try {
      const blob = await (await fetch(img.url)).blob()
      assets.push(await loadAsset(new File([blob], `photo${i + 1}.${blob.type.includes('png') ? 'png' : 'jpg'}`, { type: blob.type || 'image/jpeg' }), 'media'))
    } catch {
      // 읽지 못한 사진은 건너뛴다
    }
  }

  const captions: Record<string, string> = {}
  for (const { language, post } of src.posts) {
    const body = src.siteUrl && !src.profile.noLinks ? ensureSiteLink(post.body, src.siteUrl) : post.body
    captions[language] = composeCopyText(body, post.hashtags, src.fixedHashtags, src.profile.hashtags[1])
  }

  const scenes = splitScript(script, assets, maxScenesFor(DURATION))
  updateProject({
    title: (main.post.cards[0]?.title || main.post.keyword || '인스타 게시물 릴스').slice(0, 40),
    brandId: src.brandId,
    topic: src.topic || main.post.keyword,
    script,
    duration: DURATION,
    assets,
    ...(scenes.length ? { scenes } : {}),
    captions,
  })
  // 릴스 화면이 열리기 전이라도 바로 저장(내 프로젝트에 나오게)
  void saveNow()
  return { scenes: scenes.length, photos: assets.length, captions: Object.keys(captions).length }
}
