/** 아직 만들지 않은 탭 — 작동하는 것처럼 보이지 않게 예정 내용만 안내 */
export default function ReelSoon({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-2xl border border-dashed border-cream-300 bg-cream-50 p-8">
      <div className="text-sm font-semibold text-forest-500">{title} — 다음 단계에서 만듭니다</div>
      <ul className="mt-3 list-disc space-y-1 pl-5 text-[15px] text-muted">
        {items.map((t) => <li key={t}>{t}</li>)}
      </ul>
    </div>
  )
}
