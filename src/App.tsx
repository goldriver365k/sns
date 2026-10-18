import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './lib/auth'
import { isFirebaseConfigured } from './lib/firebase'
import Layout from './components/Layout'
import Login from './pages/Login'
import SetupNeeded from './pages/SetupNeeded'
import CreatePost from './pages/CreatePost'
import TodayContents from './pages/TodayContents'
import ContentCalendar from './pages/ContentCalendar'
import ImageLibrary from './pages/ImageLibrary'
import PastContents from './pages/PastContents'
import OpsSettings from './pages/OpsSettings'

export default function App() {
  const { user, loading } = useAuth()

  if (!isFirebaseConfigured) return <SetupNeeded />
  if (loading) {
    return <div className="flex min-h-full items-center justify-center text-muted">불러오는 중…</div>
  }
  if (!user) return <Login />

  return (
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
        <Route path="*" element={<Navigate to="/create" replace />} />
      </Route>
    </Routes>
  )
}
