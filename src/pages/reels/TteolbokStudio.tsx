import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import StoreManager from '../../components/reels/StoreManager'
import ReelCaption from '../../components/reels/ReelCaption'
import { generateTteolbokCopy } from '../../lib/api'
import { canShareImages } from '../../cards/export'
import { emptyCopy, TTEOLBOK_LIMITS, type TteolbokCopy } from '../../../shared/tteolbok'
import { decodeVoices, fetchVoice, hasVoice, mixAudio, type Mix } from '../../tteolbok/audio'
import { exportTteolbokMp4, pickAudioCodec, type TteolbokExport } from '../../tteolbok/exporter'
import { drawTteolbokFrame, ensureTteolbokFonts, loadBear, TT_DESIGNS, TT_H, TT_W, type DesignId, type FrameInput } from '../../tteolbok/render'
import { DEFAULT_STORES, loadStores, type TteolbokStore } from '../../tteolbok/stores'
import { estimateSeconds, makeCues, plain, voiceTexts } from '../../tteolbok/timeline'

const box = 'rounded-2xl border border-cream-300 bg-cream-50 p-4'
const heading = 'mb-2 text-sm font-bold text-forest-900'
const field = 'w-full rounded-lg border border-cream-300 bg-white px-3 py-2 text-sm outline-none focus:border-forest-500'
const LS_KEY = 'snsroom.tteolbok'

const DEFAULT_COPY: TteolbokCopy = {
  title1: '친구관계,',
  title2: '더 좋아지는',
  point: '비결!',
  l1: '*진심*과 *공감*만큼',
  l2: '우정을 깊게 하는 건 없어요.',
  l3: '작은 배려가 큰 신뢰를 만듭니다.',
}

type Saved = { storeId: string; design: DesignId; topic: string; copyTopic: string; copy: TteolbokCopy; voice: boolean; music: boolean; aiLabel: boolean }

function loadSaved(): Saved {
  const base: Saved = { storeId: 'hururuk', design: 'bubble', topic: '친구관계 더 좋아지는 비결', copyTopic: '친구관계 더 좋아지는 비결', copy: DEFAULT_COPY, voice: true, music: true, aiLabel: true }
  try {
    const s = JSON.parse(localStorage.getItem(LS_KEY) || 'null')
    return s ? { ...base, ...s, copy: { ...emptyCopy(), ...s.copy } } : base
  } catch {
    return base
  }
}

