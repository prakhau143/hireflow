import { motion } from 'framer-motion'
import type { LucideIcon } from 'lucide-react'
import { TrendingUp, TrendingDown } from 'lucide-react'
import { cn } from '@/lib/utils'

interface StatsCardProps {
  icon: LucideIcon
  label: string
  value: number | string
  change?: number
  color: 'blue' | 'purple' | 'cyan' | 'emerald'
  delay?: number
}

const colorMap = {
  blue: {
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/20',
    icon: 'text-blue-400',
    glow: 'shadow-blue-500/10',
  },
  purple: {
    bg: 'bg-purple-500/10',
    border: 'border-purple-500/20',
    icon: 'text-purple-400',
    glow: 'shadow-purple-500/10',
  },
  cyan: {
    bg: 'bg-cyan-500/10',
    border: 'border-cyan-500/20',
    icon: 'text-cyan-400',
    glow: 'shadow-cyan-500/10',
  },
  emerald: {
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/20',
    icon: 'text-emerald-400',
    glow: 'shadow-emerald-500/10',
  },
}

export default function StatsCard({ icon: Icon, label, value, change, color, delay = 0 }: StatsCardProps) {
  const colors = colorMap[color]
  const isPositive = (change ?? 0) >= 0

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay }}
      whileHover={{ y: -2, transition: { duration: 0.15 } }}
      className={cn(
        'glass rounded-2xl p-5 border shadow-lg',
        colors.border,
        colors.glow
      )}
    >
      <div className="flex items-start justify-between mb-4">
        <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center', colors.bg)}>
          <Icon className={cn('w-5 h-5', colors.icon)} />
        </div>
        {change !== undefined && (
          <div className={cn(
            'flex items-center gap-1 text-xs px-2 py-1 rounded-full',
            isPositive ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
          )}>
            {isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {Math.abs(change)}%
          </div>
        )}
      </div>
      <div className="space-y-1">
        <motion.p
          className="text-3xl font-bold text-white"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: delay + 0.2 }}
        >
          {value}
        </motion.p>
        <p className="text-sm text-white/50">{label}</p>
      </div>
    </motion.div>
  )
}
