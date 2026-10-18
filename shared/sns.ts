/**
 * SNS 종류별 형식 정의.
 * 화면(입력 폼·결과 표시)과 서버(생성 지시문)가 함께 쓰므로 이 파일 하나만 고치면 양쪽에 반영된다.
 *
 * 각 SNS의 `essentials`는 그 SNS에서 노출(추천·검색)되기 위해 가장 중요한 요소다.
 * 서버는 이것을 "반드시 지킬 항목"으로 AI에게 전달하고, 생성 후에는 `checks`로 자동 검사한다.
 * 플랫폼 정책은 자주 바뀌므로 운영하며 이 파일을 갱신한다. (마지막 정리: 2026-10)
 */

/** 결과물 형태 */
export type OutputKind =
  | 'cards' // 카드 이미지 3장 + 캡션
  | 'text' // 바로 붙여넣는 글
  | 'video' // 짧은 영상 대본 + 설명
  | 'blog' // 제목·소제목이 있는 긴 글

/** 노출 검사에 쓰는 생성 결과 */
export type ReachInput = {
  /** 제목(유튜브·블로그) */
  title?: string
  /** 본문 또는 캡션 */
  body: string
  /** 붙을 해시태그 전체(생성 + 고정) */
  hashtags: string[]
  /** 이 게시물의 핵심 키워드 */
  keyword?: string
}

export type ReachCheck = {
  label: string
  test: (r: ReachInput) => boolean
}

export type SnsProfile = {
  value: string
  label: string
  kind: OutputKind
  /** 화면에 보여줄 결과 설명 */
  summary: string
  /** 본문(캡션) 최대 글자 수. 넘으면 빨간색 경고 */
  maxChars: number
  /**
   * 해시태그 개수 [최소, 최대] — 고정 해시태그 포함 전체 개수.
   * 최대를 넘는 해시태그는 복사할 때 붙이지 않는다(고정 해시태그가 우선).
   */
  hashtags: [number, number]
  /** 서버가 AI에게 전달하는 구성 지침 */
  guide: string
  /** 노출을 위해 반드시 들어가야 하는 요소 (AI 필수 지시 + 화면 안내) */
  essentials: string[]
  /** 생성 결과 자동 검사 */
  checks: ReachCheck[]
  /** 본문에 https:// 링크를 넣으면 노출이 줄어드는 SNS (주소는 도메인 글자로만) */
  noLinks?: boolean
  /** 본문(캡션) 최대 줄 수 — 빈 줄 없이 이 줄 수 안에서 쓴다(사이트 주소 줄 포함, 해시태그 줄 제외) */
  maxLines?: number
}

// ── 검사 도우미 ──────────────────────────────────────────
/** 내용이 있는 줄 수 (빈 줄 제외) */
export const countLines = (t: string) => t.split('\n').filter((l) => l.trim()).length
const firstLine = (t: string) => t.trim().split('\n')[0] ?? ''
const hasKeyword = (text: string, kw?: string) => !kw || text.toLowerCase().includes(kw.toLowerCase())
const countOf = (text: string, kw?: string) => (kw ? text.toLowerCase().split(kw.toLowerCase()).length - 1 : 0)
const endsWithQuestion = (t: string) => /\?|？|까요|나요|세요\?|어때|있나요|인가요/.test(t.trim().split('\n').slice(-3).join(' '))
const hasUrl = (t: string) => /https?:\/\//i.test(t)
const tagCount = (r: ReachInput, min: number, max: number) => r.hashtags.length >= min && r.hashtags.length <= max
/** X는 한글 등 전각 문자를 2자로 센다 */
const xWeightedLength = (t: string) => [...t].reduce((n, ch) => n + (/[ᄀ-￿]/.test(ch) ? 2 : 1), 0)

