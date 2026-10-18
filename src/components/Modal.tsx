import { useEffect, type ReactNode } from 'react'
import { IconClose } from './Icons'

export default function Modal({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative flex max-h-[90vh] w-full max-w-lg flex-col rounded-t-3xl bg-cream-50 shadow-xl sm:rounded-3xl">
        <div className="flex items-center justify-between border-b border-cream-300 px-6 py-4">
          <h2 className="text-lg font-bold text-forest-900">{title}</h2>
          <button aria-label="닫기" onClick={onClose} className="p-1 text-muted hover:text-ink">
            <IconClose className="h-5 w-5" />
          </button>
        </div>
        <div className="overflow-y-auto px-6 py-5">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-cream-300 px-6 py-4">{footer}</div>}
      </div>
    </div>
  )
}
