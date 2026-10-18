import { useEffect, useState } from 'react'

/** 인터넷이 끊기면 화면 위에 알린다 (생성·저장이 되지 않으므로) */
export default function OfflineBanner() {
  const [offline, setOffline] = useState(!navigator.onLine)
  useEffect(() => {
    const on = () => setOffline(false)
    const off = () => setOffline(true)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])
  if (!offline) return null
  return (
    <div role="alert" className="fixed inset-x-0 top-0 z-[60] bg-red-700 px-4 py-2 text-center text-sm text-white">
      인터넷 연결이 끊겼습니다. 연결되면 수정한 내용이 자동으로 저장됩니다.
    </div>
  )
}
