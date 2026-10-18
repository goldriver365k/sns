/**
 * SNS 종류별 형식 정의.
 * 화면(입력 폼·결과 표시)과 서버(생성 지시문)가 함께 쓰므로 이 파일 하나만 고치면 양쪽에 반영된다.
 */

/** 결과물 형태 */
export type OutputKind =
  | 'cards' // 카드 이미지 3장 + 캡션
  | 'text' // 바로 붙여넣는 글
  | 'video' // 짧은 영상 대본 + 설명
  | 'blog' // 제목·소제목이 있는 긴 글

export type SnsProfile = {
  value: string
  label: string
  kind: OutputKind
  /** 화면에 보여줄 결과 설명 */
  summary: string
  /** 본문(캡션) 최대 글자 수. 넘으면 빨간색 경고 */
  maxChars: number
  /** 생성할 때 권장하는 해시태그 개수 [최소, 최대] */
  hashtags: [number, number]
  /** 서버가 AI에게 전달하는 구성 지침 */
  guide: string
}

export const SNS_PROFILES = [
  {
    value: 'instagram',
    label: '인스타그램',
    kind: 'cards',
    summary: '카드 이미지 3장(1080×1350) + 캡션',
    maxChars: 2200,
    hashtags: [5, 10],
    guide:
      '카드 3장: 1장 관심을 끄는 제목, 2장 핵심 내용 또는 공감 메시지, 3장 결론 또는 브랜드 연결. 카드 글씨는 짧게. 캡션은 첫 줄에 핵심을 담고 줄바꿈으로 읽기 쉽게, 마지막에 행동 유도 한 줄.',
  },
  {
    value: 'threads',
    label: '스레드',
    kind: 'text',
    summary: '바로 붙여넣는 글 (500자 이내)',
    maxChars: 500,
    hashtags: [1, 3],
    guide: '대화하듯 짧은 문장. 첫 줄에 시선을 끄는 한 문장, 이어서 짧은 단락 2~4개, 마지막에 질문이나 공감 유도. 이미지·장식 없이 글만.',
  },
  {
    value: 'facebook',
    label: '페이스북',
    kind: 'text',
    summary: '게시글 (1000자 내외 권장)',
    maxChars: 5000,
    hashtags: [2, 5],
    guide: '친근한 설명형. 첫 2줄에 핵심(더보기 전에 보이는 부분), 본문은 단락을 나눠 정보 전달, 마지막에 링크나 행동 유도.',
  },
  {
    value: 'x',
    label: 'X(트위터)',
    kind: 'text',
    summary: '짧은 글 (한글 기준 약 140자)',
    maxChars: 140,
    hashtags: [1, 2],
    guide: '한 번에 읽히는 한두 문장. 한글은 1자가 2자로 계산되므로 한글 140자 이내. 핵심만 간결하게.',
  },
  {
    value: 'tiktok',
    label: '틱톡',
    kind: 'video',
    summary: '15~60초 영상 대본 + 캡션',
    maxChars: 2200,
    hashtags: [3, 5],
    guide: '처음 3초 훅 문장, 장면별 대본(장면 설명 + 자막/내레이션) 4~6개, 마지막 행동 유도. 캡션은 짧게.',
  },
  {
    value: 'youtube',
    label: '유튜브 쇼츠',
    kind: 'video',
    summary: '쇼츠 대본 + 제목 + 설명',
    maxChars: 5000,
    hashtags: [3, 5],
    guide: '제목 40자 이내. 처음 3초 훅, 장면별 대본 4~6개, 마무리 구독·행동 유도. 설명란은 2~3줄 요약과 링크.',
  },
  {
    value: 'naverblog',
    label: '네이버 블로그',
    kind: 'blog',
    summary: '제목 + 소제목이 있는 글 (1500~2500자)',
    maxChars: 10000,
    hashtags: [5, 10],
    guide: '검색에 잘 걸리는 제목(핵심 키워드 포함), 도입부, 소제목 3~5개와 각 단락, 요약 정리, 마무리 인사. 사진 넣을 자리는 [사진: 설명]으로 표시.',
  },
  {
    value: 'kakao',
    label: '카카오톡 채널',
    kind: 'text',
    summary: '채널 메시지 (400자 이내) + 버튼 문구',
    maxChars: 400,
    hashtags: [0, 0],
    guide: '받는 사람에게 보내는 안내 메시지. 첫 줄에 용건, 혜택이나 정보 2~3줄, 마지막에 버튼 문구 제안(예: [자세히 보기]). 해시태그는 쓰지 않는다.',
  },
  {
    value: 'linkedin',
    label: '링크드인',
    kind: 'text',
    summary: '전문가 톤 게시글 (1300자 내외)',
    maxChars: 3000,
    hashtags: [3, 5],
    guide: '전문적이지만 딱딱하지 않게. 첫 줄 인사이트, 경험·근거, 배운 점이나 제안, 의견을 묻는 질문으로 마무리.',
  },
] as const satisfies readonly SnsProfile[]

export type SnsType = (typeof SNS_PROFILES)[number]['value']

export function getSnsProfile(value: string): SnsProfile | undefined {
  return SNS_PROFILES.find((p) => p.value === value)
}
