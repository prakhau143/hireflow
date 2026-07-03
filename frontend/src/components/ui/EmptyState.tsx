import { motion } from 'framer-motion'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description: string
  action?: React.ReactNode
  className?: string
}

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn('flex flex-col items-center justify-center py-20 text-center', className)}
    >
      <div className="w-16 h-16 rounded-2xl glass border border-white/10 flex items-center justify-center mb-5">
        <Icon className="w-7 h-7 text-white/20" />
      </div>
      <p className="text-white/60 font-medium text-base">{title}</p>
      <p className="text-white/30 text-sm mt-1.5 max-w-xs leading-relaxed">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </motion.div>
  )
}

export function LoadingCards({ count = 3 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="glass rounded-2xl border border-white/10 p-5 space-y-3 overflow-hidden">
          <div className="flex items-start justify-between">
            <div className="space-y-2 flex-1">
              <div className="h-4 rounded-lg bg-white/5 shimmer w-3/4" />
              <div className="h-3 rounded-lg bg-white/5 shimmer w-1/2" />
            </div>
            <div className="w-12 h-12 rounded-full bg-white/5 shimmer shrink-0" />
          </div>
          <div className="space-y-1.5">
            <div className="h-3 rounded bg-white/5 shimmer w-full" />
            <div className="h-3 rounded bg-white/5 shimmer w-4/5" />
          </div>
          <div className="flex gap-2">
            <div className="h-6 w-16 rounded-full bg-white/5 shimmer" />
            <div className="h-6 w-12 rounded-full bg-white/5 shimmer" />
          </div>
        </div>
      ))}
    </div>
  )
}

export function LoadingRows({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="glass rounded-xl border border-white/10 p-4 flex items-center gap-4 overflow-hidden">
          <div className="w-8 h-8 rounded-lg bg-white/5 shimmer shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-3.5 rounded bg-white/5 shimmer w-1/3" />
            <div className="h-3 rounded bg-white/5 shimmer w-2/3" />
          </div>
          <div className="h-3 w-16 rounded bg-white/5 shimmer" />
        </div>
      ))}
    </div>
  )
}
