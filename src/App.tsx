import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './lib/auth'
import { isFirebaseConfigured } from './lib/firebase'
import Layout from './components/Layout'
import Login from './pages/Login'
import SetupNeeded from './pages/SetupNeeded'
import OfflineBanner from './components/OfflineBanner'

// 화면별로 나눠 내려받는다 (첫 화면을 빠르게)
const CreatePost = lazy(() => import('./pages/CreatePost'))
const TodayContents = lazy(() => import('./pages/TodayContents'))
const ContentCalendar = lazy(() => import('./pages/ContentCalendar'))
const ImageLibrary = lazy(() => import('./pages/ImageLibrary'))
const PastContents = lazy(() => import('./pages/PastContents'))
const OpsSettings = lazy(() => import('./pages/OpsSettings'))
const ReelsLayout = lazy(() => import('./pages/reels/ReelsLayout'))
const ReelStudio = lazy(() => import('./pages/reels/ReelStudio'))
const KeywordStudio = lazy(() => import('./pages/reels/KeywordStudio'))
const ReelSoon = lazy(() => import('./pages/reels/ReelSoon'))
const ReelProjects = lazy(() => import('./pages/reels/ReelProjects'))
const TteolbokStudio = lazy(() => import('./pages/reels/TteolbokStudio'))

const Loading = () => <div className="py-20 text-center text-muted">불러오는 중…</div>

export default function App() {
  const { user, loading } = useAuth()

  if (!isFirebaseConfigured) return <SetupNeeded />
  if (loading) {
    return <div className="flex min-h-full items-center justify-center text-muted">불러오는 중…</div>
  }
  if (!user) return <Login />

  return (
    <>
    <OfflineBanner />
    <Suspense fallback={<Loading />}>
    <Routes>
      <Route element={<Layout />}>
        {/* 로그인 후 첫 화면: SNS 게시물 만들기 */}
        <Route index element={<Navigate to="/create" replace />} />
        <Route path="create" element={<CreatePost />} />
        <Route path="today" element={<TodayContents />} />
        <Route path="calendar" element={<ContentCalendar />} />
        <Route path="images" element={<ImageLibrary />} />
        <Route path="history" element={<PastContents />} />
        <Route path="settings" element={<OpsSettings />} />
        <Route path="reels" element={<ReelsLayout />}>
          <Route index element={<ReelStudio />} />
          <Route path="tteolbok" element={<TteolbokStudio />} />
          <Route path="keyword" element={<KeywordStudio />} />
          {/* 예전 디자인 탭 주소는 핵심어 타이포로 보낸다 */}
          <Route path="designs" element={<Navigate to="/reels/keyword" replace />} />
          <Route path="projects" element={<ReelProjects />} />
          <Route
            path="settings"
            element={<ReelSoon title="설정" items={['AI 대본 생성 연결(OpenAI 또는 로컬 AI)', '기본 목소리·말하기 속도', '기본 배경음악과 음량', '기본 디자인·영상 길이']} />}
          />
        </Route>
        <Route path="*" element={<Navigate to="/create" replace />} />
      </Route>
    </Routes>
    </Suspense>
    </>
  )
}
