import { useEffect, useState } from 'react'
import { motion, animate } from 'framer-motion'
import { TrendingUp, TrendingDown } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

const colorMap: Record<string, { icon: string; bg: string; glow: string }> = {
  indigo:  { icon: 'text-indigo-400',  bg: 'bg-indigo-500/15 border-indigo-500/20',  glow: 'from-indigo-500/10' },
  emerald: { icon: 'text-emerald-400', bg: 'bg-emerald-500/15 border-emerald-500/20', glow: 'from-emerald-500/10' },
  cyan:    { icon: 'text-cyan-400',    bg: 'bg-cyan-500/15 border-cyan-500/20',       glow: 'from-cyan-500/10' },
  purple:  { icon: 'text-purple-400',  bg: 'bg-purple-500/15 border-purple-500/20',   glow: 'from-purple-500/10' },
  amber:   { icon: 'text-amber-400',   bg: 'bg-amber-500/15 border-amber-500/20',     glow: 'from-amber-500/10' },
  rose:    { icon: 'text-rose-400',    bg: 'bg-rose-500/15 border-rose-500/20',       glow: 'from-rose-500/10' },
}

function useCountUp(target: number, decimals = 0) {
  const [value, setValue] = useState(0)
  useEffect(() => {
    const controls = animate(0, target, {
      duration: 0.9,
      ease: 'easeOut',
      onUpdate: (v) => setValue(parseFloat(v.toFixed(decimals))),
    })
    return () => controls.stop()
  }, [target, decimals])
  return value
}

interface KpiCardProps {
  icon: LucideIcon
  label: string
  value: number | null | undefined
  suffix?: string
  decimals?: number
  delta?: { value: number; label: string } | null
  color?: keyof typeof colorMap
  loading?: boolean
  delay?: number
}

export default function KpiCard({
  icon: Icon, label, value, suffix = '', decimals = 0,
  delta, color = 'indigo', loading, delay = 0,
}: KpiCardProps) {
  const c = colorMap[color] ?? colorMap.indigo
  const displayed = useCountUp(typeof value === 'number' ? value : 0, decimals)

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.3 }}
      className="glass rounded-2xl border border-white/10 p-4 relative overflow-hidden group hover:border-white/20 transition-colors"
    >
      <div className={cn('absolute -top-8 -right-8 w-24 h-24 rounded-full bg-gradient-to-br to-transparent opacity-0 group-hover:opacity-100 transition-opacity blur-2xl', c.glow)} />
      <div className="flex items-center justify-between mb-3">
        <div className={cn('w-9 h-9 rounded-xl border flex items-center justify-center', c.bg)}>
          <Icon className={cn('w-4 h-4', c.icon)} />
        </div>
        {delta && delta.value !== 0 && (
          <span className={cn(
            'flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full border font-medium',
            delta.value > 0
              ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
              : 'text-red-400 bg-red-500/10 border-red-500/20'
          )}>
            {delta.value > 0 ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
            {delta.value > 0 ? '+' : ''}{delta.value} {delta.label}
          </span>
        )}
      </div>
      {loading ? (
        <div className="h-7 w-16 rounded-lg bg-white/5 shimmer mb-1" />
      ) : (
        <p className="text-2xl font-bold text-white leading-none mb-1 tabular-nums">
          {value == null ? '—' : `${displayed.toLocaleString()}${suffix}`}
        </p>
      )}
      <p className="text-white/40 text-xs">{label}</p>
    </motion.div>
  )
}
