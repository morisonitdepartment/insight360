import { forwardRef, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { cn } from '@/utils/cn'

export function Field({ label, hint, error, required, children, className, htmlFor }: { label: ReactNode; hint?: ReactNode; error?: string; required?: boolean; children: ReactNode; className?: string; htmlFor?: string }) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="label">
        {label}
        {required && (
          <span className="text-red-600 ml-0.5" aria-hidden>
            *
          </span>
        )}
      </label>
      {children}
      {error ? (
        <p className="mt-1 text-xs text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{hint}</p>
      ) : null}
    </div>
  )
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(function Input({ className, invalid, ...props }, ref) {
  return <input ref={ref} className={cn('input', invalid && 'border-red-400 focus:border-red-500 focus:ring-red-500/30', className)} aria-invalid={invalid || undefined} {...props} />
})

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }>(function Textarea({ className, invalid, ...props }, ref) {
  return <textarea ref={ref} className={cn('input min-h-[84px]', invalid && 'border-red-400', className)} aria-invalid={invalid || undefined} {...props} />
})

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }>(function Select({ className, invalid, children, ...props }, ref) {
  return (
    <select ref={ref} className={cn('select', invalid && 'border-red-400', className)} aria-invalid={invalid || undefined} {...props}>
      {children}
    </select>
  )
})

export function Checkbox({ label, className, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode }) {
  return (
    <label className={cn('inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 cursor-pointer', className)}>
      <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500 dark:border-navy-600 dark:bg-navy-800" {...props} />
      {label}
    </label>
  )
}

export function Toggle({ checked, onChange, label, disabled, description }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode; description?: ReactNode; disabled?: boolean }) {
  return (
    <label className={cn('flex items-start gap-3 cursor-pointer', disabled && 'opacity-50 cursor-not-allowed')}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn('relative mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors', checked ? 'bg-teal-600' : 'bg-slate-300 dark:bg-navy-700')}
      >
        <span className={cn('inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform', checked ? 'translate-x-4.5 ml-[18px]' : 'ml-0.5')} />
        <span className="sr-only">{checked ? 'On' : 'Off'}</span>
      </button>
      {(label || description) && (
        <span className="text-sm">
          {label && <span className="block font-medium text-slate-800 dark:text-slate-200">{label}</span>}
          {description && <span className="block text-xs text-slate-500 dark:text-slate-400">{description}</span>}
        </span>
      )}
    </label>
  )
}

export function SegmentedControl<T extends string>({ options, value, onChange, size = 'sm', ariaLabel }: { options: { value: T; label: ReactNode }[]; value: T; onChange: (v: T) => void; size?: 'sm' | 'md'; ariaLabel?: string }) {
  return (
    <div role="group" aria-label={ariaLabel} className="inline-flex rounded-lg border border-slate-300 dark:border-navy-700 bg-white dark:bg-navy-800 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'rounded-md font-medium transition-colors whitespace-nowrap',
            size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-sm',
            value === o.value ? 'bg-navy-800 text-white dark:bg-teal-600' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-navy-700',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
