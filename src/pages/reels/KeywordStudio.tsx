import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import ReelCaption from '../../components/reels/ReelCaption'
import { generateKeywordScenes } from '../../lib/api'
import { canShareImages } from '../../cards/export'
import { KEYWORD_LIMITS, KEYWORD_SCENES_MAX, KEYWORD_SCENES_MIN, type KeywordScene } from '../../../shared/keyword'
import { decodeVoiceList, fetchVoice, hasVoice, mixTrack, type Mix } from '../../tteolbok/audio'
import { exportCanvasMp4, pickAudioCodec, type TteolbokExport } from '../../tteolbok/exporter'
import { useBrandStores } from '../../tteolbok/stores'
import { drawKwFrame, ensureKwFonts, KW_DESIGNS, KW_H, KW_W, sceneTimings, type KwDesignId, type KwFrame } from '../../keyword/render'

const box = 'rounded-2xl border border-cream-300 bg-cream-50 p-4'
const heading = 'mb-2 text-sm font-bold text-forest-900'
const field = 'w-full rounded-lg border border-cream-300 bg-white px-3 py-2 text-sm outline-none focus:border-forest-500'
const LS_KEY = 'snsroom.keyword'
const plain = (s: string) => s.replace(/\*/g, '').trim()

const SAMPLE: KeywordScene[] = [
  { kw: '친구관계', sent: '조금 더 *좋아지는* 비결이 있어요.' },
  { kw: '진심', sent: '*진심*과 공감만큼 우정을 깊게 하는 건 없어요.' },
  { kw: '배려', sent: '작은 *배려*가 큰 신뢰를 만듭니다.' },
]

type Saved = { storeId: string; design: KwDesignId; topic: string; copyTopic: string; count: number; scenes: KeywordScene[]; voice: boolean; music: boolean; aiLabel: boolean }

function loadSaved(): Saved {
  const base: Saved = { storeId: 'bulbaek', design: 'white', topic: '친구관계 더 좋아지는 비결', copyTopic: '친구관계 더 좋아지는 비결', count: 3, scenes: SAMPLE, voice: true, music: true, aiLabel: true }
  try {
    const s = JSON.parse(localStorage.getItem(LS_KEY) || 'null')
    return s && Array.isArray(s.scenes) ? { ...base, ...s } : base
  } catch {
    return base
  }
}

