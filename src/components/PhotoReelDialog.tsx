import { useState } from 'react'
import Modal from './Modal'
import { btnGhost, btnPrimary, fieldLabel, inputBase } from './ui'
import type { ReelDuration } from '../reels/types'

export type PhotoReelInput = { name: string; intro: string; price: string; duration: ReelDuration }

const DURATIONS: ReelDuration[] = [10, 15, 30]

/** 상품 사진 → 릴스·영상: 상품 이름·소개·가격·길이를 받아 자동 릴스 새 프로젝트로 넘긴다 */
export default function PhotoReelDialog({ count, busy, error, onClose, onSubmit }: { count: number; busy: boolean; error: string | null; onClose: () => void; onSubmit: (v: PhotoReelInput) => void }) {
  const [v, setV] = useState<PhotoReelInput>({ name: '', intro: '', price: '', duration: count > 6 ? 30 : 15 })
  const set = (p: Partial<PhotoReelInput>) => setV((x) => ({ ...x, ...p }))

  return (
    <Modal
      title="🎬 릴스·영상으로 만들기"
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className={btnGhost}>
            취소
          </button>
          <button type="button" onClick={() => onSubmit(v)} disabled={busy} className={btnPrimary}>
            {busy ? '옮기는 중…' : '릴스 만들기'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-muted">
          완성한 사진 {count}장을 같은 배경·그림자로 릴스 장면에 맞게 다시 그려 <b className="text-ink">AI 자동 릴스</b> 새 프로젝트로 옮깁니다. 그 화면에서 AI 대본·목소리·배경음악을 넣고 <b className="text-ink">MP4 만들기</b>로 영상을 저장하세요.
        </p>
        <div>
          <label htmlFor="pr-name" className={fieldLabel}>
            상품 이름 <span className="font-normal text-muted">(첫 장면 자막)</span>
          </label>
          <input id="pr-name" value={v.name} maxLength={40} onChange={(e) => set({ name: e.target.value })} placeholder="예) 화산불백 직화 불고기" className={inputBase} />
        </div>
        <div>
          <label htmlFor="pr-intro" className={fieldLabel}>
            한 줄 소개 <span className="font-normal text-muted">(둘째 장면 자막, 선택)</span>
          </label>
          <input id="pr-intro" value={v.intro} maxLength={60} onChange={(e) => set({ intro: e.target.value })} placeholder="예) 불로 굽고, 밥으로 완성하다" className={inputBase} />
        </div>
        <div>
          <label htmlFor="pr-price" className={fieldLabel}>
            가격 <span className="font-normal text-muted">(가격표로 표시, 선택)</span>
          </label>
          <input id="pr-price" value={v.price} maxLength={20} onChange={(e) => set({ price: e.target.value })} placeholder="예) 9,900원" className={inputBase} />
        </div>
        <div>
          <span className={fieldLabel}>영상 길이</span>
          <div className="flex gap-1.5">
            {DURATIONS.map((d) => (
              <button key={d} type="button" aria-pressed={v.duration === d} onClick={() => set({ duration: d })} className={`rounded-full border px-4 py-1.5 text-sm ${v.duration === d ? 'border-forest-700 bg-forest-700 text-cream-50' : 'border-cream-300 bg-white text-ink'}`}>
                {d}초
              </button>
            ))}
          </div>
          <p className="mt-1 text-xs text-muted">사진 1장 = 장면 1개. 장면이 너무 짧지 않도록 10초는 6장, 15초는 10장, 30초는 20장까지 넣습니다.</p>
        </div>
        <p className="text-xs text-muted">지금 열려 있던 릴스 프로젝트는 먼저 저장되고, 내 프로젝트에서 다시 열 수 있습니다.</p>
        {error && <p className="text-sm text-red-700">{error}</p>}
      </div>
    </Modal>
  )
}
