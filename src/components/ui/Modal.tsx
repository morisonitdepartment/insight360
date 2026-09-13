import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, X } from 'lucide-react'
import { cn } from '@/utils/cn'

interface ModalProps {
  open: boolean
  onClose: () => void
  title: ReactNode
  description?: ReactNode
  children: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full'
}

const SIZES = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-5xl', full: 'max-w-[96vw]' }

function useEscape(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handler)
      document.body.style.overflow = prev
    }
  }, [open, onClose])
}

export function Modal({ open, onClose, title, description, children, footer, size = 'md' }: ModalProps) {
  useEscape(open, onClose)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (open) ref.current?.querySelector<HTMLElement>('input, select, textarea, button')?.focus()
  }, [open])
  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4" role="presentation">
      <div className="absolute inset-0 bg-navy-950/60 backdrop-blur-[2px] animate-fade-in" onClick={onClose} aria-hidden />
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby="modal-title" className={cn('relative w-full card shadow-panel flex flex-col max-h-[92vh] sm:max-h-[88vh] rounded-b-none sm:rounded-b-xl animate-fade-in', SIZES[size])}>
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 dark:border-navy-800 px-5 py-4">
          <div>
            <h2 id="modal-title" className="text-base font-semibold text-slate-900 dark:text-white">
              {title}
            </h2>
            {description && <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{description}</p>}
          </div>
          <button type="button" onClick={onClose} className="btn-ghost btn-sm -mr-2" aria-label="Close dialog">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4 flex-1">{children}</div>
        {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 dark:border-navy-800 px-5 py-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}

interface ConfirmDialogProps {
  open: boolean
  title: string
  message: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  tone?: 'default' | 'danger'
  onConfirm: () => void | Promise<void>
  onCancel: () => void
  busy?: boolean
}

export function ConfirmDialog({ open, title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', tone = 'default', onConfirm, onCancel, busy = false }: ConfirmDialogProps) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={
        <span className="inline-flex items-center gap-2">
          {tone === 'danger' && <AlertTriangle className="h-4 w-4 text-red-600" aria-hidden />}
          {title}
        </span>
      }
      size="sm"
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </button>
          <button type="button" className={tone === 'danger' ? 'btn-danger' : 'btn-primary'} onClick={() => void onConfirm()} disabled={busy}>
            {busy ? 'Working…' : confirmLabel}
          </button>
        </>
      }
    >
      <div className="text-sm text-slate-600 dark:text-slate-300">{message}</div>
    </Modal>
  )
}

interface DrawerProps {
  open: boolean
  onClose: () => void
  title: ReactNode
  subtitle?: ReactNode
  children: ReactNode
  footer?: ReactNode
  width?: 'md' | 'lg' | 'xl'
  tour?: string
}

export function Drawer({ open, onClose, title, subtitle, children, footer, width = 'lg', tour }: DrawerProps) {
  useEscape(open, onClose)
  if (!open) return null
  const w = width === 'md' ? 'sm:max-w-md' : width === 'xl' ? 'sm:max-w-3xl' : 'sm:max-w-xl'
  return createPortal(
    <div className="fixed inset-0 z-[90]" role="presentation">
      <div className="absolute inset-0 bg-navy-950/50 animate-fade-in" onClick={onClose} aria-hidden />
      <aside role="dialog" aria-modal="true" data-tour={tour} className={cn('absolute right-0 top-0 h-full w-full bg-white dark:bg-navy-900 shadow-panel flex flex-col animate-fade-in border-l border-slate-200 dark:border-navy-800', w)}>
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 dark:border-navy-800 px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white truncate">{title}</h2>
            {subtitle && <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{subtitle}</div>}
          </div>
          <button type="button" onClick={onClose} className="btn-ghost btn-sm -mr-2" aria-label="Close panel">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 dark:border-navy-800 px-5 py-3">{footer}</div>}
      </aside>
    </div>,
    document.body,
  )
}