const stamp = () => {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`
}

/** 핵심어 타이포: 상호 선택 → 디자인(4안) → 주제 입력 → 장면별 핵심어·문장 → 음성·음악 → MP4 */
export default function KeywordStudio() {
  const saved = useMemo(loadSaved, [])
  const stores = useBrandStores()
  const [storeId, setStoreId] = useState(saved.storeId)
  const [design, setDesign] = useState<KwDesignId>(saved.design)
  const [topic, setTopic] = useState(saved.topic)
  const [copyTopic, setCopyTopic] = useState(saved.copyTopic)
  const [count, setCount] = useState(saved.count)
  const [scenes, setScenes] = useState<KeywordScene[]>(saved.scenes)
  const [voice, setVoice] = useState(saved.voice)
  const [music, setMusic] = useState(saved.music)
  const [aiLabel, setAiLabel] = useState(saved.aiLabel)
  const [busy, setBusy] = useState<string | null>(null)
  const [progress, setProgress] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<(TteolbokExport & { url: string; name: string }) | null>(null)
  const [playing, setPlaying] = useState(false)
  const canvas = useRef<HTMLCanvasElement>(null)
  const thumbs = useRef<Record<string, HTMLCanvasElement | null>>({})
  const abort = useRef<AbortController | null>(null)
  const playRef = useRef<{ stop: () => void } | null>(null)

  const store = stores.find((s) => s.id === storeId) ?? stores[0] ?? { id: '', name: '', loc: '', bg: '', fg: '' }
  const usable = scenes.filter((s) => plain(s.kw) || plain(s.sent))

  useEffect(() => {
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({ storeId, design, topic, copyTopic, count, scenes, voice, music, aiLabel }))
    } catch {
      // 저장 공간이 막혀 있어도 계속
    }
  }, [storeId, design, topic, copyTopic, count, scenes, voice, music, aiLabel])

  const frameFor = useCallback(
    (d: KwDesignId, list: KeywordScene[], voiceSec: number[] = []): KwFrame => ({
      design: d,
      scenes: list,
      timings: sceneTimings(list, voiceSec).list,
      store: { name: store.name, loc: store.loc, bg: store.bg, fg: store.fg },
      aiLabel: voice && aiLabel,
    }),
    [store, voice, aiLabel],
  )

  // 입력이 바뀌면 정지 화면과 디자인 썸네일을 다시 그린다
  useEffect(() => {
    if (playing) return
    let cancel = false
    ensureKwFonts({ scenes: usable, store }).then(() => {
      if (cancel) return
      const c = canvas.current?.getContext('2d')
      if (c) drawKwFrame(c, frameFor(design, usable), 1e6)
      for (const d of KW_DESIGNS) {
        const el = thumbs.current[d.id]
        const tc = el?.getContext('2d')
        if (!el || !tc) continue
        tc.save()
        tc.setTransform(el.width / KW_W, 0, 0, el.height / KW_H, 0, 0)
        drawKwFrame(tc, frameFor(d.id, usable), 1e6)
        tc.restore()
      }
    })
    return () => {
      cancel = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frameFor, design, playing, scenes, store])

  async function writeScenes(again = false) {
    if (!topic.trim()) {
      setError('주제를 입력해 주세요.')
      return false
    }
    setBusy('장면 문구를 쓰는 중…')
    setError(null)
    try {
      const list = await generateKeywordScenes({ topic: topic.trim(), count, storeName: store.name, previous: again ? usable : undefined })
      setScenes(list)
      setCopyTopic(topic.trim())
      return list
    } catch (e) {
      setError(e instanceof Error ? e.message : '문구를 만들지 못했습니다.')
      return false
    } finally {
      setBusy(null)
    }
  }

  /** 음성(필요하면 생성)·음악·장면 시간까지 준비 */
  async function prepare(list: KeywordScene[], sampleRate: number, signal?: AbortSignal): Promise<{ frame: KwFrame; mix: Mix | null; end: number }> {
    const texts = list.map((s) => plain(s.sent))
    let durations: number[] = []
    let clips: Float32Array[] = []
    if (voice) {
      const missing = [...new Set(texts.filter((t) => t && !hasVoice(t)))]
      if (missing.length) {
        setBusy('AI 음성을 만드는 중…')
        await Promise.all(missing.map((t) => fetchVoice(t, signal)))
      }
      const r = await decodeVoiceList(texts, sampleRate)
      clips = r.clips
      durations = r.durations
    }
    const { list: timings, end } = sceneTimings(list, durations)
    const frame: KwFrame = { ...frameFor(design, list), timings }
    const starts = timings.map((t) => t.start + t.sent)
    const mix = voice || music ? mixTrack(clips, starts, end, music, sampleRate) : null
    return { frame, mix, end }
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
    if (!usable.length) {
      setError('장면을 하나 이상 입력해 주세요.')
      return
    }
    setError(null)
    const ac = new AudioContext()
    try {
      const { frame, mix, end } = await prepare(usable, ac.sampleRate)
      setBusy(null)
      await ensureKwFonts(frame)
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
        drawKwFrame(ctx, frame, 1e6)
      }
      const loop = () => {
        const t = Math.max(0, ac.currentTime - t0)
        drawKwFrame(ctx, frame, t)
        if (t < end) raf = requestAnimationFrame(loop)
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

  async function makeVideo() {
    stopPlay()
    setError(null)
    if (result) URL.revokeObjectURL(result.url)
    setResult(null)
    abort.current = new AbortController()
    try {
      let list: KeywordScene[] | false = usable
      // 주제를 바꿨거나 장면이 비어 있으면 문구부터 자동으로 쓴다
      if (topic.trim() && (topic.trim() !== copyTopic || !usable.length)) list = await writeScenes()
      if (!list) return
      list = list.filter((s) => plain(s.kw) || plain(s.sent))
      if (!list.length) throw new Error('영상에 넣을 장면이 없습니다.')
      const audioCodec = voice || music ? await pickAudioCodec() : null
      const { frame, mix, end } = await prepare(list, audioCodec?.sampleRate ?? 44100, abort.current.signal)
      await ensureKwFonts(frame)
      setBusy('영상을 만드는 중…')
      setProgress(0)
      const r = await exportCanvasMp4({ width: KW_W, height: KW_H, duration: end, draw: (ctx, t) => drawKwFrame(ctx, frame, t) }, mix, audioCodec, {
        onProgress: setProgress,
        signal: abort.current.signal,
      })
      const name = `핵심어_${plain(store.name).replace(/\s+/g, '') || '영상'}_${stamp()}.mp4`
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

  const patchScene = (i: number, p: Partial<KeywordScene>) => setScenes(scenes.map((s, j) => (j === i ? { ...s, ...p } : s)))
  const moveScene = (i: number, d: number) => {
    const j = i + d
    if (j < 0 || j >= scenes.length) return
    const next = [...scenes]
    ;[next[i], next[j]] = [next[j], next[i]]
    setScenes(next)
  }
  const working = busy !== null
  const fresh = topic.trim() && (topic.trim() !== copyTopic || !usable.length)

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="flex min-w-0 flex-col gap-4">
        <section className={box}>
          <div className="mb-2 flex items-center justify-between">
            <h2 className={heading + ' mb-0'}>1. 브랜드 (영상 하단에 처음부터 고정)</h2>
            <Link to="/settings" className="text-sm font-medium text-forest-500 hover:underline">
              브랜드 관리
            </Link>
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

        <section className={box}>
          <h2 className={heading}>2. 디자인</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {KW_DESIGNS.map((d) => (
              <button
                key={d.id}
                onClick={() => setDesign(d.id)}
                aria-pressed={design === d.id}
                className={`flex flex-col items-center gap-1.5 rounded-xl border p-2 text-left ${design === d.id ? 'border-forest-700 ring-2 ring-forest-100' : 'border-cream-300 bg-white hover:border-forest-500'}`}
              >
                <canvas ref={(el) => void (thumbs.current[d.id] = el)} width={216} height={384} className="w-full max-w-[110px] rounded-lg border border-cream-200" />
                <span className="text-sm font-semibold text-forest-900">{d.name}</span>
                <span className="hidden text-center text-xs text-muted sm:block">{d.desc}</span>
              </button>
            ))}
          </div>
        </section>

        <section className={box}>
          <h2 className={heading}>3. 주제와 장면</h2>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              id="kw-topic"
              className={field}
              value={topic}
              maxLength={200}
              placeholder="예: 시험기간 응원, 비 오는 날 따뜻한 한 그릇, 새해 다짐"
              onChange={(e) => setTopic(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !working && writeScenes()}
            />
            <select id="kw-count" className={field + ' sm:w-28'} value={count} onChange={(e) => setCount(Number(e.target.value))} aria-label="장면 수">
              {Array.from({ length: KEYWORD_SCENES_MAX - KEYWORD_SCENES_MIN + 1 }, (_, i) => i + KEYWORD_SCENES_MIN).map((n) => (
                <option key={n} value={n}>
                  장면 {n}개
                </option>
              ))}
            </select>
            <button className="shrink-0 rounded-lg bg-forest-700 px-4 py-2 text-sm font-semibold text-cream-50 hover:bg-forest-900 disabled:bg-cream-300" disabled={working} onClick={() => writeScenes(!fresh)}>
              {fresh ? '장면 자동 작성' : '다시 쓰기'}
            </button>
          </div>
          <p className="mt-1.5 text-xs text-muted">AI가 장면마다 핵심어 한 단어와 이어지는 문장을 써요. 문장 속 *단어*는 강조 표시가 돼요.</p>

          <ol className="mt-3 flex flex-col gap-2">
            {scenes.map((s, i) => (
              <li key={i} className="rounded-xl border border-cream-300 bg-white p-3">
                <div className="mb-1.5 flex items-center justify-between text-xs text-muted">
                  <span className="font-semibold text-forest-900">장면 {i + 1}</span>
                  <span className="flex gap-2">
                    <button disabled={i === 0} className="disabled:opacity-30" aria-label="위로" onClick={() => moveScene(i, -1)}>
                      ▲
                    </button>
                    <button disabled={i === scenes.length - 1} className="disabled:opacity-30" aria-label="아래로" onClick={() => moveScene(i, 1)}>
                      ▼
                    </button>
                    <button disabled={scenes.length <= 1} className="text-red-700 disabled:opacity-30" onClick={() => setScenes(scenes.filter((_, j) => j !== i))}>
                      삭제
                    </button>
                  </span>
                </div>
                <div className="grid gap-2 sm:grid-cols-[140px_minmax(0,1fr)]">
                  <label className="text-xs text-muted">
                    <span className="flex justify-between">
                      핵심어
                      <span className={plain(s.kw).length > KEYWORD_LIMITS.kw ? 'text-amber-700' : ''}>
                        {plain(s.kw).length}/{KEYWORD_LIMITS.kw}
                      </span>
                    </span>
                    <input id={`kw-k${i}`} className={field + ' mt-1 text-ink'} value={s.kw} maxLength={12} onChange={(e) => patchScene(i, { kw: e.target.value })} />
                  </label>
                  <label className="text-xs text-muted">
                    <span className="flex justify-between">
                      문장
                      <span className={plain(s.sent).length > KEYWORD_LIMITS.sent ? 'text-amber-700' : ''}>
                        {plain(s.sent).length}/{KEYWORD_LIMITS.sent}
                      </span>
                    </span>
                    <input id={`kw-s${i}`} className={field + ' mt-1 text-ink'} value={s.sent} maxLength={60} onChange={(e) => patchScene(i, { sent: e.target.value })} />
                  </label>
                </div>
              </li>
            ))}
          </ol>
          {scenes.length < KEYWORD_SCENES_MAX && (
            <button className="mt-2 w-full rounded-xl border border-dashed border-cream-300 py-2 text-sm text-forest-700 hover:border-forest-500" onClick={() => setScenes([...scenes, { kw: '', sent: '' }])}>
              + 장면 추가
            </button>
          )}
        </section>

        <section className={box}>
          <h2 className={heading}>4. 소리</h2>
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={voice} onChange={(e) => setVoice(e.target.checked)} /> AI 음성 (문장을 읽어 줌)
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={music} onChange={(e) => setMusic(e.target.checked)} /> 배경음악
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={aiLabel} disabled={!voice} onChange={(e) => setAiLabel(e.target.checked)} /> 화면에 "AI 음성" 표시
            </label>
          </div>
          <p className="mt-1.5 text-xs text-muted">핵심어가 나온 뒤 문장이 시작될 때 음성이 읽어요. 음성이 길면 장면도 그만큼 길어져요. 표시를 끄면 게시글 본문에 AI 음성임을 꼭 적어 주세요.</p>
        </section>
      </div>

      <aside className="flex flex-col gap-4 lg:sticky lg:top-4 lg:self-start">
        <div className={box + ' flex flex-col items-center gap-3'}>
          <canvas ref={canvas} width={KW_W} height={KW_H} className="w-full max-w-[300px] rounded-xl border border-cream-200 shadow-sm" aria-label="핵심어 타이포 미리보기" />
          <button className="w-full max-w-[300px] rounded-xl border border-cream-300 bg-white py-2 text-sm hover:border-forest-500 disabled:opacity-50" disabled={working && !playing} onClick={play}>
            {playing ? '■ 멈춤' : '▶ 소리와 함께 미리보기'}
          </button>
        </div>
        <div className={box + ' flex flex-col gap-2'}>
          <button className="w-full rounded-xl bg-forest-700 py-3 text-[15px] font-semibold text-cream-50 hover:bg-forest-900 disabled:bg-cream-300 disabled:text-muted" disabled={working} onClick={makeVideo}>
            {fresh ? '주제로 영상 한 번에 만들기' : 'MP4 만들기'}
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
        <ReelCaption brandName={store.name} topic={topic} content={usable.map((s) => `${plain(s.kw)} — ${plain(s.sent)}`).join('\n')} storageKey="snsroom.keyword.caption" />
      </aside>

    </div>
  )
}
