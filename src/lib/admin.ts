/**
 * 화면에서 사용하는 관리자 이메일 목록.
 * 실제 데이터 보호는 Firestore·Storage 보안 규칙과 서버 함수의 토큰 검증이 담당하고,
 * 여기서는 허용되지 않은 계정에게 화면을 보여주지 않는 역할만 한다.
 */
const raw = import.meta.env.VITE_ADMIN_EMAILS || 'higidia@gmail.com'

export const ADMIN_EMAILS = raw
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean)

export function isAdminEmail(email: string | null | undefined): boolean {
  return !!email && ADMIN_EMAILS.includes(email.toLowerCase())
}
