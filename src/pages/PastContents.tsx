import PageHeader from '../components/PageHeader'
import Placeholder from '../components/Placeholder'

export default function PastContents() {
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="지난 콘텐츠" description="지금까지 만든 콘텐츠를 날짜별로 다시 봅니다." />
      <Placeholder step="8단계" items={['날짜·채널·SNS 종류별 조회', '수동 생성과 자동 생성 결과 모두 표시']} />
    </div>
  )
}
