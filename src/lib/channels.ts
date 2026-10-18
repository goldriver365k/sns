import { useEffect, useState } from 'react'
import { collection, deleteDoc, doc, getDoc, onSnapshot, setDoc, writeBatch } from 'firebase/firestore'
import { db } from './firebase'
import type { SnsType } from './options'

/** 주간·월간 계획의 한 줄 */
export type PlanItem = {
  id: string
  period: 'weekly' | 'monthly'
  /** 주간: 요일(월~일), 월간: 자유 입력(예: 1주차, 15일) */
  when: string
  topic: string
}

/** 브랜드(채널). Firestore `channels/{id}`에 저장한다. */
export type Channel = {
  id: string
  name: string
  /** 주로 쓰는 SNS (비워 두면 제한 없음) */
  sns: SnsType | ''
  siteUrl: string
  description: string
  /** 생성 시 항상 적용할 규칙 */
  rules: string
  plans: PlanItem[]
  order: number
}

export const WEEKDAYS = ['월', '화', '수', '목', '금', '토', '일'] as const

/** 오늘 요일(한국시간 기준) */
export function todayWeekday(): string {
  const day = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' })).getDay()
  return WEEKDAYS[(day + 6) % 7]
}

export function newId() {
  return Math.random().toString(36).slice(2, 10)
}

function weekly(topics: string[]): PlanItem[] {
  return topics.map((topic, i) => ({ id: `w${i}`, period: 'weekly', when: WEEKDAYS[i], topic }))
}

/** 처음 실행할 때 넣는 기본 브랜드. 이후에는 화면에서 수정·추가한다. */
export const DEFAULT_CHANNELS: Channel[] = [
  {
    id: 'bulbaek',
    name: '화산불백',
    sns: 'instagram',
    siteUrl: 'bulbaek.com',
    description: '직화불백덮밥전문점. 슬로건: 불로 굽고, 밥으로 완성하다',
    rules:
      '모든 카드 하단과 캡션에 bulbaek.com을 넣는다. 확인되지 않은 매출, 수익률, 투자비용, 가맹점 수는 절대 만들지 않는다.',
    plans: weekly([
      '음식점 창업 정보 ①',
      '화산불백 브랜드·메뉴 소개',
      '음식점 창업 정보 ②',
      '외식업 트렌드·상권 분석',
      '음식점 창업 정보 ③',
      '화산불백 브랜드·창업 소개',
      '외식업 운영 팁·자영업 정보',
    ]),
    order: 0,
  },
  {
    id: 'hurururuk',
    name: '후루룩찹찹',
    sns: 'instagram',
    siteUrl: '',
    description: '대학생의 관심과 공감을 얻는 브랜드. 음식 홍보만 반복하지 않고 저장·공유하고 싶은 콘텐츠를 만든다.',
    rules: '음식 사진을 AI로 만들거나 실제 메뉴와 다르게 바꾸지 않는다. 검증되지 않은 정보를 사실처럼 쓰지 않는다.',
    plans: weekly([
      '메뉴·맛집 소개',
      '오늘의 사자성어',
      '대학생 관심사',
      '인기 메뉴 소개',
      '캠퍼스 생활·식사 추천',
      '신메뉴·숨겨진 메뉴',
      '공감·응원·브랜드 콘텐츠',
    ]),
    order: 1,
  },
  {
    id: 'haengbok',
    name: '행복대운',
    sns: 'threads',
    siteUrl: 'wishanddo.life',
    description: '매일 새로운 행운·복·대박 주문을 주는 긍정 메시지 채널',
    rules: '짧고 따라 읽기 쉬운 주문 문장 + 짧은 응원 메시지 + 해시태그 3~5개. 모든 원고에 wishanddo.life를 넣는다.',
    plans: weekly(['재물운 주문', '건강운 주문', '인간관계·귀인 주문', '일·합격운 주문', '사랑운 주문', '대박 기원 주문', '감사·복 주문']),
    order: 2,
  },
  {
    id: 'hellokorean',
    name: 'Hello Korean',
    sns: 'threads',
    siteUrl: 'hellokorean.site',
    description: '무료 한글 학습 사이트 Hello Korean 홍보',
    rules: '단순 번역이 아니라 각 언어 사용자에게 자연스러운 문장으로 쓴다.',
    plans: weekly(['자모 원리', '발음', '쓰기', '기초 단어', '학습 팁', '한국 문화 표현', '사이트 소개']),
    order: 3,
  },
]

/**
 * 브랜드 목록을 실시간으로 불러온다.
 * 처음 한 번은 기본 브랜드를 넣고, 저장소에 연결하지 못하면 기본값으로 화면을 보여준다.
 */
export function useChannels() {
  const [channels, setChannels] = useState<Channel[]>(DEFAULT_CHANNELS)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!db) return
    const firestore = db
    // 서버와 한 번도 동기화되지 않은 상태의 캐시 데이터는 일부만 담고 있을 수 있어 무시한다.
    let synced = false
    return onSnapshot(
      collection(firestore, 'channels'),
      async (snap) => {
        if (snap.metadata.fromCache && !synced) return
        synced = true
        setError(null)
        if (snap.empty) {
          // 사용자가 모두 지운 경우와 구분하기 위해 기본값 입력 여부를 기록한다.
          const flag = await getDoc(doc(firestore, 'settings', 'app'))
          if (!flag.data()?.channelsSeeded) {
            const batch = writeBatch(firestore)
            DEFAULT_CHANNELS.forEach(({ id, ...rest }) => batch.set(doc(firestore, 'channels', id), rest))
            batch.set(doc(firestore, 'settings', 'app'), { channelsSeeded: true }, { merge: true })
            await batch.commit()
            return
          }
        }
        const list = snap.docs.map((d) => ({ ...(d.data() as Omit<Channel, 'id'>), id: d.id }))
        setChannels(list.sort((a, b) => a.order - b.order))
      },
      () => setError('브랜드 목록을 불러오지 못했습니다. 기본값을 보여주며, 변경 내용은 저장되지 않을 수 있습니다.'),
    )
  }, [])

  async function saveChannel(ch: Channel) {
    // 화면에 먼저 반영하고 저장한다(저장소 연결이 없어도 화면에서는 동작).
    setChannels((prev) => {
      const exists = prev.some((c) => c.id === ch.id)
      return exists ? prev.map((c) => (c.id === ch.id ? ch : c)) : [...prev, ch]
    })
    if (!db) return
    const { id, ...rest } = ch
    // 서버 응답을 기다리지 않는다(오프라인이면 연결될 때 자동 저장됨). 실패만 알린다.
    setDoc(doc(db, 'channels', id), rest).catch(() => setError('브랜드를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.'))
  }

  async function removeChannel(id: string) {
    setChannels((prev) => prev.filter((c) => c.id !== id))
    if (!db) return
    deleteDoc(doc(db, 'channels', id)).catch(() => setError('브랜드를 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.'))
  }

  return { channels, error, saveChannel, removeChannel }
}
