import { AuthError, requireAdmin } from '../lib/auth'

// 서버 설정 점검: 필요한 환경변수가 들어 있는지만 알려준다(값은 절대 보여주지 않음).
// 주소: /.netlify/functions/health — 관리자 로그인 토큰이 있어야 응답한다.
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8' } })

export default async (req: Request) => {
  try {
    await requireAdmin(req)
  } catch (e) {
    return json(401, { error: e instanceof AuthError ? e.message : '로그인을 확인하지 못했습니다.' })
  }
  const key = process.env.OPENAI_API_KEY || ''
  return json(200, {
    openaiKey: key ? (key.startsWith('sk-') ? '있음' : '있음(형식 확인 필요: 보통 sk-로 시작)') : '없음',
    openaiModel: process.env.OPENAI_MODEL || '없음',
    imageModel: process.env.OPENAI_IMAGE_MODEL || '없음(AI 이미지 만들기 사용 불가)',
    reasoningEffort: process.env.OPENAI_REASONING_EFFORT || '설정 안 함',
    adminEmails: process.env.ADMIN_EMAILS ? '있음' : '없음(기본값 사용)',
  })
}