const stamp = () => {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`
}

const COPY_FIELDS: { key: keyof TteolbokCopy; label: string }[] = [
  { key: 'title1', label: '제목 첫째 줄' },
  { key: 'title2', label: '제목 둘째 줄 (강조색)' },
  { key: 'point', label: '포인트' },
  { key: 'l1', label: '말풍선 1' },
  { key: 'l2', label: '말풍선 2' },
  { key: 'l3', label: '마무리 한마디' },
]

/** 털복이 숏폼: 상호 선택 → 디자인 선택 → 주제 입력 → 문구·음성·영상 자동 생성 */
export default function TteolbokStudio() {
  const saved = useMemo(loadSaved, [])
  const [stores, setStores] = useState<TteolbokStore[]>(DEFAULT_STORES)
  const [storeId, setStoreId] = useState(saved.storeId)
  const [design, setDesign] = useState<DesignId>(saved.design)
  const [topic, setTopic] = useState(saved.topic)
  const [copyTopic, setCopyTopic] = useState(saved.copyTopic)
  const [copy, setCopy] = useState<TteolbokCopy>(saved.copy)
  const [voice, setVoice] = useState(saved.voice)
  const [music, setMusic] = useState(saved.music)
  const [aiLabel, setAiLabel] = useState(saved.aiLabel)
  const [bear, setBear] = useState<HTMLImageElement | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [progress, setProgress] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<(TteolbokExport & { url: string; name: string }) | null>(null)
  const [managing, setManaging] = useState(false)
  const [playing, setPlaying] = useState(false)
  const canvas = useRef<HTMLCanvasElement>(null)
  const thumbs = useRef<Record<string, HTMLCanvasElement | null>>({})
  const abort = useRef<AbortController | null>(null)
  const playRef = useRef<{ stop: () => void } | null>(null)

  const store = stores.find((s) => s.id === storeId) ?? stores[0] ?? { id: '', name: '', loc: '', bg: '', fg: '' }

  useEffect(() => {
    loadBear().then(setBear).catch(() => setError('털복이 그림을 불러오지 못했습니다. 새로고침해 주세요.'))
    loadStores()
      .then(setStores)
      .catch(() => setError('상호 목록을 불러오지 못했습니다. 기본 목록으로 표시합니다.'))
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({ storeId, design, topic, copyTopic, copy, voice, music, aiLabel }))
    } catch {
      // 저장 공간이 막혀 있어도 계속
    }
  }, [storeId, design, topic, copyTopic, copy, voice, music, aiLabel])

  /** 음성 없이 대략 계산한 화면 (미리보기 정지 화면·디자인 썸네일용) */
  const restFrame = useCallback(
    (d: DesignId): FrameInput => ({
      design: d,
      copy,
      store: { name: store.name, loc: store.loc, bg: store.bg, fg: store.fg },
      cues: makeCues(voiceTexts(copy).map(estimateSeconds) as [number, number, number], copy),
      voice,
      aiLabel,
      bear,
      env: null,
    }),
    [copy, store, voice, aiLabel, bear],
  )

  // 입력이 바뀌면 완성 화면과 디자인 썸네일을 다시 그린다
  useEffect(() => {
    if (playing) return
    let cancel = false
    ensureTteolbokFonts({ copy, store }).then(() => {
      if (cancel) return
      const c = canvas.current?.getContext('2d')
      if (c) drawTteolbokFrame(c, restFrame(design), 999)
      for (const d of TT_DESIGNS) {
        const el = thumbs.current[d.id]
        const tc = el?.getContext('2d')
        if (!tc) continue
        tc.setTransform(1, 0, 0, 1, 0, 0)
        tc.save()
        tc.scale(el!.width / TT_W, el!.height / TT_H)
        drawTteolbokFrame(tc, restFrame(d.id), 999)
        tc.restore()
      }
    })
    return () => {
      cancel = true
    }
  }, [restFrame, design, playing, copy, store])

  const hasCopy = Object.values(copy).some((v) => plain(v))

  async function writeCopy(again = false) {
    if (!topic.trim()) {
      setError('주제를 입력해 주세요.')
      return false
    }
    setBusy('털복이 문구를 쓰는 중…')
    setError(null)
    try {
      const c = await generateTteolbokCopy({ topic: topic.trim(), storeName: store.name, previous: again && hasCopy ? copy : undefined })
      setCopy(c)
      setCopyTopic(topic.trim())
      return c
    } catch (e) {
      setError(e instanceof Error ? e.message : '문구를 만들지 못했습니다.')
      return false
    } finally {
      setBusy(null)
    }
  }

  /** 음성(필요하면 생성)·음악·타이밍까지 준비한 화면 정보 */
  async function prepare(c: TteolbokCopy, sampleRate: number, signal?: AbortSignal): Promise<{ frame: FrameInput; mix: Mix | null }> {
    const texts = voiceTexts(c)
    let clips = null
    if (voice) {
      const missing = texts.filter((t) => t && !hasVoice(t))
      if (missing.length) {
        setBusy('털복이 목소리를 만드는 중…')
        await Promise.all(missing.map((t) => fetchVoice(t, signal)))
      }
      clips = await decodeVoices(texts, sampleRate)
    }
    const d = clips ? clips.durations : (texts.map(estimateSeconds) as [number, number, number])
    const cues = makeCues(d, c)
    const mix = voice || music ? mixAudio(clips, cues, music, sampleRate) : null
    const frame: FrameInput = {
      design,
      copy: c,
      store: { name: store.name, loc: store.loc, bg: store.bg, fg: store.fg },
      cues,
      voice,
      aiLabel,
      bear,
      env: mix?.env ?? null,
    }
    return { frame, mix }
  }

  function stopPlay() {
    playRef.current?.stop()
    playRef.current = null
    setPlaying(false)
  }

  async function play() {
    if (playing) {
      stopPlay()
      return
    }
    setError(null)
    const ac = new AudioContext()
    try {
      const { frame, mix } = await prepare(copy, ac.sampleRate)
      setBusy(null)
      await ensureTteolbokFonts(frame)
      let src: AudioBufferSourceNode | null = null
      if (mix) {
        const buf = ac.createBuffer(1, mix.pcm.length, mix.sampleRate)
        buf.getChannelData(0).set(mix.pcm)
        src = ac.createBufferSource()
        src.buffer = buf
        src.connect(ac.destination)
      }
      await ac.resume()
      const t0 = ac.currentTime + 0.05
      src?.start(t0)
      let raf = 0
      const ctx = canvas.current!.getContext('2d')!
      const stop = () => {
        cancelAnimationFrame(raf)
        try {
          src?.stop()
        } catch {
          // 이미 멈춤
        }
        ac.close()
        drawTteolbokFrame(ctx, frame, 999)
      }
      const loop = () => {
        const t = Math.max(0, ac.currentTime - t0)
        drawTteolbokFrame(ctx, frame, t)
        if (t < frame.cues.end) raf = requestAnimationFrame(loop)
        else stopPlay()
      }
      playRef.current = { stop }
      setPlaying(true)
      loop()
    } catch (e) {
      ac.close()
      setBusy(null)
      setError(e instanceof Error ? e.message : '미리보기를 재생하지 못했습니다.')
    }
  }

  async function makeVideo(auto = false) {
    stopPlay()
    setError(null)
    if (result) URL.revokeObjectURL(result.url)
    setResult(null)
    abort.current = new AbortController()
    try {
      let c: TteolbokCopy | false = copy
      // 주제를 바꿨거나 문구가 비어 있으면 문구부터 자동으로 쓴다
      if (auto && topic.trim() && (topic.trim() !== copyTopic || !hasCopy)) c = await writeCopy()
      if (!c) return
      if (!Object.values(c).some((v) => plain(v))) throw new Error('영상에 넣을 문구가 없습니다.')
      const audioCodec = voice || music ? await pickAudioCodec() : null
      const { frame, mix } = await prepare(c, audioCodec?.sampleRate ?? 44100, abort.current.signal)
      setBusy('영상을 만드는 중…')
      setProgress(0)
      const r = await exportTteolbokMp4(frame, mix, audioCodec, { onProgress: setProgress, signal: abort.current.signal })
      const name = `털복이_${plain(store.name).replace(/\s+/g, '') || '영상'}_${stamp()}.mp4`
      setResult({ ...r, url: URL.createObjectURL(r.blob), name })
      if ((voice || music) && !r.audio) setError('이 브라우저는 소리 넣기를 지원하지 않아 소리 없는 영상으로 만들었습니다. PC의 크롬·엣지 최신 버전을 써 주세요.')
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') setError('영상 만들기를 취소했습니다.')
      else setError(e instanceof Error ? e.message : '영상을 만들지 못했습니다.')
    } finally {
      setBusy(null)
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

  async function share() {
    if (!result) return
    const file = new File([result.blob], result.name, { type: 'video/mp4' })
    try {
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file] })
      else download()
    } catch {
      // 공유 창을 닫은 경우
    }
  }

  const working = busy !== null

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="flex min-w-0 flex-col gap-4">
        {/* 1. 상호 */}
        <section className={box}>
          <div className="mb-2 flex items-center justify-between">
            <h2 className={heading + ' mb-0'}>1. 상호 (영상 하단에 처음부터 고정)</h2>
            <button className="text-sm font-medium text-forest-500 hover:underline" onClick={() => setManaging(true)}>
              상호 관리
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {stores.map((s) => (
              <button
                key={s.id}
                onClick={() => setStoreId(s.id)}
                aria-pressed={s.id === store.id}
                className={`rounded-xl border px-3 py-2 text-sm ${s.id === store.id ? 'border-forest-700 bg-forest-700 text-cream-50' : 'border-cream-300 bg-white hover:border-forest-500'}`}
              >
                {s.name || '(이름 없음)'}
                {s.loc && <span className="ml-1 opacity-70">· {s.loc}</span>}
              </button>
            ))}
          </div>
        </section>

        {/* 2. 디자인 */}
        <section className={box}>
          <h2 className={heading}>2. 디자인</h2>
          <div className="grid grid-cols-3 gap-3">
            {TT_DESIGNS.map((d) => (
              <button
                key={d.id}
                onClick={() => setDesign(d.id)}
                aria-pressed={design === d.id}
                className={`flex flex-col items-center gap-1.5 rounded-xl border p-2 text-left ${design === d.id ? 'border-forest-700 ring-2 ring-forest-100' : 'border-cream-300 bg-white hover:border-forest-500'}`}
              >
                <canvas ref={(el) => void (thumbs.current[d.id] = el)} width={216} height={384} className="w-full max-w-[120px] rounded-lg" />
                <span className="text-sm font-semibold text-forest-900">{d.name}</span>
                <span className="hidden text-xs text-muted sm:block">{d.desc}</span>
              </button>
            ))}
          </div>
        </section>

        {/* 3. 주제 → 문구 */}
        <section className={box}>
          <h2 className={heading}>3. 주제</h2>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              id="tt-topic"
              className={field}
              value={topic}
              maxLength={200}
              placeholder="예: 시험기간 응원, 비 오는 날 따뜻한 한 그릇, 새해 다짐"
              onChange={(e) => setTopic(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !working && writeCopy()}
            />
            <button className="shrink-0 rounded-lg bg-forest-700 px-4 py-2 text-sm font-semibold text-cream-50 hover:bg-forest-900 disabled:bg-cream-300" disabled={working} onClick={() => writeCopy(hasCopy && topic.trim() === copyTopic)}>
              {hasCopy && topic.trim() === copyTopic ? '문구 다시 쓰기' : '문구 자동 작성'}
            </button>
          </div>
          <p className="mt-1.5 text-xs text-muted">AI가 털복이 말투로 제목·말풍선을 써요. 아래에서 바로 고칠 수 있고, *단어*처럼 별표로 감싸면 강조색이 돼요.</p>

          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {COPY_FIELDS.map((f) => {
              const len = plain(copy[f.key]).length
              const over = len > TTEOLBOK_LIMITS[f.key]
              return (
                <label key={f.key} className="block text-xs text-muted" htmlFor={`tt-${f.key}`}>
                  <span className="flex justify-between">
                    <span>{f.label}</span>
                    <span className={over ? 'text-amber-700' : ''}>
                      {len}/{TTEOLBOK_LIMITS[f.key]}
                    </span>
                  </span>
                  <input id={`tt-${f.key}`} className={field + ' mt-1 text-ink'} value={copy[f.key]} maxLength={40} onChange={(e) => setCopy({ ...copy, [f.key]: e.target.value })} />
                </label>
              )
            })}
          </div>
          <p className="mt-1.5 text-xs text-muted">권장 글자 수를 넘으면 한 줄에 맞게 글씨가 작아져요. 빈 줄은 영상에서 빠져요.</p>
        </section>

        {/* 4. 소리 */}
        <section className={box}>
          <h2 className={heading}>4. 소리</h2>
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={voice} onChange={(e) => setVoice(e.target.checked)} /> 털복이 AI 음성 (눈·입이 함께 움직임)
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={music} onChange={(e) => setMusic(e.target.checked)} /> 배경음악
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={aiLabel} disabled={!voice} onChange={(e) => setAiLabel(e.target.checked)} /> 화면에 "AI 음성" 표시
            </label>
          </div>
          <p className="mt-1.5 text-xs text-muted">
            음성은 OpenAI 음성으로 만들며 상업 이용이 가능합니다. 단, 듣는 사람에게 AI 음성임을 알려야 하므로 표시를 끄면 게시글 본문에 꼭 적어 주세요. 상호는 음성으로 읽지 않아요.
          </p>
        </section>
      </div>

      {/* 미리보기·만들기 */}
      <aside className="flex flex-col gap-4 lg:sticky lg:top-4 lg:self-start">
        <div className={box + ' flex flex-col items-center gap-3'}>
          <canvas ref={canvas} width={TT_W} height={TT_H} className="w-full max-w-[300px] rounded-xl shadow-sm" aria-label="털복이 숏폼 미리보기" />
          <div className="flex w-full max-w-[300px] gap-2">
            <button className="flex-1 rounded-xl border border-cream-300 bg-white py-2 text-sm hover:border-forest-500 disabled:opacity-50" disabled={working && !playing} onClick={play}>
              {playing ? '■ 멈춤' : '▶ 소리와 함께 미리보기'}
            </button>
          </div>
        </div>

        <div className={box + ' flex flex-col gap-2'}>
          <button className="w-full rounded-xl bg-forest-700 py-3 text-[15px] font-semibold text-cream-50 hover:bg-forest-900 disabled:bg-cream-300 disabled:text-muted" disabled={working} onClick={() => makeVideo(true)}>
            {topic.trim() && (topic.trim() !== copyTopic || !hasCopy) ? '주제로 영상 한 번에 만들기' : 'MP4 만들기'}
          </button>
          {busy && <p className="text-sm text-forest-700">{busy}</p>}
          {progress !== null && (
            <div className="flex items-center gap-2">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-cream-200">
                <div className="h-full bg-forest-500 transition-[width]" style={{ width: `${Math.round(progress * 100)}%` }} />
              </div>
              <button className="text-xs text-muted hover:text-ink" onClick={() => abort.current?.abort()}>
                취소
              </button>
            </div>
          )}
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          {result && (
            <div className="flex flex-col gap-2">
              <video src={result.url} controls playsInline className="w-full rounded-xl bg-black" />
              <p className="text-xs text-muted">
                {(result.blob.size / 1024 / 1024).toFixed(1)}MB · {result.seconds.toFixed(0)}초 만에 완성
                {result.codec === 'vp9' && ' · 이 브라우저는 H.264를 지원하지 않아 VP9로 만들었습니다(인스타그램 업로드는 크롬·엣지 권장)'}
              </p>
              <button onClick={download} className="w-full rounded-xl bg-forest-700 py-2 text-sm font-semibold text-cream-50 hover:bg-forest-900">
                MP4 다운로드
              </button>
              {canShareImages() && (
                <button onClick={share} className="w-full rounded-xl border border-cream-300 bg-white py-2 text-sm">
                  휴대폰에 저장·공유
                </button>
              )}
            </div>
          )}
        </div>
        <ReelCaption brandName={store.name} topic={topic} content={Object.values(copy).map(plain).filter(Boolean).join('\n')} storageKey="snsroom.tteolbok.caption" />
      </aside>

      {managing && (
        <StoreManager
          stores={stores}
          onClose={() => setManaging(false)}
          onSaved={(list) => {
            setStores(list)
            if (!list.some((s) => s.id === storeId) && list[0]) setStoreId(list[0].id)
            setManaging(false)
          }}
        />
      )}
    </div>
  )
}
