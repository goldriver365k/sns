import PageHeader from '../components/PageHeader'
import Placeholder from '../components/Placeholder'

export default function ContentCalendar() {
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="콘텐츠 캘린더" description="날짜별로 만든 콘텐츠와 편성 주제를 한눈에 봅니다." />
      <Placeholder step="8단계" items={['월간 달력에 날짜별 콘텐츠 표시', '채널별 주간 편성 주제 표시']} />
    </div>
  )
}
