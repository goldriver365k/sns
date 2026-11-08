import { useState } from 'react'
import PageHeader from '../components/PageHeader'
import {
  btnDanger, btnGhost, btnLink, btnPrimary, btnPrimarySm, btnSecondary, card, cardLg, cardTitle, chip, emptyBox, errorText, field, fieldLabel, help,
  inputBase, label, okText, pageTitle, panel, sectionTitle, seg,
} from '../components/ui'

const COLORS: { name: string; token: string; role: string }[] = [
  { name: 'cream-100', token: 'bg-cream-100', role: '화면 바탕' },
  { name: 'cream-50', token: 'bg-cream-50', role: '카드 바탕' },
  { name: 'cream-200', token: 'bg-cream-200', role: '옅은 칸' },
  { name: 'cream-300', token: 'bg-cream-300', role: '테두리' },
  { name: 'forest-50', token: 'bg-forest-50', role: '포인트 옅게' },
  { name: 'forest-100', token: 'bg-forest-100', role: '포커스 링' },
  { name: 'forest-500', token: 'bg-forest-500', role: '포인트 밝게' },
  { name: 'forest-700', token: 'bg-forest-700', role: '포인트 (주 색)' },
  { name: 'forest-900', token: 'bg-forest-900', role: '포인트 짙게' },
  { name: 'ink', token: 'bg-ink', role: '글자' },
  { name: 'muted', token: 'bg-muted', role: '흐린 글자' },
  { name: 'ok / warn / danger', token: 'bg-ok', role: '상태' },
]

/** 디자인 가이드: 디자인 시스템(docs/DESIGN.md)의 토큰과 공용 스타일을 실제 모양으로 보여 준다 */
export default function DesignGuide() {
  const [pick, setPick] = useState('한국어')
  const [len, setLen] = useState(15)
  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <PageHeader title="디자인 가이드" description="화면을 만들 때 쓰는 색·글자·부품입니다. 규칙 문서: docs/DESIGN.md · 스타일: src/components/ui.ts" />

      <section className={cardLg}>
        <h2 className={`${sectionTitle} mb-4`}>색</h2>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {COLORS.map((c) => (
            <li key={c.name}>
              <div className={`h-14 rounded-xl border border-cream-300 ${c.token}`}>
                {c.name.startsWith('ok') && (
                  <div className="flex h-full overflow-hidden rounded-xl">
                    <span className="flex-1 bg-ok" />
                    <span className="flex-1 bg-warn" />
                    <span className="flex-1 bg-danger" />
                  </div>
                )}
              </div>
              <div className="mt-1 text-xs font-semibold text-ink">{c.name}</div>
              <div className="text-[11px] text-muted">{c.role}</div>
            </li>
          ))}
        </ul>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className="hero-gradient flex h-24 items-center justify-center rounded-[28px] text-sm font-semibold text-ink">hero-gradient (첫 화면 위쪽만)</div>
          <div className="flex h-24 items-center justify-center rounded-2xl border border-cream-300 bg-white">
            <span className="text-gradient text-2xl font-bold">text-gradient (큰 제목만)</span>
          </div>
        </div>
      </section>

      <section className={cardLg}>
        <h2 className={`${sectionTitle} mb-4`}>글자</h2>
        <div className="space-y-3">
          <div className={pageTitle}>화면 제목 · pageTitle</div>
          <div className={sectionTitle}>묶음 제목 · sectionTitle</div>
          <div className={cardTitle}>카드 제목 · cardTitle</div>
          <p className="text-[15px] text-ink">본문 15px — 주 입력과 설명에 씁니다.</p>
          <p className="text-sm text-ink">작은 본문 14px — 패널 안 버튼·입력.</p>
          <p className="text-xs text-muted">설명 12px — 라벨·부가 정보.</p>
          <p className={help}>도움말 11px · help — 버튼 아래 짧은 안내.</p>
          <p className={errorText}>오류 · errorText — 저장하지 못했습니다.</p>
          <p className={okText}>완료 · okText — 저장되었습니다.</p>
        </div>
      </section>

      <section className={cardLg}>
        <h2 className={`${sectionTitle} mb-4`}>버튼</h2>
        <div className="flex flex-wrap items-center gap-2">
          <button className={btnPrimary}>주 버튼 · btnPrimary</button>
          <button className={btnPrimarySm}>작은 주 버튼</button>
          <button className={btnSecondary}>보조 · btnSecondary</button>
          <button className={btnGhost}>조용한 · btnGhost</button>
          <button className={btnPrimary} disabled>못 누름</button>
          <button className={btnLink}>글자 버튼 · btnLink</button>
          <button className={btnDanger}>삭제 · btnDanger</button>
        </div>
        <p className={`${help} mt-3`}>한 카드에 주 버튼은 하나만. 두 번째 동작은 보조, 취소는 조용한 버튼.</p>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className={cardLg}>
          <h2 className={`${sectionTitle} mb-4`}>입력</h2>
          <label className={fieldLabel} htmlFor="dg-big">큰 입력 · fieldLabel + inputBase</label>
          <input id="dg-big" className={inputBase} placeholder="게시물 만들기 같은 주 입력" />
          <label className={`${label} mt-4`} htmlFor="dg-small">작은 입력 · label + field</label>
          <input id="dg-small" className={field} placeholder="편집 패널 안 입력" />
        </div>
        <div className={cardLg}>
          <h2 className={`${sectionTitle} mb-4`}>고르기</h2>
          <div className="flex flex-wrap gap-1.5">
            {['한국어', '영어', '중국어', '일본어'].map((x) => (
              <button key={x} onClick={() => setPick(x)} aria-pressed={pick === x} className={chip(pick === x)}>{x}</button>
            ))}
          </div>
          <p className={`${help} mt-1`}>chip(on) — 여러 개 중 고르기</p>
          <div className="mt-4 grid grid-cols-4 gap-1.5">
            {[10, 15, 30, 60].map((d) => (
              <button key={d} onClick={() => setLen(d)} aria-pressed={len === d} className={seg(len === d)}>{d}초</button>
            ))}
          </div>
          <p className={`${help} mt-1`}>seg(on) — 나란한 몇 개 중 하나</p>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <div className={card}>
          <h3 className={cardTitle}>카드 · card</h3>
          <p className="text-sm text-muted">설정 묶음·결과 칸. 흰 바탕 + 테두리 + 옅은 그림자.</p>
          <div className={`${panel} mt-3 text-xs text-muted`}>안쪽 칸 · panel</div>
        </div>
        <div className={emptyBox}>비어 있음 · emptyBox</div>
        <div className="rounded-2xl border border-cream-300 bg-cream-50 p-4 shadow-pop">
          <h3 className={cardTitle}>떠 있는 것 · shadow-pop</h3>
          <p className="text-sm text-muted">팝업·강조 카드</p>
        </div>
      </section>
    </div>
  )
}
