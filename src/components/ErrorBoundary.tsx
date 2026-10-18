import { Component, type ReactNode } from 'react'

/** 화면에 예상치 못한 오류가 나면 흰 화면 대신 안내와 새로고침 버튼을 보여준다 */
export default class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error) {
    console.error('화면 오류', error)
  }

  render() {
    if (!this.state.error) return this.props.children
    // 새 버전 배포 직후 예전 파일을 못 찾는 경우가 가장 흔하다 → 새로고침으로 해결
    const chunk = /dynamically imported module|Loading chunk|Failed to fetch/i.test(this.state.error.message)
    return (
      <div className="flex min-h-full items-center justify-center px-4 py-12">
        <div className="w-full max-w-md rounded-3xl border border-cream-300 bg-cream-50 p-8 text-center">
          <h1 className="text-xl font-bold text-forest-900">화면을 표시하지 못했습니다</h1>
          <p className="mt-3 text-[15px] text-muted">
            {chunk ? '사이트가 새 버전으로 바뀌었습니다. 새로고침하면 해결됩니다.' : '일시적인 문제일 수 있습니다. 새로고침한 뒤에도 계속되면 화면을 캡처해 알려 주세요.'}
          </p>
          <button onClick={() => location.reload()} className="mt-6 rounded-xl bg-forest-700 px-6 py-3 font-semibold text-cream-50 hover:bg-forest-900">
            새로고침
          </button>
        </div>
      </div>
    )
  }
}
