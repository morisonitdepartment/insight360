import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, PlayCircle, X } from 'lucide-react'
import { useGuidedDemo } from '@/contexts/GuidedDemoContext'
import { cn } from '@/utils/cn'

/**
 * Tasteful step-by-step walkthrough panel. Navigates to each step's route and highlights an
 * optional [data-tour] target with a ring.
 */
export function GuidedDemoOverlay() {
  const { active, stepIndex, steps, next, prev, stop, goTo } = useGuidedDemo()
  const navigate = useNavigate()
  const step = steps[stepIndex]

  useEffect(() => {
    if (!active || !step) return
    navigate(step.path)
  }, [active, stepIndex, step, navigate])

  useEffect(() => {
    if (!active || !step?.target) return
    let el: HTMLElement | null = null
    const t = setTimeout(() => {
      el = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`)
      if (el) {
        el.classList.add('ring-4', 'ring-teal-400/70', 'ring-offset-2', 'rounded-xl', 'transition-shadow')
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    }, 450)
    return () => {
      clearTimeout(t)
      el?.classList.remove('ring-4', 'ring-teal-400/70', 'ring-offset-2', 'transition-shadow')
    }
  }, [active, stepIndex, step])

  useEffect(() => {
    if (!active) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') next()
      if (e.key === 'ArrowLeft') prev()
      if (e.key === 'Escape') stop()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [active, next, prev, stop])

  if (!active || !step) return null
  const last = stepIndex === steps.length - 1

  return (
    <div role="dialog" aria-label="Guided demo" className="fixed bottom-4 right-4 z-[80] w-[380px] max-w-[calc(100vw-2rem)] card shadow-panel border-teal-200 dark:border-teal-800 animate-fade-in no-print">
      <div className="flex items-center justify-between gap-2 border-b border-slate-200 dark:border-navy-800 px-4 py-2.5">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-teal-700 dark:text-teal-300">
          <PlayCircle className="h-4 w-4" aria-hidden /> Guided demo
        </div>
        <button type="button" onClick={stop} className="btn-ghost btn-sm -mr-2" aria-label="Exit guided demo">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="px-4 py-3">
        <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
          Step {stepIndex + 1} of {steps.length}
        </p>
        <h3 className="mt-0.5 text-base font-semibold text-slate-900 dark:text-white">{step.title}</h3>
        <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{step.description}</p>
        <ol className="mt-3 flex gap-1" aria-label="Steps">
          {steps.map((s, i) => (
            <li key={s.title} className="flex-1">
              <button type="button" onClick={() => goTo(i)} aria-label={`Go to step ${i + 1}: ${s.title}`} aria-current={i === stepIndex ? 'step' : undefined} className={cn('h-1.5 w-full rounded-full transition-colors', i <= stepIndex ? 'bg-teal-500' : 'bg-slate-200 dark:bg-navy-700')} />
            </li>
          ))}
        </ol>
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-slate-200 dark:border-navy-800 px-4 py-2.5">
        <button type="button" className="btn-secondary btn-sm" onClick={prev} disabled={stepIndex === 0}>
          <ChevronLeft className="h-4 w-4" /> Back
        </button>
        <span className="text-[10px] text-slate-400">Use ← → keys</span>
        {last ? (
          <button type="button" className="btn-primary btn-sm" onClick={stop}>
            Finish
          </button>
        ) : (
          <button type="button" className="btn-primary btn-sm" onClick={next}>
            Next <ChevronRight className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  )
}
