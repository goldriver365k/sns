import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { ReelPlayer } from './player'
import { buildReelMix, type ReelMix } from './sound'
import { sceneTimes } from './store'
import type { ReelProject } from './types'
import { narration } from './voice'

/** 새 음성을 만들었을 때 소리를 다시 합치라는 신호 */
let version = 0
const listeners = new Set<() => void>()
export function voicesChanged() {
  version++
  listeners.forEach((l) => l())
}
function useVoiceVersion() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => version,
  )
}

const SR = 48000

/**
 * 미리보기 소리: 프로젝트 소리를 합쳐 두고, 재생 시계(player)에 맞춰 튼다.
 * 위치를 옮기거나 구간 반복으로 시간이 튀면 그 자리부터 다시 튼다.
 */
export function useReelAudio(p: ReelProject, player: ReelPlayer) {
  const v = useVoiceVersion()
  const [mix, setMix] = useState<ReelMix | null>(null)
  const ctxRef = useRef<AudioContext | null>(null)
  const bufRef = useRef<AudioBuffer | null>(null)
  const srcRef = useRef<{ node: AudioBufferSourceNode; ctxStart: number; offset: number } | null>(null)

  const sig = JSON.stringify([p.audio, p.language, p.duration, p.scenes.map((s) => narration(s)), sceneTimes(p).map((t) => t.start.toFixed(3)), v])

  useEffect(() => {
    let alive = true
    const id = setTimeout(() => {
      buildReelMix(p, SR)
        .then((m) => alive && setMix(m))
        .catch(() => alive && setMix(null))
    }, 300)
    return () => {
      alive = false
      clearTimeout(id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig])

  function stop() {
    try {
      srcRef.current?.node.stop()
    } catch {
      // 이미 멈춤
    }
    srcRef.current = null
  }

  function start(offset: number) {
    stop()
    const buf = bufRef.current
    if (!buf) return
    ctxRef.current ??= new AudioContext({ sampleRate: SR })
    const ctx = ctxRef.current
    void ctx.resume()
    const node = ctx.createBufferSource()
    node.buffer = buf
    node.connect(ctx.destination)
    node.start(0, Math.max(0, Math.min(buf.duration - 0.01, offset)))
    srcRef.current = { node, ctxStart: ctx.currentTime, offset }
  }

  // 합친 소리가 바뀌면 버퍼를 새로 만들고, 재생 중이면 이어서 튼다
  useEffect(() => {
    if (!mix) {
      bufRef.current = null
      stop()
      return
    }
    const buf = new AudioBuffer({ length: mix.pcm.length, numberOfChannels: 1, sampleRate: mix.sampleRate })
    buf.copyToChannel(mix.pcm as Float32Array<ArrayBuffer>, 0)
    bufRef.current = buf
    if (player.playingRef.current) start(player.timeRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mix])

  // 재생·일시정지·위치 이동을 따라간다
  useEffect(() => {
    if (!player.playing) {
      stop()
      return
    }
    start(player.timeRef.current)
    const id = setInterval(() => {
      const s = srcRef.current
      const ctx = ctxRef.current
      if (!ctx || !bufRef.current) return
      const expected = s ? s.offset + (ctx.currentTime - s.ctxStart) : -1
      if (!s || Math.abs(expected - player.timeRef.current) > 0.2) start(player.timeRef.current)
    }, 150)
    return () => {
      clearInterval(id)
      stop()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player.playing])

  useEffect(
    () => () => {
      stop()
      void ctxRef.current?.close()
    },
    [],
  )

  return mix
}
