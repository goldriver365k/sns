import { useEffect, useRef, useState } from 'react'
import { exportReelMp4, pickCodec, type ExportResult } from '../../reels/exporter'
import { canShareImages } from '../../cards/export'
import type { ReelProject } from '../../reels/types'
import type { ReelPlayer } from '../../reels/player'

const stamp = () => {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`
}

/** MP4 만들기: 진행 막대·취소 → 완성 영상 확인·다운로드·휴대폰 저장 */
export default function ExportPanel({ project, player }: { project: ReelProject; player: ReelPlayer }) {
  const [support, setSupport] = useState<'checking' | 'avc' | 'vp9' | 'none'>('checking')
  const [progress, setProgress] = useState<number | null>(null)
  const [result, setResult] = useState<(ExportResult & { url: string; name: string }) | null>(null)
  const [error, setError] = useState<string | null>(null)
  const abort = useRef<AbortController | null>(null)

  useEffect(() => {
    pickCodec().then((c) => setSupport(c ? c.mux : 'none'))
  }, [])

  useEffect(() => () => {
    if (result) URL.revokeObjectURL(result.url)
  }, [result])

  async function run() {
    setError(null)
    if (result) URL.revokeObjectURL(result.url)
    setResult(null)
    player.pause()
    abort.current = new AbortController()
    setProgress(0)
    try {
      const r = await exportReelMp4(project, { onProgress: setProgress, signal: abort.current.signal })
      setResult({ ...r, url: URL.createObjectURL(r.blob), name: `reel_${stamp()}.mp4` })
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') setError('취소했습니다.')
      else setError(e instanceof Error ? e.message : '영상을 만들지 못했습니다. 다시 시도해 주세요.')
    } finally {
      setProgress(null)
      abort.current = null
    }
  }

  function download() {
    if (!result) return
    const a = document.createElement('a')
    a.href = result.url
    a.download = result.name
    document.body.appendChild(a)
    a.click()
    a.remove()
  }

  async function shareToPhone() {
    if (!result) return
    const file = new File([result.blob], result.name, { type: 'video/mp4' })
    try {
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file] })
      else download()
    } catch {
      // 사용자가 취소
    }
  }

  const busy = progress !== null
  const mb = result ? (result.blob.size / 1024 / 1024).toFixed(1) : ''

  return (
    <section className="rounded-2xl border border-cream-300 bg-cream-50 p-4">
      <h2 className="mb-2 text-sm font-bold text-forest-900">MP4 만들기</h2>
      <p className="mb-2 text-[11px] leading-snug text-muted">
        1080×1920 · 30fps · {project.duration}초. 이 컴퓨터에서 직접 만듭니다(서버로 보내지 않음). 지금은 <b>소리 없는 영상</b>입니다 — 목소리·음악은 다음 단계.
      </p>
      {support === 'none' && <p className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">이 브라우저는 영상 만들기를 지원하지 않습니다. PC의 크롬·엣지 최신 버전에서 열어 주세요.</p>}
      {support === 'vp9' && <p className="mb-2 rounded-lg bg-yellow-50 px-3 py-2 text-xs text-yellow-800">이 브라우저는 H.264를 만들 수 없어 VP9 방식 MP4로 만듭니다. 일부 휴대폰·앱에서 안 열릴 수 있으니 크롬·엣지를 권장합니다.</p>}

      {busy ? (
        <div>
          <div className="h-3 overflow-hidden rounded-full bg-cream-200">
            <div className="h-full bg-forest-700 transition-[width]" style={{ width: `${Math.round((progress ?? 0) * 100)}%` }} />
          </div>
          <div className="mt-1 flex items-center justify-between text-xs text-muted">
            <span>만드는 중… {Math.round((progress ?? 0) * 100)}%</span>
            <button onClick={() => abort.current?.abort()} className="text-red-700 hover:underline">취소</button>
          </div>
          <p className="mt-1 text-[11px] text-muted">다른 탭으로 옮기면 느려질 수 있습니다.</p>
        </div>
      ) : (
        <button onClick={run} disabled={support === 'none' || support === 'checking'} className="w-full rounded-xl bg-forest-700 py-2.5 text-sm font-semibold text-cream-50 hover:bg-forest-900 disabled:bg-cream-300 disabled:text-muted">
          {result ? '다시 만들기' : 'MP4 만들기'}
        </button>
      )}
      {error && <p className="mt-2 text-xs text-red-700">{error}</p>}

      {result && !busy && (
        <div className="mt-3 space-y-2">
          <video src={result.url} controls playsInline className="aspect-[9/16] w-full rounded-lg bg-black" />
          <p className="text-[11px] text-muted">
            {mb}MB · {result.codec === 'avc' ? 'H.264' : 'VP9'} · {result.seconds.toFixed(0)}초 걸림
          </p>
          <button onClick={download} className="w-full rounded-xl bg-forest-700 py-2 text-sm font-semibold text-cream-50 hover:bg-forest-900">MP4 다운로드</button>
          {canShareImages() && <button onClick={shareToPhone} className="w-full rounded-xl border border-cream-300 bg-white py-2 text-sm">휴대폰에 저장·공유</button>}
        </div>
      )}
    </section>
  )
}
