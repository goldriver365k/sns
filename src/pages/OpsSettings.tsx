import PageHeader from '../components/PageHeader'
import Placeholder from '../components/Placeholder'

export default function OpsSettings() {
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="운영 설정" description="자동 생성 시간, 채널, 주간 편성표를 관리합니다." />
      <Placeholder step="6단계" items={['자동 생성 시간', '채널 켜기/끄기와 [지금 생성]', '채널별 주간 편성표와 기본 디자인']} />
    </div>
  )
}
