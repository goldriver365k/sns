import { auth } from '../lib/firebase'

/**
 * 배경용 무료 사진 찾기 (서버 함수 bg-search → Openverse, CC0·퍼블릭 도메인만).
 * Openverse는 영어로 찾아야 잘 나오므로 자주 쓰는 배경 낱말은 영어로 바꿔 보낸다.
 */
export type FoundPhoto = { id: string; title: string; thumb: string; creator: string; source: string; width: number; height: number }
export type FetchedPhoto = { data: string; mime: string; title: string; creator: string; source: string; license: string; landing: string }

const WORDS: Record<string, string> = {
  나무: 'wood', 원목: 'wood', 대리석: 'marble', 카페: 'cafe', 바다: 'sea', 해변: 'beach', 하늘: 'sky', 구름: 'clouds', 꽃: 'flowers', 벚꽃: 'cherry blossom',
  숲: 'forest', 주방: 'kitchen', 부엌: 'kitchen', 테이블: 'table', 식탁: 'table', 벽: 'wall', 콘크리트: 'concrete', 종이: 'paper texture', 천: 'fabric', 리넨: 'linen',
  눈: 'snow', 겨울: 'winter', 가을: 'autumn', 단풍: 'autumn leaves', 봄: 'spring', 여름: 'summer', 크리스마스: 'christmas', 빛: 'bokeh lights', 조명: 'lights', 도시: 'city',
  거리: 'street', 잔디: 'grass', 돌: 'stone', 모래: 'sand', 파스텔: 'pastel', 그라데이션: 'gradient', 검정: 'black', 검은: 'black', 흰: 'white', 하얀: 'white',
  노을: 'sunset', 산: 'mountain', 커피: 'coffee', 음식: 'food', 식당: 'restaurant', 밥: 'rice', 고기: 'meat', 불: 'fire', 창가: 'window', 창문: 'window',
  거실: 'living room', 호수: 'lake', 강: 'river', 밤: 'night', 별: 'stars', 질감: 'texture', 배경: 'background', 나뭇잎: 'leaves', 식물: 'plants', 과일: 'fruit',
}

/** 한글 낱말을 영어로 (모르는 말은 그대로) */
export function toSearchWords(q: string) {
  return q
    .trim()
    .split(/\s+/)
    .map((w) => WORDS[w.replace(/(의|에|이|가|을|를|은|는|위|속)$/, '')] ?? WORDS[w] ?? w)
    .join(' ')
}

async function call<T>(body: unknown): Promise<T> {
  const user = auth?.currentUser
  if (!user) throw new Error('로그인이 필요합니다.')
  let res: Response
  try {
    res = await fetch('/.netlify/functions/bg-search', {
      method: 'POST',
      headers: { authorization: `Bearer ${await user.getIdToken()}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    })
  } catch (e) {
    if (e instanceof Error && e.name === 'TimeoutError') throw new Error('응답이 너무 늦습니다. 다시 시도해 주세요.')
    throw new Error('네트워크 연결을 확인한 뒤 다시 시도해 주세요.')
  }
  const data = await res.json().catch(() => null)
  if (!res.ok || !data) {
    if (res.status === 404) throw new Error('사진 찾기 서버를 찾지 못했습니다. 배포 로그의 Functions 항목을 확인해 주세요. (HTTP 404)')
    throw new Error(data?.error || `사진을 찾지 못했습니다. (HTTP ${res.status})`)
  }
  return data as T
}

export const searchPhotos = (q: string, page = 1) => call<{ total: number; results: FoundPhoto[] }>({ q: toSearchWords(q), page })
export const fetchPhoto = (imageId: string) => call<FetchedPhoto>({ imageId })
