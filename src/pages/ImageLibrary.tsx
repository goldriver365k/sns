import PageHeader from '../components/PageHeader'
import Placeholder from '../components/Placeholder'

export default function ImageLibrary() {
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="이미지 보관함" description="업로드한 사진 원본을 모아 두고 카드 편집기에서 다시 사용합니다." />
      <Placeholder step="8단계" items={['사진 업로드(원본은 Firebase Storage에 보관)', '태그·날짜로 찾기', '카드 편집기에서 바로 선택']} />
    </div>
  )
}
