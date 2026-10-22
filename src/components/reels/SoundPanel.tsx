import { useEffect, useRef, useState } from 'react'
import { REEL_SPEEDS, REEL_STYLES, REEL_VOICES } from '../../../shared/reelVoice'
import { getFile, putFile } from '../../reels/localFiles'
import { voicesChanged } from '../../reels/previewAudio'
import { VOICE_DELAY, VOICE_GAP, voiceSeconds } from '../../reels/sound'
import { getProject, newSceneId, updateProject } from '../../reels/store'
import type { ReelAudio, ReelDuration, ReelProject } from '../../reels/types'
import { findVoice, getVoice, narration, voiceKey, voiceRequest } from '../../reels/voice'

const field = 'w-full rounded-lg border border-cream-300 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-forest-500'
const label = 'mb-1 block text-xs text-muted'
const DURATIONS: ReelDuration[] = [10, 15, 30, 60]

/** 음성이 없을 때 대략의 읽기 시간 */
const estimate = (text: string) => (text ? 0.3 + text.replace(/\s/g, '').length * 0.17 : 0)

/** 장면 길이를 나레이션 길이에 맞춘다. 영상 길이보다 길면 필요한 초를 돌려준다 */
async function fitToVoice(): Promise<{ need: number }> {
  const p = getProject()
  const secs = await voiceSeconds(p)
  const need = p.scenes.map((s, i) => (secs[i] ?? estimate(narration(s))) + VOICE_DELAY + VOICE_GAP)
  const total = need.reduce((a, b) => a + b, 0)
  updateProject((cur) => ({
    scenes: cur.scenes.map((s, i) => ({ ...s, weight: Math.max(0.5, Math.round((need[i] ?? 1) * 10) / 10) })),
  }))
  return { need: total }
}

