import { motion } from 'framer-motion'
import { HeartPulse, Eye, TrendingUp, TrendingDown, Minus, Wallet } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { cn } from '@/lib/utils'
import api from '@/lib/api'

interface CareerIntelligence {
  career_health: { score: number; breakdown: { label: string; value: number; weight: number }[] }
  recruiter_visibility: { score: number; reasons: string[] }
  market_demand: { skill: string; trend: 'up' | 'down' | 'stable'; recent_demand_pct: number; mentions: number }[]
  salary_prediction: { current: number; expected: number | null; market: number; sample_size: number; unit: string } | null
}

function ScoreRing({ score, size = 64, color }: { score: number; size?: number; color: string }) {
  const r = (size - 8) / 2
  const circ = 2 * Math.PI * r
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border)" strokeWidth="5" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="5" strokeLinecap="round"
          strokeDasharray={circ} strokeDashoffset={circ * (1 - score / 100)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`} style={{ transition: 'stroke-dashoffset 0.8s ease' }} />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-sm font-bold" style={{ color }}>{score}</span>
      </div>
    </div>
  )
}

const TREND_ICON = { up: TrendingUp, down: TrendingDown, stable: Minus }
const TREND_COLOR = { up: 'text-emerald-400', down: 'text-red-400', stable: 'text-muted-foreground' }

/** Career Health, Recruiter Visibility, Market Demand, Salary Prediction — all
 * computed from real profile/resume/job-pool data, no invented numbers. */
export default function CareerIntelligenceCard() {
  const { data, isLoading } = useQuery<CareerIntelligence>({
    queryKey: ['career-intelligence'],
    queryFn: async () => (await api.get('/api/users/me/career-intelligence')).data,
  })

  if (isLoading || !data) {
    return <div className="glass rounded-2xl border border-border p-5 h-48 shimmer" />
  }

  const healthColor = data.career_health.score >= 75 ? '#34d399' : data.career_health.score >= 50 ? '#fbbf24' : '#f87171'
  const visColor = data.recruiter_visibility.score >= 75 ? '#34d399' : data.recruiter_visibility.score >= 50 ? '#fbbf24' : '#f87171'

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
      className="glass rounded-2xl border border-border p-5 space-y-5">
      <h3 className="text-foreground font-semibold text-sm flex items-center gap-2">
        <HeartPulse className="w-4 h-4 text-rose-400" /> Career Intelligence
      </h3>

      {/* Career Health + Recruiter Visibility */}
      <div className="grid grid-cols-2 gap-4">
        <div className="flex items-center gap-3">
          <ScoreRing score={data.career_health.score} color={healthColor} />
          <div className="min-w-0">
            <p className="text-xs text-foreground/80 font-medium">Career Health</p>
            <p className="text-[10px] text-muted-foreground">Profile + ATS + activity</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <ScoreRing score={data.recruiter_visibility.score} color={visColor} />
          <div className="min-w-0">
            <p className="text-xs text-foreground/80 font-medium flex items-center gap-1"><Eye className="w-3 h-3" /> Recruiter Visibility</p>
            {data.recruiter_visibility.reasons[0] && (
              <p className="text-[10px] text-muted-foreground truncate">{data.recruiter_visibility.reasons[0]}</p>
            )}
          </div>
        </div>
      </div>

      {/* Career Health breakdown bars */}
      <div className="space-y-1.5">
        {data.career_health.breakdown.map(b => (
          <div key={b.label} className="flex items-center gap-2 text-[10px]">
            <span className="w-28 text-muted-foreground truncate">{b.label}</span>
            <div className="flex-1 h-1.5 bg-foreground/5 rounded-full overflow-hidden">
              <div className="h-full rounded-full bg-gradient-to-r from-rose-500 to-purple-500" style={{ width: `${b.value}%` }} />
            </div>
            <span className="w-7 text-right text-muted-foreground">{b.value}</span>
          </div>
        ))}
      </div>

      {/* Market Demand */}
      {data.market_demand.length > 0 && (
        <div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Market Demand (from your job pool)</p>
          <div className="flex flex-wrap gap-1.5">
            {data.market_demand.slice(0, 8).map(m => {
              const Icon = TREND_ICON[m.trend]
              return (
                <span key={m.skill} title={`${m.mentions} mentions · ${m.recent_demand_pct}% of recent imports`}
                  className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-full bg-foreground/[0.03] border border-border text-muted-foreground">
                  {m.skill} <Icon className={cn('w-2.5 h-2.5', TREND_COLOR[m.trend])} />
                </span>
              )
            })}
          </div>
        </div>
      )}

      {/* Salary Prediction */}
      {data.salary_prediction && (
        <div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1">
            <Wallet className="w-3 h-3" /> Salary Prediction ({data.salary_prediction.unit}, from {data.salary_prediction.sample_size} jobs)
          </p>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="p-2 rounded-lg bg-foreground/[0.03] border border-border">
              <p className="text-foreground/85 font-bold text-sm">{data.salary_prediction.current}</p>
              <p className="text-[9px] text-muted-foreground">Current level</p>
            </div>
            <div className="p-2 rounded-lg bg-indigo-500/10 border border-indigo-500/20">
              <p className="text-indigo-300 font-bold text-sm">{data.salary_prediction.expected ?? '—'}</p>
              <p className="text-[9px] text-muted-foreground">Your target</p>
            </div>
            <div className="p-2 rounded-lg bg-foreground/[0.03] border border-border">
              <p className="text-foreground/85 font-bold text-sm">{data.salary_prediction.market}</p>
              <p className="text-[9px] text-muted-foreground">Market median</p>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  )
}
