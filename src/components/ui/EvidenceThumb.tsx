import { Camera, FileText, Image as ImageIcon, MonitorSmartphone, Receipt, Video } from 'lucide-react'
import type { Evidence, EvidenceType } from '@/types'
import { cn } from '@/utils/cn'
import { fmtDateTime } from '@/utils/format'
import { Modal } from './Modal'
import { Badge } from './Badge'

/**
 * Neutral, internally generated SVG placeholders for demo evidence. No external images are
 * embedded — each thumbnail is deterministic from the evidence record's visualSeed.
 */

const PALETTES = [
  ['#1c2d42', '#2f4d70', '#43bcb7'],
  ['#263d59', '#40648c', '#7ad6d0'],
  ['#14202f', '#1f807f', '#95acc7'],
  ['#2f4d70', '#289f9c', '#c3d0e0'],
  ['#1d6666', '#1c2d42', '#b0e8e3'],
]

function seeded(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

export function evidenceIcon(type: EvidenceType) {
  switch (type) {
    case 'Photo':
      return Camera
    case 'Video':
      return Video
    case 'Receipt':
      return Receipt
    case 'Screenshot':
      return MonitorSmartphone
    case 'Document':
      return FileText
    default:
      return ImageIcon
  }
}

export function EvidenceVisual({ type, seed, label, className, large = false }: { type: EvidenceType; seed: number; label?: string; className?: string; large?: boolean }) {
  const rnd = seeded(seed)
  const pal = PALETTES[seed % PALETTES.length]
  const shapes = Array.from({ length: large ? 9 : 6 }, () => ({ x: rnd() * 100, y: rnd() * 100, w: 14 + rnd() * 40, h: 10 + rnd() * 30, o: 0.25 + rnd() * 0.5 }))
  const Icon = evidenceIcon(type)
  const w = 160
  const h = large ? 90 : 110
  return (
    <div className={cn('relative overflow-hidden bg-navy-900', className)}>
      <svg viewBox={`0 0 ${w} ${h}`} className="h-full w-full" role="img" aria-label={label ? `${type} evidence: ${label}` : `${type} evidence placeholder`} preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id={`g${seed}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={pal[0]} />
            <stop offset="100%" stopColor={pal[1]} />
          </linearGradient>
        </defs>
        <rect width={w} height={h} fill={`url(#g${seed})`} />
        {type === 'Receipt' || type === 'Document' ? (
          <g>
            <rect x={w * 0.3} y={8} width={w * 0.4} height={h - 16} rx="3" fill="#f8fafc" opacity="0.95" />
            {Array.from({ length: 7 }, (_, i) => (
              <rect key={i} x={w * 0.34} y={16 + i * 10} width={w * (0.12 + ((seed >> i) % 4) * 0.05)} height="3" rx="1" fill="#94a3b8" />
            ))}
            <rect x={w * 0.34} y={h - 22} width={w * 0.32} height="4" rx="1" fill={pal[2]} />
          </g>
        ) : type === 'Screenshot' ? (
          <g>
            <rect x={12} y={10} width={w - 24} height={h - 20} rx="4" fill="#f1f5f9" opacity="0.92" />
            <rect x={12} y={10} width={w - 24} height={10} rx="4" fill="#cbd5e1" />
            <rect x={20} y={28} width={w * 0.5} height="6" rx="2" fill={pal[1]} />
            <rect x={20} y={40} width={w * 0.7} height="4" rx="1" fill="#94a3b8" />
            <rect x={20} y={48} width={w * 0.6} height="4" rx="1" fill="#94a3b8" />
            <rect x={20} y={60} width={40} height="12" rx="3" fill={pal[2]} />
          </g>
        ) : (
          <g>
            {shapes.map((s, i) => (
              <rect key={i} x={s.x} y={s.y} width={s.w} height={s.h} rx="3" fill={i % 2 ? pal[2] : '#ffffff'} opacity={s.o * 0.6} />
            ))}
            <circle cx={w * 0.7} cy={h * 0.35} r={large ? 10 : 8} fill="#ffffff" opacity="0.35" />
          </g>
        )}
        {type === 'Video' && (
          <g>
            <rect x="0" y={h - 12} width={w} height="12" fill="#0b1420" opacity="0.7" />
            <rect x="10" y={h - 7} width={w * 0.45} height="2" rx="1" fill={pal[2]} />
            <rect x="10" y={h - 7} width={w - 20} height="2" rx="1" fill="#ffffff" opacity="0.25" />
          </g>
        )}
      </svg>
      <span className="absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded bg-navy-950/70 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur">
        <Icon className="h-3 w-3" aria-hidden />
        {type}
      </span>
      <span className="absolute bottom-1.5 right-1.5 rounded bg-navy-950/60 px-1 py-0.5 text-[9px] text-slate-200">SAMPLE</span>
    </div>
  )
}

export function EvidenceCard({ evidence, onClick, selected, meta }: { evidence: Evidence; onClick?: () => void; selected?: boolean; meta?: string }) {
  return (
    <button type="button" onClick={onClick} className={cn('card overflow-hidden text-left transition-shadow hover:shadow-card-hover focus-visible:ring-2', selected && 'ring-2 ring-teal-500')}>
      <EvidenceVisual type={evidence.type} seed={evidence.visualSeed} label={evidence.title} className="aspect-[4/3]" />
      <div className="p-2.5">
        <p className="truncate text-xs font-medium text-slate-800 dark:text-slate-100">{evidence.title}</p>
        <p className="mt-0.5 truncate text-[11px] text-slate-500 dark:text-slate-400">{meta ?? fmtDateTime(evidence.capturedAt)}</p>
      </div>
    </button>
  )
}

export function EvidencePreviewModal({ evidence, onClose, context }: { evidence: Evidence | null; onClose: () => void; context?: { outlet?: string; visit?: string; question?: string } }) {
  return (
    <Modal open={!!evidence} onClose={onClose} title={evidence?.title ?? ''} description={evidence ? `${evidence.type} · ${evidence.fileName} · ${evidence.sizeKb.toLocaleString()} KB` : undefined} size="lg">
      {evidence && (
        <div className="space-y-4">
          <EvidenceVisual type={evidence.type} seed={evidence.visualSeed} label={evidence.title} className="aspect-video rounded-lg" large />
          <div className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <p className="label">Description</p>
              <p className="text-slate-700 dark:text-slate-200">{evidence.description}</p>
            </div>
            <div className="space-y-1.5 text-xs text-slate-600 dark:text-slate-300">
              {context?.outlet && (
                <p>
                  <span className="text-slate-500">Outlet:</span> {context.outlet}
                </p>
              )}
              {context?.visit && (
                <p>
                  <span className="text-slate-500">Visit:</span> {context.visit}
                </p>
              )}
              {context?.question && (
                <p>
                  <span className="text-slate-500">Question:</span> {context.question}
                </p>
              )}
              <p>
                <span className="text-slate-500">Captured:</span> {fmtDateTime(evidence.capturedAt)}
              </p>
              <p>
                <span className="text-slate-500">Uploaded:</span> {fmtDateTime(evidence.uploadedAt)} by {evidence.uploadedBy}
              </p>
              <Badge tone="slate">ID {evidence.id}</Badge>
            </div>
          </div>
          <p className="text-[11px] text-slate-400">Demo mode renders neutral placeholder visuals. In live mode the original file is served from Supabase Storage with signed URLs.</p>
        </div>
      )}
    </Modal>
  )
}
