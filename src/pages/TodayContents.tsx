import PageHeader from '../components/PageHeader'
import Placeholder from '../components/Placeholder'

export default function TodayContents() {
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="오늘의 콘텐츠" description="매일 오전 5시에 자동 생성된 콘텐츠를 검토하고 승인합니다." />
      <Placeholder step="7단계" items={['요약: 오늘의 콘텐츠 수 · 검토 대기 · 승인 완료 · 다음 자동 생성 시간', '채널별 필터 탭과 날짜 이동', '스레드 원고(복사 버튼)와 인스타그램 카드 미리보기', 'Hello Korean 5개 언어 묶음(언어 탭)']} />
    </div>
  )
}
