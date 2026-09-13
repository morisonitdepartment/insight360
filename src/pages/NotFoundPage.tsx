import { Link } from 'react-router-dom'
import { Compass } from 'lucide-react'
import { cn } from '@/utils/cn'

export function NotFoundPage({ standalone = false }: { standalone?: boolean }) {
  return (
    <div className={cn('flex flex-col items-center justify-center text-center', standalone ? 'min-h-screen bg-slate-50 dark:bg-navy-950 p-6' : 'py-20')}>
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-navy-900 text-teal-300 dark:bg-teal-600 dark:text-white">
        <Compass className="h-7 w-7" aria-hidden />
      </span>
      <p className="mt-5 text-xs font-semibold uppercase tracking-widest text-slate-400">Error 404</p>
      <h1 className="mt-1 text-2xl font-semibold">Page not found</h1>
      <p className="mt-2 max-w-md text-sm text-slate-500 dark:text-slate-400">The page you requested does not exist or has been moved. Check the address or return to the overview.</p>
      <Link to="/" className="btn-primary mt-6">
        Back to overview
      </Link>
    </div>
  )
}

export default NotFoundPage
