import { auth } from './firebase'
import type { GenerateRequest, GeneratedPost } from '../../shared/generate'

/** 서버 함수로 게시물 1개를 생성한다. 실패하면 사용자에게 보여줄 한국어 메시지로 예외를 던진다. */
export async function generatePost(req: GenerateRequest): Promise<GeneratedPost> {
  const user = auth?.currentUser
  if (!user) throw new Error('로그인이 필요합니다.')
  const token = await user.getIdToken()

  let res: Response
  try {
    res = await fetch('/api/generate', {
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
    if (res.status === 404) throw new Error('생성 서버(Netlify Functions)를 찾지 못했습니다. 배포된 사이트에서 사용해 주세요.')
    throw new Error(data?.error || '생성 중 문제가 발생했습니다. 다시 시도해 주세요.')
  }
  return data.post as GeneratedPost
}
