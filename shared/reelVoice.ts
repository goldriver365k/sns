// AI 자동 릴스 나레이션(AI 음성): 화면·서버 함수가 함께 쓰는 선택지
import { LANGUAGE_NAMES } from './generate'

export const REEL_VOICES = [
  { id: 'coral', label: '여성 · 밝고 친근함' },
  { id: 'nova', label: '여성 · 또렷함' },
  { id: 'shimmer', label: '여성 · 부드러움' },
  { id: 'sage', label: '여성 · 차분함' },
  { id: 'ash', label: '남성 · 밝음' },
  { id: 'echo', label: '남성 · 부드러움' },
  { id: 'onyx', label: '남성 · 낮고 묵직함' },
] as const

export const REEL_STYLES = [
  { id: 'bright', label: '밝고 경쾌하게', text: '밝고 경쾌하게, 친구에게 추천하듯 말한다.' },
  { id: 'calm', label: '차분하고 따뜻하게', text: '차분하고 따뜻하게, 믿음이 가도록 말한다.' },
  { id: 'info', label: '또박또박 정보 전달', text: '아나운서처럼 또박또박 정확하게 정보를 전달한다.' },
  { id: 'ad', label: '광고처럼 힘 있게', text: '광고 내레이션처럼 힘 있고 생동감 있게 말한다.' },
] as const

export const REEL_SPEEDS = [
  { value: 0.9, label: '느리게', text: '조금 느린 속도로' },
  { value: 1, label: '보통', text: '보통 속도로' },
  { value: 1.15, label: '조금 빠르게', text: '조금 빠른 속도로' },
  { value: 1.3, label: '빠르게', text: '빠른 속도로, 쉼을 짧게' },
] as const

export type ReelVoiceId = (typeof REEL_VOICES)[number]['id']
export type ReelStyleId = (typeof REEL_STYLES)[number]['id']

export type ReelVoiceRequest = { text: string; voice: ReelVoiceId; style: ReelStyleId; speed: number; language?: string }

export const REEL_VOICE_TEXT_MAX = 200

export function sanitizeVoiceRequest(raw: Partial<ReelVoiceRequest>): ReelVoiceRequest {
  const voice = REEL_VOICES.some((v) => v.id === raw.voice) ? (raw.voice as ReelVoiceId) : 'coral'
  const style = REEL_STYLES.some((s) => s.id === raw.style) ? (raw.style as ReelStyleId) : 'bright'
  const speed = REEL_SPEEDS.find((s) => s.value === Number(raw.speed))?.value ?? 1
  const text = String(raw.text ?? '').replace(/\*/g, '').replace(/\s+/g, ' ').trim().slice(0, REEL_VOICE_TEXT_MAX)
  const language = raw.language && raw.language in LANGUAGE_NAMES ? raw.language : 'ko'
  return { text, voice, style, speed, language }
}

/** gpt-4o-mini-tts 계열에 보내는 말투 지시 (속도도 여기서 요청) */
export function voiceInstructions(r: ReelVoiceRequest) {
  const style = REEL_STYLES.find((s) => s.id === r.style)!.text
  const speed = REEL_SPEEDS.find((s) => s.value === r.speed)?.text ?? '보통 속도로'
  const lang = r.language && r.language !== 'ko' ? `${LANGUAGE_NAMES[r.language]} 원어민처럼 자연스럽게 말한다.` : '한국어로 말한다.'
  return `${lang} SNS 릴스 영상의 나레이션. ${style} ${speed} 말하고, 문장 끝은 자연스럽게 맺는다.`
}
