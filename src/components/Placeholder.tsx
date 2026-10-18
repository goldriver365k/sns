// 아직 구현 전인 화면에 보여주는 안내 상자
export default function Placeholder({ step, items }: { step: string; items: string[] }) {
  return (
    <div className="rounded-2xl border border-dashed border-cream-300 bg-cream-50 p-8">
      <div className="text-sm font-semibold text-forest-500">{step}에서 구현 예정</div>
      <ul className="mt-3 list-disc space-y-1 pl-5 text-[15px] text-muted">
        {items.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
    </div>
  )
}