/** 목소리(AI 나레이션)·배경음악 설정 */
export default function SoundPanel({ project }: { project: ReelProject }) {
  const a = project.audio
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [fit, setFit] = useState<{ need: number } | null>(null)
  const [ready, setReady] = useState<number | null>(null)
  const [musicHere, setMusicHere] = useState(true)
  const abort = useRef<AbortController | null>(null)
  const sample = useRef<HTMLAudioElement | null>(null)
  const musicInput = useRef<HTMLInputElement>(null)

  const set = (patch: Partial<ReelAudio>) => updateProject((cur) => ({ audio: { ...cur.audio, ...patch } }))
  const texts = project.scenes.map((s) => narration(s))
  const keySig = JSON.stringify([a.voice, a.style, a.speed, project.language, texts])

  // 지금 설정·자막으로 준비된 음성 수 (저장된 것만 확인, 새로 만들지 않음)
  useEffect(() => {
    let alive = true
    Promise.all(texts.map((t) => (t ? findVoice(voiceKey(voiceRequest(t, a, project.language))) : Promise.resolve(null)))).then(
      (list) => alive && setReady(list.filter(Boolean).length),
    )
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keySig, busy])

  useEffect(() => {
    let alive = true
    if (a.music === 'file' && a.musicFile) getFile(a.musicFile.id).then((b) => alive && setMusicHere(!!b))
    else setMusicHere(true)
    return () => {
      alive = false
    }
  }, [a.music, a.musicFile])

  useEffect(() => () => sample.current?.pause(), [])

  async function preview() {
    setError(null)
    setBusy('preview')
    try {
      const text = texts.find(Boolean) || '안녕하세요. 이 목소리로 릴스를 읽어 드립니다.'
      const buf = await getVoice(voiceRequest(text, a, project.language))
      sample.current?.pause()
      const url = URL.createObjectURL(new Blob([buf], { type: 'audio/mpeg' }))
      const el = new Audio(url)
      el.onended = () => URL.revokeObjectURL(url)
      sample.current = el
      await el.play()
    } catch (e) {
      setError(e instanceof Error ? e.message : '미리 듣기를 하지 못했습니다.')
    } finally {
      setBusy(null)
    }
  }

  async function makeAll() {
    setError(null)
    setInfo(null)
    setFit(null)
    abort.current = new AbortController()
    const list = texts.map((t, i) => ({ t, i })).filter((x) => x.t)
    if (!list.length) return setError('읽을 자막이 없습니다. 먼저 장면 자막을 써 주세요.')
    try {
      for (let k = 0; k < list.length; k++) {
        setBusy(`음성 만드는 중 ${k + 1}/${list.length}`)
        await getVoice(voiceRequest(list[k].t, a, project.language), abort.current.signal)
      }
      if (!a.voiceOn) set({ voiceOn: true })
      voicesChanged()
      setBusy('장면 길이 맞추는 중')
      const r = await fitToVoice()
      setFit(r)
      setInfo(`장면 ${list.length}개 음성을 준비하고, 장면 길이를 나레이션에 맞췄습니다. 자막은 읽는 동안 그 장면에 나옵니다.`)
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') setError('멈췄습니다. 만든 음성은 저장되어 다시 만들지 않습니다.')
      else setError(e instanceof Error ? e.message : '음성을 만들지 못했습니다.')
    } finally {
      voicesChanged()
      setBusy(null)
      abort.current = null
    }
  }

  async function refit() {
    setBusy('장면 길이 맞추는 중')
    try {
      setFit(await fitToVoice())
      setInfo('장면 길이를 나레이션에 다시 맞췄습니다.')
    } finally {
      setBusy(null)
    }
  }

  async function pickMusic(file: File) {
    setError(null)
    if (!file.type.startsWith('audio/')) return setError('음악(오디오) 파일만 넣을 수 있습니다.')
    if (file.size > 30 * 1024 * 1024) return setError('음악 파일은 30MB까지 넣을 수 있습니다.')
    const id = 'm' + newSceneId()
    try {
      await putFile(id, file)
      set({ music: 'file', musicFile: { id, name: file.name } })
      setMusicHere(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : '음악 파일을 저장하지 못했습니다.')
    }
  }

  const textScenes = texts.filter(Boolean).length
  const over = fit && fit.need > project.duration + 0.05
  const longer = over ? DURATIONS.find((d) => d >= fit!.need) : undefined

  return (
    <div className="space-y-4">
      <div>
        <label className="flex items-center gap-2 text-sm font-semibold text-forest-900">
          <input type="checkbox" checked={a.voiceOn} onChange={(e) => set({ voiceOn: e.target.checked })} className="accent-forest-700" />
          AI 목소리로 자막 읽기
        </label>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <div className="col-span-2">
            <label className={label} htmlFor="rv-voice">목소리</label>
            <select id="rv-voice" value={a.voice} onChange={(e) => set({ voice: e.target.value as ReelAudio['voice'] })} className={field}>
              {REEL_VOICES.map((v) => (
                <option key={v.id} value={v.id}>{v.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={label} htmlFor="rv-style">말투</label>
            <select id="rv-style" value={a.style} onChange={(e) => set({ style: e.target.value as ReelAudio['style'] })} className={field}>
              {REEL_STYLES.map((s) => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={label} htmlFor="rv-speed">속도</label>
            <select id="rv-speed" value={a.speed} onChange={(e) => set({ speed: Number(e.target.value) })} className={field}>
              {REEL_SPEEDS.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-1.5">
          <button onClick={preview} disabled={!!busy} className="rounded-xl border border-forest-700 bg-white py-2 text-sm font-semibold text-forest-700 disabled:opacity-60">
            {busy === 'preview' ? '불러오는 중…' : '▶ 미리 듣기'}
          </button>
          {busy?.startsWith('음성') ? (
            <button onClick={() => abort.current?.abort()} className="rounded-xl bg-red-700 py-2 text-xs font-semibold text-white">
              {busy} · 멈추기
            </button>
          ) : (
            <button onClick={makeAll} disabled={!!busy} className="rounded-xl bg-forest-700 py-2 text-sm font-semibold text-cream-50 disabled:opacity-60">
              🎙 음성 만들기
            </button>
          )}
        </div>
        <p className="mt-1.5 text-[11px] leading-snug text-muted">
          준비된 음성 {ready ?? '…'}/{textScenes}장면.{' '}
          {ready !== null && ready < textScenes && '자막·목소리·말투·속도를 바꾼 장면은 [음성 만들기]를 다시 눌러 주세요. '}
          [음성 만들기]는 장면마다 OpenAI 음성 사용료가 듭니다. 한 번 만든 음성은 저장되어 다시 쓰면 비용이 들지 않습니다. 속도는 AI에게 요청하는 방식이라 정확한 배속은 아닙니다. 영상 왼쪽 위에 "AI 음성"이 표시됩니다.
        </p>
        {ready !== null && ready > 0 && !busy && (
          <button onClick={refit} className="mt-1 text-xs font-medium text-forest-500 underline">
            장면 길이를 나레이션에 다시 맞추기
          </button>
        )}
        {info && <p className="mt-1 text-xs text-forest-700">{info}</p>}
        {over && (
          <div className="mt-1 rounded-lg bg-yellow-50 px-3 py-2 text-xs text-yellow-800">
            나레이션이 약 {fit!.need.toFixed(1)}초라 {project.duration}초 영상에 다 들어가지 않아 말이 겹칠 수 있습니다. 자막을 줄이거나 속도를 높이거나,
            {longer ? (
              <button onClick={() => updateProject({ duration: longer })} className="ml-1 font-semibold underline">
                영상을 {longer}초로 늘리기
              </button>
            ) : (
              ' 장면을 줄여 주세요.'
            )}
          </div>
        )}
      </div>

      <div className="border-t border-cream-300 pt-3">
        <div className="mb-1.5 text-sm font-semibold text-forest-900">배경음악</div>
        <div className="grid grid-cols-3 gap-1">
          {(
            [
              ['none', '없음'],
              ['builtin', '기본 음악'],
              ['file', '내 음악'],
            ] as const
          ).map(([id, text]) => (
            <button
              key={id}
              onClick={() => (id === 'file' && !a.musicFile ? musicInput.current?.click() : set({ music: id }))}
              aria-pressed={a.music === id}
              className={`rounded-lg border py-1.5 text-xs ${a.music === id ? 'border-forest-700 bg-forest-700 text-cream-50' : 'border-cream-300 bg-white'}`}
            >
              {text}
            </button>
          ))}
        </div>
        <input
          ref={musicInput}
          type="file"
          accept="audio/*"
          hidden
          aria-label="음악 파일"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) pickMusic(f)
            e.target.value = ''
          }}
        />
        {a.music === 'builtin' && <p className="mt-1 text-[11px] text-muted">밝은 우쿨렐레풍 음악을 이 앱이 직접 만들어 넣습니다(외부 음원 아님 — 저작권 걱정 없음).</p>}
        {a.music === 'file' && a.musicFile && (
          <div className="mt-1 text-[11px] text-muted">
            <span className={musicHere ? '' : 'text-red-700'}>
              {a.musicFile.name}
              {!musicHere && ' — 이 기기에 파일이 없습니다'}
            </span>{' '}
            <button onClick={() => musicInput.current?.click()} className="font-medium text-forest-500 underline">
              {musicHere ? '바꾸기' : '다시 선택'}
            </button>
            <p className="mt-0.5">상업적으로 써도 되는 음원인지 꼭 확인해 주세요. 음악 파일은 이 기기에만 저장됩니다.</p>
          </div>
        )}
        {a.music !== 'none' && (
          <div className="mt-2 space-y-1.5">
            <label className="flex items-center gap-2 text-xs text-muted">
              음량
              <input type="range" min={0} max={1} step={0.05} value={a.musicVolume} onChange={(e) => set({ musicVolume: Number(e.target.value) })} className="flex-1 accent-forest-700" aria-label="음악 음량" />
              <span className="w-8 text-right">{Math.round(a.musicVolume * 100)}%</span>
            </label>
            <label className="flex items-center gap-2 text-xs text-muted">
              <input type="checkbox" checked={a.ducking} onChange={(e) => set({ ducking: e.target.checked })} className="accent-forest-700" />
              목소리가 나올 때 음악 자동으로 줄이기
            </label>
          </div>
        )}
      </div>
      {error && <p className="text-xs text-red-700">{error}</p>}
    </div>
  )
}
