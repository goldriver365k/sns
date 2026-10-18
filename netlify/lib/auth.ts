import { createRemoteJWKSet, jwtVerify } from 'jose'

// Firebase ID 토큰 서명 키 (Google 공개 키)
const JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'),
)

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'snsroom'

function adminEmails() {
  return (process.env.ADMIN_EMAILS || 'higidia@gmail.com')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
}

export class AuthError extends Error {}

/**
 * 요청의 Firebase ID 토큰을 검증하고 관리자 이메일인지 확인한다.
 * 서비스 계정 없이 Google 공개 키로 서명·발급자·대상·만료를 검사한다.
 */
export async function requireAdmin(req: Request): Promise<string> {
  const header = req.headers.get('authorization') || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  if (!token) throw new AuthError('로그인이 필요합니다.')

  let payload
  try {
    ;({ payload } = await jwtVerify(token, JWKS, {
      issuer: `https://securetoken.google.com/${PROJECT_ID}`,
      audience: PROJECT_ID,
    }))
  } catch {
    throw new AuthError('로그인이 만료되었습니다. 다시 로그인해 주세요.')
  }

  const email = String(payload.email || '').toLowerCase()
  if (!payload.email_verified || !adminEmails().includes(email)) {
    throw new AuthError('접근 권한이 없는 계정입니다.')
  }
  return email
}
