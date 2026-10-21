import { useEffect, useRef, useState } from 'react'

/**
 * 미리보기 재생 시계. 화면 그리기는 timeRef를 매 프레임 읽고,
 * 화면의 시간 표시·타임라인 막대는 0.1초마다만 갱신해 화면이 무거워지지 않게 한다.
 */
export function useReelPlayer(duration: number) {
  const timeRef = useRef(0)
  const playingRef = useRef(false)
  const rangeRef = useRef<[number, number] | null>(null)
  const [time, setTime] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [range, setRangeState] = useState<[number, number] | null>(null)
  const durRef = useRef(duration)
  durRef.current = duration

  useEffect(() => {
    let raf = 0
    let last = performance.now()
    let lastUi = 0
    const tick = (now: number) => {
      const dt = (now - last) / 1000
      last = now
      if (playingRef.current) {
        const [a, b] = rangeRef.current ?? [0, durRef.current]
        let t = timeRef.current + dt
        if (t >= b) t = a + ((t - a) % Math.max(0.01, b - a))
        if (t < a) t = a
        timeRef.current = t
      }
      if (now - lastUi > 100) {
        lastUi = now
        setTime(timeRef.current)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  return {
    timeRef,
    playingRef,
    time,
    playing,
    range,
    seek(t: number) {
      timeRef.current = Math.max(0, Math.min(durRef.current - 0.001, t))
      setTime(timeRef.current)
    },
    play() {
      if (timeRef.current >= durRef.current - 0.01) timeRef.current = rangeRef.current?.[0] ?? 0
      playingRef.current = true
      setPlaying(true)
    },
    pause() {
      playingRef.current = false
      setPlaying(false)
    },
    /** 특정 구간만 반복 재생 (장면 미리보기). null이면 전체 */
    setRange(r: [number, number] | null) {
      rangeRef.current = r
      setRangeState(r)
      if (r) timeRef.current = r[0]
    },
  }
}

export type ReelPlayer = ReturnType<typeof useReelPlayer>
