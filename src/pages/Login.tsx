import { useAuth } from '../lib/auth'

export default function Login() {
  const { signIn, denied, error } = useAuth()

  return (
    <div className="flex min-h-full items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm rounded-3xl border border-cream-300 bg-cream-50 p-8 text-center shadow-sm">
        <div className="text-xs font-medium tracking-widest text-forest-500">AI CONTENT</div>
        <h1 className="mt-2 text-2xl font-bold text-forest-900">AI 콘텐츠 매니저</h1>
        <p className="mt-3 text-[15px] text-muted">관리자 전용 페이지입니다.<br />허용된 Google 계정으로 로그인해 주세요.</p>

        <button
          onClick={signIn}
          className="mt-8 flex w-full items-center justify-center gap-3 rounded-xl border border-cream-300 bg-white py-3 text-[15px] font-medium text-ink transition hover:border-forest-500"
        >
          <svg viewBox="0 0 48 48" className="h-5 w-5" aria-hidden>
            <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
            <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
            <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
            <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
          </svg>
          Google 계정으로 로그인
        </button>

        {denied && (
          <p className="mt-5 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
            접근 권한이 없는 계정입니다. 관리자 계정으로 다시 로그인해 주세요.
          </p>
        )}
        {error && <p className="mt-5 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      </div>
    </div>
  )
}
