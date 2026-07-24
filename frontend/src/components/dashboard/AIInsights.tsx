import { motion } from 'framer-motion'
import { Sparkles, TrendingUp, Target, AlertTriangle, Trophy, RefreshCw } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { cn } from '@/lib/utils'
import api from '@/lib/api'

interface Insight {
  type: 'trend' | 'action' | 'warning' | 'win'
  title: string
  detail: string
}

interface InsightsPayload {
  insights: Insight[]
  generated_by: 'ai' | 'rules'
  generated_at: string
}

const typeStyles = {
  trend:   { icon: TrendingUp,    chip: 'bg-cyan-500/15 border-cyan-500/25 text-cyan-400' },
  action:  { icon: Target,        chip: 'bg-indigo-500/15 border-indigo-500/25 text-indigo-400' },
  warning: { icon: AlertTriangle, chip: 'bg-amber-500/15 border-amber-500/25 text-amber-400' },
  win:     { icon: Trophy,        chip: 'bg-emerald-500/15 border-emerald-500/25 text-emerald-400' },
}

/** AI-generated hiring insights — replaces the old Recent Activity feed. */
export default function AIInsights({ className, delay = 0 }: { className?: string; delay?: number }) {
  const qc = useQueryClient()

  const { data, isLoading, isFetching, refetch } = useQuery<InsightsPayload>({
    queryKey: ['dashboard-insights'],
    queryFn: async () => {
      const { data } = await api.get('/api/dashboard/insights')
      return data
    },
    staleTime: 5 * 60 * 1000,
  })

  const forceRefresh = async () => {
    const { data: fresh } = await api.get('/api/dashboard/insights?refresh=true')
    qc.setQueryData(['dashboard-insights'], fresh)
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.35 }}
      className={cn('glass rounded-2xl border border-border p-5 relative overflow-hidden', className)}
    >
      <div className="absolute -top-16 -right-16 w-48 h-48 rounded-full bg-gradient-to-br from-purple-500/10 to-transparent blur-3xl pointer-events-none" />

      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-accent/15 border border-accent/25 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-accent" />
          </div>
          <div>
            <h3 className="text-foreground font-semibold text-sm flex items-center gap-2">
              AI Insights
              {data && (
                <span className={cn(
                  'text-[9px] px-1.5 py-0.5 rounded-full border font-medium uppercase tracking-wider',
                  data.generated_by === 'ai'
                    ? 'bg-accent/15 border-accent/25 text-accent'
                    : 'bg-foreground/5 border-border text-muted-foreground'
                )}>
                  {data.generated_by === 'ai' ? 'AI Generated' : 'Data Rules'}
                </span>
              )}
            </h3>
            <p className="text-muted-foreground text-xs mt-0.5">Hiring trends & personalized recommendations</p>
          </div>
        </div>
        <button
          onClick={() => (data ? forceRefresh() : refetch())}
          disabled={isFetching}
          className="p-2 rounded-lg glass border border-border text-muted-foreground hover:text-foreground hover:border-accent/30 transition-all disabled:opacity-40"
          title="Regenerate insights"
        >
          <RefreshCw className={cn('w-3.5 h-3.5', isFetching && 'animate-spin')} />
        </button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-14 rounded-xl bg-foreground/[0.03] shimmer" />
          ))}
        </div>
      ) : !data?.insights?.length ? (
        <p className="text-muted-foreground text-sm py-8 text-center">No Data Available</p>
      ) : (
        <div className="space-y-2.5">
          {data.insights.map((insight, i) => {
            const style = typeStyles[insight.type] ?? typeStyles.trend
            const Icon = style.icon
            return (
              <motion.div
                key={`${insight.title}-${i}`}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: delay + 0.1 + i * 0.06 }}
                className="flex items-start gap-3 p-3 rounded-xl bg-foreground/[0.02] border border-border hover:border-accent/20 hover:bg-foreground/[0.04] transition-all"
              >
                <div className={cn('w-7 h-7 rounded-lg border flex items-center justify-center shrink-0 mt-0.5', style.chip)}>
                  <Icon className="w-3.5 h-3.5" />
                </div>
                <div className="min-w-0">
                  <p className="text-foreground/85 text-sm font-medium leading-snug">{insight.title}</p>
                  <p className="text-muted-foreground text-xs mt-1 leading-relaxed">{insight.detail}</p>
                </div>
              </motion.div>
            )
          })}
        </div>
      )}
    </motion.div>
  )
}
