// Firebase 설정값(.env 또는 Netlify 환경변수)이 없을 때 보여주는 안내 화면
export default function SetupNeeded() {
  return (
    <div className="flex min-h-full items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg rounded-3xl border border-cream-300 bg-cream-50 p-8">
        <h1 className="text-xl font-bold text-forest-900">Firebase 설정이 필요합니다</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-muted">
          Firebase 웹 앱 설정값이 아직 입력되지 않았습니다. <code className="rounded bg-cream-200 px-1">VITE_FIREBASE_</code>로
          시작하는 값들을 로컬은 <code className="rounded bg-cream-200 px-1">.env</code> 파일에, 배포 사이트는 Netlify 환경변수에
          넣은 뒤 다시 빌드해 주세요. 자세한 방법은 저장소의 <code className="rounded bg-cream-200 px-1">docs/SETUP.md</code>에 있습니다.
        </p>
      </div>
    </div>
  )
}
