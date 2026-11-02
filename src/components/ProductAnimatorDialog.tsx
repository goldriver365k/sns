import { useEffect, useRef, useState } from 'react'
import Modal from './Modal'
import { btnGhost, btnPrimary, fieldLabel, inputBase } from './ui'
import { deleteProductVideo, downloadProductVideo, productVideoStatus, startProductVideo } from '../lib/api'
import { downloadPng } from '../cards/export'
import { PRODUCT_MOTIONS, USD_PER_SECOND_720P, type ProductMotionId, type VideoAspect, type VideoResolution } from '../../shared/productVideo'

/** 진행 확인 간격과 최대 대기 시간 */
const POLL_MS = 10_000
const MAX_WAIT_MS = 12 * 60_000

type Phase = { kind: 'form' } | { kind: 'working'; startedAt: number; step: string } | { kind: 'done'; url: string; blob: Blob }

type Props = {
  /** 고른 화면 비율로 상품 사진을 그려 JPEG base64로 돌려준다 */
  renderImage: (aspect: VideoAspect) => Promise<string>
  /** 미리보기용 사진 주소 */
  preview: string
  onClose: () => void
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
const today = () => new Date().toISOString().slice(0, 10).replace(/-/g, '')

/**
 * 제품 애니메이션: 상품 사진 1장 → AI 영상(5·8초). Photoroom의 Product Animator와 같은 방식.
 * 서버(video 함수)가 Google Gemini 영상 모델에 작업을 맡기고, 화면은 10초마다 진행을 확인한 뒤 완성 영상을 받는다.
 */
export default function ProductAnimatorDialog({ renderImage, preview, onClose }: Props) {
  const [motion, setMotion] = useState<ProductMotionId>('dolly')
  const [custom, setCustom] = useState('')
  const [seconds, setSeconds] = useState<5 | 8>(5)
  const [aspect, setAspect] = useState<VideoAspect>('9:16')
  const [resolution, setResolution] = useState<VideoResolution>('720p')
  const [sound, setSound] = useState(true)
  const [phase, setPhase] = useState<Phase>({ kind: 'form' })
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState(Date.now())
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  // 기다리는 동안 경과 시간 표시
  useEffect(() => {
    if (phase.kind !== 'working') return
    const t = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(t)
  }, [phase.kind])

  useEffect(() => () => {
    if (phase.kind === 'done') URL.revokeObjectURL(phase.url)
  }, [phase])

  async function make() {
    if (motion === 'custom' && !custom.trim()) return setError('어떻게 움직일지 적어 주세요.')
    setError(null)
    const startedAt = Date.now()
    setNow(startedAt)
    setPhase({ kind: 'working', startedAt, step: '사진 준비 중…' })
    try {
      const image = await renderImage(aspect)
      setPhase({ kind: 'working', startedAt, step: 'AI에 영상 작업을 맡기는 중…' })
      const id = await startProductVideo({ image, motion, custom, seconds, aspect, resolution, sound })
      setPhase({ kind: 'working', startedAt, step: 'AI가 영상을 만드는 중… (보통 1~5분)' })
      for (;;) {
        if (!alive.current) return
        if (Date.now() - startedAt > MAX_WAIT_MS) throw new Error('영상이 너무 오래 걸립니다. 잠시 후 다시 시도해 주세요.')
        await wait(POLL_MS)
        let st
        try {
          st = await productVideoStatus(id)
        } catch (e) {
          // 잠깐의 네트워크 오류는 다음 확인 때 다시 시도
          console.warn('영상 상태 확인 실패', e)
          continue
        }
        if (st.status === 'failed' || st.status === 'cancelled') throw new Error(st.error || '영상을 만들지 못했습니다.')
        if (st.status === 'completed') {
          setPhase({ kind: 'working', startedAt, step: '완성된 영상을 받는 중…' })
          const blob = await downloadProductVideo(id, st.parts ?? 1)
          void deleteProductVideo(id)
          if (!alive.current) return
          setPhase({ kind: 'done', url: URL.createObjectURL(blob), blob })
          return
        }
      }
    } catch (e) {
      if (!alive.current) return
      setError(e instanceof Error ? e.message : '영상을 만들지 못했습니다.')
      setPhase({ kind: 'form' })
    }
  }

  async function share(blob: Blob) {
    const file = new File([blob], `product_${today()}.mp4`, { type: 'video/mp4' })
    try {
      if (navigator.canShare?.({ files: [file] })) return await navigator.share({ files: [file] })
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return
    }
    downloadPng(blob, file.name)
  }

  function close() {
    if (phase.kind === 'working' && !window.confirm('영상을 만드는 중입니다. 지금 닫으면 결과를 받을 수 없고 사용료는 그대로 청구됩니다. 닫을까요?')) return
    onClose()
  }

  const elapsed = phase.kind === 'working' ? Math.floor((now - phase.startedAt) / 1000) : 0
  const cost = (seconds * USD_PER_SECOND_720P).toFixed(1)

  return (
    <Modal
      title="🎞 제품 애니메이션 (AI 영상)"
      onClose={close}
      footer={
        phase.kind === 'done' ? (
          <>
            <button type="button" onClick={() => setPhase({ kind: 'form' })} className={btnGhost}>
              다른 움직임으로 다시
            </button>
            <button type="button" onClick={() => share(phase.blob)} className={btnGhost}>
              휴대폰에 저장·공유
            </button>
            <button type="button" onClick={() => downloadPng(phase.blob, `product_${today()}.mp4`)} className={btnPrimary}>
              MP4 저장
            </button>
          </>
        ) : (
          <>
            <button type="button" onClick={close} className={btnGhost}>
              닫기
            </button>
            <button type="button" onClick={make} disabled={phase.kind === 'working'} className={btnPrimary}>
              {phase.kind === 'working' ? '만드는 중…' : `영상 만들기 (약 $${cost})`}
            </button>
          </>
        )
      }
    >
      {phase.kind === 'done' ? (
        <div className="space-y-3">
          <video src={phase.url} controls autoPlay loop playsInline className="mx-auto max-h-[60vh] rounded-xl bg-black" />
          <p className="text-xs text-muted">AI가 만든 영상입니다. 상품 모양·글자가 원본과 다르게 바뀌지 않았는지 꼭 확인한 뒤 올려 주세요. 영상은 이 창을 닫으면 사라지니 먼저 저장하세요. 저장한 MP4는 AI 자동 릴스의 자료로 넣어 쓸 수 있습니다.</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <img src={preview} alt="움직일 상품 사진" className="h-20 w-20 rounded-lg border border-cream-300 object-contain" style={{ background: '#f7f3ea' }} />
            <p className="text-sm text-muted">이 사진(지금 고른 배경·그림자 그대로)을 AI가 움직이는 짧은 영상으로 만듭니다. 사람 얼굴이 있는 사진은 만들 수 없습니다.</p>
          </div>

          <div>
            <span className={fieldLabel}>움직임</span>
            <div className="flex flex-wrap gap-1.5">
              {[...PRODUCT_MOTIONS, { id: 'custom' as const, label: '직접 설명' }].map((m) => (
                <button key={m.id} type="button" aria-pressed={motion === m.id} disabled={phase.kind === 'working'} onClick={() => setMotion(m.id)} className={`rounded-full border px-3 py-1.5 text-sm ${motion === m.id ? 'border-forest-700 bg-forest-700 text-cream-50' : 'border-cream-300 bg-white text-ink'}`}>
                  {m.label}
                </button>
              ))}
            </div>
            <textarea
              aria-label="움직임 설명 더하기"
              rows={2}
              maxLength={300}
              value={custom}
              disabled={phase.kind === 'working'}
              onChange={(e) => setCustom(e.target.value)}
              placeholder={motion === 'custom' ? '예) 상품 뒤로 노을이 지고 카메라가 천천히 돈다' : '덧붙일 요청 (선택) 예) 마지막에 상품 정면에서 멈춤'}
              className={`${inputBase} mt-2 resize-y text-sm`}
            />
          </div>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Choice label="길이" value={seconds} options={[[5, '5초'], [8, '8초']]} onChange={setSeconds} disabled={phase.kind === 'working'} />
            <Choice label="화면" value={aspect} options={[['9:16', '세로'], ['16:9', '가로']]} onChange={setAspect} disabled={phase.kind === 'working'} />
            <Choice label="화질" value={resolution} options={[['720p', '720p'], ['360p', '360p']]} onChange={setResolution} disabled={phase.kind === 'working'} />
            <Choice label="소리" value={sound} options={[[true, '음악'], [false, '없음']]} onChange={setSound} disabled={phase.kind === 'working'} />
          </div>

          <p className="text-xs text-muted">
            Google Gemini 영상 AI를 씁니다. 720p 1초에 약 $0.10(이 영상 약 ${cost}). 만드는 데 보통 1~5분 걸리고, 그동안 이 창을 열어 두세요.
          </p>

          {phase.kind === 'working' && (
            <div className="rounded-xl border border-cream-300 bg-white p-4" role="status">
              <div className="flex justify-between text-sm">
                <span>{phase.step}</span>
                <span className="text-muted">
                  {Math.floor(elapsed / 60)}분 {String(elapsed % 60).padStart(2, '0')}초
                </span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-cream-200">
                <div className="h-full w-1/3 animate-pulse rounded-full bg-forest-500" />
              </div>
            </div>
          )}
          {error && <p className="text-sm text-red-700">{error}</p>}
        </div>
      )}
    </Modal>
  )
}

function Choice<T extends string | number | boolean>({ label, value, options, onChange, disabled }: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void; disabled: boolean }) {
  return (
    <div>
      <span className="mb-1.5 block text-sm font-semibold text-forest-900">{label}</span>
      <div className="flex gap-1">
        {options.map(([v, text]) => (
          <button key={String(v)} type="button" aria-pressed={value === v} disabled={disabled} onClick={() => onChange(v)} className={`flex-1 rounded-lg border px-2 py-1.5 text-sm ${value === v ? 'border-forest-700 bg-forest-700 text-cream-50' : 'border-cream-300 bg-white text-ink'}`}>
            {text}
          </button>
        ))}
      </div>
    </div>
  )
}