export const SNS_PROFILES = [
  {
    value: 'instagram',
    label: '인스타그램',
    kind: 'cards',
    summary: '카드 이미지 3장(1080×1350) + 3줄 캡션',
    maxChars: 2200,
    maxLines: 3,
    hashtags: [3, 5],
    guide:
      '카드 3장: 1장 관심을 끄는 제목, 2장 핵심 내용 또는 공감 메시지, 3장 결론 또는 브랜드 연결. 카드 글씨는 짧게. 캡션은 빈 줄 없이 딱 3줄 이내: 1줄 핵심 키워드가 들어간 훅, 2줄 저장·공유를 부르는 한 문장, 3줄 사이트 주소(브랜드에 주소가 있을 때, 없으면 행동 유도). 자세한 내용은 카드에 담고 캡션은 짧게.',
    essentials: [
      '캡션은 3줄 이내(빈 줄 없이) — 짧을수록 끝까지 읽히고, 자세한 내용은 카드에 담는다',
      '캡션 첫 줄에 핵심 키워드와 훅 — 인스타그램 검색은 해시태그보다 캡션 키워드를 더 본다',
      '저장·공유를 부르는 문장(예: "나중에 보려면 저장", "친구에게 보내기") — 저장·공유·DM 전송이 추천 노출의 핵심 신호',
      '주제에 딱 맞는 해시태그 3~5개 (게시물당 최대 5개 제한)',
      '카드 1장째에 한눈에 읽히는 큰 제목 — 첫 장에서 넘겨 보게 만들어야 체류 시간이 늘어난다',
    ],
    checks: [
      { label: '캡션 3줄 이내', test: (r) => countLines(r.body) <= 3 },
      { label: '첫 줄에 핵심 키워드', test: (r) => hasKeyword(firstLine(r.body), r.keyword) },
      { label: '저장·공유 유도 문장', test: (r) => /저장|공유|보내|태그/.test(r.body) },
      { label: '해시태그 3~5개', test: (r) => tagCount(r, 3, 5) },
    ],
  },
  {
    value: 'threads',
    label: '스레드',
    kind: 'text',
    summary: '바로 붙여넣는 글 (500자 이내)',
    maxChars: 500,
    hashtags: [1, 3],
    guide: '대화하듯 짧은 문장. 첫 줄에 시선을 끄는 한 문장, 이어서 짧은 단락 2~4개, 마지막에 질문이나 공감 유도. 이미지·장식 없이 글만.',
    essentials: [
      '핵심 주제 태그 1개 — 스레드는 게시물당 태그 1개만 주제로 인식해 그 주제 피드에 노출된다',
      '첫 줄 훅 — 피드에서 첫 문장만 보고 멈출지 결정된다',
      '답글을 부르는 질문으로 마무리 — 답글·대화가 가장 강한 노출 신호',
      '500자 이내',
    ],
    checks: [
      { label: '해시태그 1~3개', test: (r) => tagCount(r, 1, 3) },
      { label: '질문으로 마무리', test: (r) => endsWithQuestion(r.body) },
      { label: '500자 이내', test: (r) => r.body.length <= 500 },
    ],
  },
  {
    value: 'facebook',
    label: '페이스북',
    kind: 'text',
    summary: '게시글 (1000자 내외 권장)',
    maxChars: 5000,
    hashtags: [1, 3],
    guide: '친근한 설명형. 첫 2줄에 핵심(더보기 전에 보이는 부분), 본문은 단락을 나눠 정보 전달, 마지막에 링크나 행동 유도.',
    essentials: [
      '첫 2줄에 핵심 — 더보기 전에 보이는 부분이 클릭을 결정한다',
      '댓글을 부르는 질문 — 댓글·공유 같은 의미 있는 반응이 노출을 늘린다',
      '해시태그는 1~3개만 — 많으면 오히려 반응이 떨어진다',
    ],
    checks: [
      { label: '질문으로 대화 유도', test: (r) => endsWithQuestion(r.body) },
      { label: '해시태그 1~3개', test: (r) => tagCount(r, 1, 3) },
    ],
  },
  {
    value: 'x',
    label: 'X(트위터)',
    noLinks: true,
    kind: 'text',
    summary: '짧은 글 (한글 기준 약 140자)',
    maxChars: 140,
    hashtags: [1, 2],
    guide: '한 번에 읽히는 한두 문장. 한글은 1자가 2자로 계산되므로 한글 140자 이내. 핵심만 간결하게.',
    essentials: [
      '한글 140자(가중치 280) 이내 — 넘으면 게시 불가',
      '첫 문장에 핵심 — 짧은 시간에 반응이 몰려야 확산된다',
      '해시태그 1~2개 — 많으면 노출이 줄어든다',
      'https:// 링크는 본문에 넣지 않기 — 외부 링크 게시물은 노출이 줄어드는 경향. 주소는 도메인 글자로만 적거나 답글에',
    ],
    checks: [
      { label: '280(가중치) 이내', test: (r) => xWeightedLength(r.body) <= 280 },
      { label: '해시태그 1~2개', test: (r) => tagCount(r, 1, 2) },
      { label: '본문에 https 링크 없음', test: (r) => !hasUrl(r.body) },
    ],
  },
  {
    value: 'tiktok',
    label: '틱톡',
    kind: 'video',
    summary: '15~60초 영상 대본 + 캡션',
    maxChars: 2200,
    hashtags: [3, 5],
    guide: '처음 3초 훅 문장, 장면별 대본(장면 설명 + 자막/내레이션) 4~6개, 마지막 행동 유도. 캡션은 짧게.',
    essentials: [
      '처음 3초 훅 — 끝까지 보는 비율(완주율)이 가장 중요한 노출 신호',
      '핵심 키워드를 캡션과 화면 자막·말에 모두 — 틱톡 검색이 이 셋을 함께 읽는다',
      '해시태그 3~5개 (넓은 태그 1~2 + 주제 태그 2~3)',
      '마지막에 댓글·저장 유도',
    ],
    checks: [
      { label: '캡션에 핵심 키워드', test: (r) => hasKeyword(r.body, r.keyword) },
      { label: '해시태그 3~5개', test: (r) => tagCount(r, 3, 5) },
    ],
  },
  {
    value: 'youtube',
    label: '유튜브 쇼츠',
    kind: 'video',
    summary: '쇼츠 대본 + 제목 + 설명',
    maxChars: 5000,
    hashtags: [2, 3],
    guide: '제목 40자 이내. 처음 3초 훅, 장면별 대본 4~6개, 마무리 구독·행동 유도. 설명란은 2~3줄 요약과 링크.',
    essentials: [
      '제목 앞부분에 핵심 키워드 (40자 이내) — 검색·추천 모두 제목을 가장 먼저 본다',
      '처음 3초 훅 — 스와이프하지 않고 보는 비율이 노출을 결정한다',
      '설명 첫 줄에 키워드 + 해시태그 2~3개 (#Shorts 포함 권장) — 앞의 3개만 제목 위에 표시된다',
    ],
    checks: [
      { label: '제목에 핵심 키워드', test: (r) => hasKeyword(r.title ?? '', r.keyword) },
      { label: '제목 40자 이내', test: (r) => (r.title ?? '').length > 0 && (r.title ?? '').length <= 40 },
      { label: '해시태그 2~3개', test: (r) => tagCount(r, 2, 3) },
    ],
  },
  {
    value: 'naverblog',
    label: '네이버 블로그',
    kind: 'blog',
    summary: '제목 + 소제목이 있는 글 (1500~2500자)',
    maxChars: 10000,
    hashtags: [5, 10],
    guide: '검색에 잘 걸리는 제목(핵심 키워드 포함), 도입부, 소제목 3~5개와 각 단락, 요약 정리, 마무리 인사. 사진 넣을 자리는 [사진: 설명]으로 표시.',
    essentials: [
      '제목 앞쪽에 핵심 키워드 — 네이버 검색은 제목 일치를 가장 크게 본다',
      '본문에 키워드를 자연스럽게 3~6회 (억지 반복은 저품질 판정)',
      '1500자 이상의 직접 경험·정보 위주 글 — 독창성과 충실도(D.I.A.)를 평가한다',
      '사진 자리 3개 이상 [사진: 설명] — 직접 찍은 사진이 많을수록 유리',
      '소제목으로 구조화, 태그 5~10개',
    ],
    checks: [
      { label: '제목에 핵심 키워드', test: (r) => hasKeyword(r.title ?? '', r.keyword) },
      { label: '본문 키워드 3회 이상', test: (r) => !r.keyword || countOf(r.body, r.keyword) >= 3 },
      { label: '1500자 이상', test: (r) => r.body.length >= 1500 },
      { label: '사진 자리 3개 이상', test: (r) => (r.body.match(/\[사진/g) ?? []).length >= 3 },
    ],
  },
  {
    value: 'kakao',
    label: '카카오톡 채널',
    kind: 'text',
    summary: '채널 메시지 (400자 이내) + 버튼 문구',
    maxChars: 400,
    hashtags: [0, 0],
    guide: '받는 사람에게 보내는 안내 메시지. 첫 줄에 용건, 혜택이나 정보 2~3줄, 마지막에 버튼 문구 제안(예: [자세히 보기]). 해시태그는 쓰지 않는다.',
    essentials: [
      '광고성 메시지는 맨 앞에 (광고), 끝에 무료 수신거부 방법 — 법적 의무(정보통신망법), 빠지면 제재',
      '첫 줄(알림 미리보기)에 용건 — 열어 보는 비율을 결정한다',
      '버튼 문구 1개 — 클릭할 곳이 분명해야 반응한다',
      '해시태그는 쓰지 않는다(카카오톡에서는 의미 없음, 고정 해시태그도 붙이지 않음)',
    ],
    checks: [
      { label: '(광고) 표기', test: (r) => r.body.trim().startsWith('(광고)') },
      { label: '수신거부 안내', test: (r) => /수신\s?거부|차단/.test(r.body) },
      { label: '버튼 문구', test: (r) => /\[[^\]]+\]/.test(r.body) },
    ],
  },
  {
    value: 'linkedin',
    label: '링크드인',
    noLinks: true,
    kind: 'text',
    summary: '전문가 톤 게시글 (1300자 내외)',
    maxChars: 3000,
    hashtags: [3, 5],
    guide: '전문적이지만 딱딱하지 않게. 첫 줄 인사이트, 경험·근거, 배운 점이나 제안, 의견을 묻는 질문으로 마무리.',
    essentials: [
      '첫 2줄 훅 — "더보기" 전에 보이는 부분이 클릭을 결정한다',
      '의견을 묻는 질문으로 마무리 — 댓글이 가장 강한 노출 신호',
      'https:// 링크는 본문에 넣지 않기 — 외부 링크 게시물은 노출이 줄어드는 경향. 주소는 도메인 글자로만 적거나 첫 댓글에',
      '해시태그 3~5개',
    ],
    checks: [
      { label: '질문으로 마무리', test: (r) => endsWithQuestion(r.body) },
      { label: '본문에 https 링크 없음', test: (r) => !hasUrl(r.body) },
      { label: '해시태그 3~5개', test: (r) => tagCount(r, 3, 5) },
    ],
  },
] as const satisfies readonly SnsProfile[]

export type SnsType = (typeof SNS_PROFILES)[number]['value']

export function getSnsProfile(value: string): SnsProfile | undefined {
  return SNS_PROFILES.find((p) => p.value === value)
}

/** 생성 결과를 노출 기준으로 검사한다. 화면에 체크리스트로 보여주고, 서버는 실패 항목을 고쳐 다시 생성한다. */
export function checkReach(snsType: string, input: ReachInput) {
  const profile = getSnsProfile(snsType)
  return (profile?.checks ?? []).map((c) => ({ label: c.label, ok: c.test(input) }))
}

/** 화면에 보여줄 글자 수. X는 한글을 2자로 세므로 "한글 기준" 글자 수로 바꿔 보여준다. */
export function countChars(snsType: string, text: string) {
  return snsType === 'x' ? Math.ceil(xWeightedLength(text) / 2) : [...text].length
}
