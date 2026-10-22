import { auth } from './firebase'
import type { GenerateRequest, GeneratedPost } from '../../shared/generate'
import type { TteolbokCopy, TteolbokCopyRequest } from '../../shared/tteolbok'

/** 서버 함수로 게시물 1개를 생성한다. 실패하면 사용자에게 보여줄 한국어 메시지로 예외를 던진다. */
export async function generatePost(req: GenerateRequest): Promise<GeneratedPost> {
  const user = auth?.currentUser
  if (!user) throw new Error('로그인이 필요합니다.')
  const token = await user.getIdToken()

  let res: Response
  try {
    res = await fetch('/.netlify/functions/generate', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(req),
      signal: AbortSignal.timeout(35_000),
    })
  } catch (e) {
    if (e instanceof Error && e.name === 'TimeoutError') throw new Error('응답이 너무 늦습니다. 다시 시도해 주세요.')
    throw new Error('네트워크 연결을 확인한 뒤 다시 시도해 주세요.')
  }

  const data = await res.json().catch(() => null)
  if (!res.ok || !data?.post) {
    if (res.status === 404) throw new Error('생성 서버(Netlify Functions)를 찾지 못했습니다. 배포 로그의 Functions 항목을 확인해 주세요. (HTTP 404)')
    throw new Error(`${data?.error || '생성 중 문제가 발생했습니다. 다시 시도해 주세요.'}${data?.error ? '' : ` (HTTP ${res.status})`}`)
  }
  return data.post as GeneratedPost
}

/** 서버 설정 점검 (환경변수 유무만 확인) */
export async function checkServer(): Promise<Record<string, string>> {
  const user = auth?.currentUser
  if (!user) throw new Error('로그인이 필요합니다.')
  const res = await fetch('/.netlify/functions/health', { headers: { authorization: `Bearer ${await user.getIdToken()}` } })
  const data = await res.json().catch(() => null)
  if (!res.ok || !data) throw new Error(data?.error || `서버 점검 실패 (HTTP ${res.status})`)
  return data
}

/** AI로 이미지 1장을 만든다. data URL을 돌려준다. */
export async function generateImage(req: { prompt: string; style: string; snsType: string; brandName: string; foodBrand: boolean }): Promise<string> {
  const user = auth?.currentUser
  if (!user) throw new Error('로그인이 필요합니다.')
  let res: Response
  try {
    res = await fetch('/.netlify/functions/image', {
      method: 'POST',
      headers: { authorization: `Bearer ${await user.getIdToken()}`, 'content-type': 'application/json' },
      body: JSON.stringify(req),
      signal: AbortSignal.timeout(35_000),
    })
  } catch (e) {
    if (e instanceof Error && e.name === 'TimeoutError') throw new Error('응답이 너무 늦습니다. 다시 시도해 주세요.')
    throw new Error('네트워크 연결을 확인한 뒤 다시 시도해 주세요.')
  }
  const data = await res.json().catch(() => null)
  if (!res.ok || !data?.image) throw new Error(data?.error || `이미지를 만들지 못했습니다. (HTTP ${res.status})`)
  return data.image as string
}

/** 털복이 숏폼: 주제 하나로 털복이 문구(제목·포인트·말풍선 3줄)를 만든다 */
export async function generateTteolbokCopy(req: TteolbokCopyRequest): Promise<TteolbokCopy> {
  const user = auth?.currentUser
  if (!user) throw new Error('로그인이 필요합니다.')
  let res: Response
  try {
    res = await fetch('/.netlify/functions/tteolbok-copy', {
      method: 'POST',
      headers: { authorization: `Bearer ${await user.getIdToken()}`, 'content-type': 'application/json' },
      body: JSON.stringify(req),
      signal: AbortSignal.timeout(35_000),
    })
  } catch (e) {
    if (e instanceof Error && e.name === 'TimeoutError') throw new Error('응답이 너무 늦습니다. 다시 시도해 주세요.')
    throw new Error('네트워크 연결을 확인한 뒤 다시 시도해 주세요.')
  }
  const data = await res.json().catch(() => null)
  if (!res.ok || !data?.copy) {
    if (res.status === 404) throw new Error('문구 생성 서버를 찾지 못했습니다. 배포 로그의 Functions 항목을 확인해 주세요. (HTTP 404)')
    throw new Error(data?.error || `문구를 만들지 못했습니다. (HTTP ${res.status})`)
  }
  return data.copy as TteolbokCopy
}
