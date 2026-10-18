import type { ReactNode } from 'react'

export default function PageHeader({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold text-forest-900 sm:text-[28px]">{title}</h1>
        {description && <p className="mt-2 text-[15px] text-muted">{description}</p>}
      </div>
      {action}
    </header>
  )
}
