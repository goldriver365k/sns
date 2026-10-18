import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth'
import { auth, googleProvider } from './firebase'
import { isAdminEmail } from './admin'

type AuthState = {
  user: User | null
  /** 로그인 상태 확인 중 */
  loading: boolean
  /** 로그인했지만 허용되지 않은 계정 */
  denied: boolean
  error: string | null
  signIn: () => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [denied, setDenied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!auth) {
      setLoading(false)
      return
    }
    return onAuthStateChanged(auth, async (u) => {
      if (u && !(isAdminEmail(u.email) && u.emailVerified)) {
        // 허용되지 않은 계정은 즉시 로그아웃시킨다.
        setDenied(true)
        setUser(null)
        await signOut(auth!)
      } else {
        setUser(u)
      }
      setLoading(false)
    })
  }, [])

  async function signIn() {
    if (!auth) return
    setError(null)
    setDenied(false)
    try {
      await signInWithPopup(auth, googleProvider)
    } catch (e) {
      const code = (e as { code?: string }).code
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return
      if (code === 'auth/popup-blocked') {
        setError('브라우저가 로그인 팝업을 차단했습니다. 팝업을 허용한 뒤 다시 시도해 주세요.')
      } else if (code === 'auth/unauthorized-domain') {
        setError('이 주소는 Firebase 로그인 허용 도메인에 등록되어 있지 않습니다. 운영 안내를 확인해 주세요.')
      } else if (code === 'auth/network-request-failed') {
        setError('네트워크 연결을 확인한 뒤 다시 시도해 주세요.')
      } else {
        setError('로그인 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.')
      }
    }
  }

  async function logout() {
    if (auth) await signOut(auth)
  }

  return (
    <AuthContext.Provider value={{ user, loading, denied, error, signIn, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth는 AuthProvider 안에서만 사용할 수 있습니다.')
  return ctx
}
