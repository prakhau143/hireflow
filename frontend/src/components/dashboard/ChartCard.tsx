import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import { BarChart3 } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ChartCardProps {
  title: string
  subtitle?: string
  icon?: LucideIcon
  loading?: boolean
  empty?: boolean
  emptyLabel?: string
  className?: string
  delay?: number
  height?: number
  actions?: ReactNode
  children: ReactNode
}

/**
 * Reusable analytics card: consistent header, shimmer loading state,
 * graceful "No Data Available" empty state, entrance animation.
 */
export default function ChartCard({
  title, subtitle, icon: Icon, loading, empty, emptyLabel,
  className, delay = 0, height = 240, actions, children,
}: ChartCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.35, ease: 'easeOut' }}
      className={cn('glass rounded-2xl border border-border p-5 flex flex-col hover:border-accent/30 transition-colors', className)}
    >
      <div className="flex items-start justify-between gap-2 mb-4">
        <div className="flex items-center gap-2.5 min-w-0">
          {Icon && (
            <div className="w-8 h-8 rounded-lg bg-accent/15 border border-accent/20 flex items-center justify-center shrink-0">
              <Icon className="w-4 h-4 text-accent" />
            </div>
          )}
          <div className="min-w-0">
            <h3 className="text-foreground font-semibold text-sm truncate">{title}</h3>
            {subtitle && <p className="text-muted-foreground text-xs mt-0.5 truncate">{subtitle}</p>}
          </div>
        </div>
        {actions}
      </div>

      <div className="flex-1 relative" style={{ minHeight: height }}>
        {loading ? (
          <div className="absolute inset-0 space-y-3">
            <div className="h-full rounded-xl bg-foreground/[0.03] shimmer" />
          </div>
        ) : empty ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2.5">
            <div className="w-11 h-11 rounded-xl bg-foreground/5 border border-border flex items-center justify-center">
              <BarChart3 className="w-5 h-5 text-muted-foreground/50" />
            </div>
            <p className="text-muted-foreground text-xs font-medium">{emptyLabel ?? 'No Data Available'}</p>
          </div>
        ) : (
          children
        )}
      </div>
    </motion.div>
  )
}
