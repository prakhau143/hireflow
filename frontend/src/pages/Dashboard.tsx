import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  Import, Briefcase, Archive, Send, Target, FileText, Mail, Cpu, Users, Activity,
  TrendingUp, PieChart as PieIcon, BarChart3, MapPin, Layers, GitBranch, CalendarDays,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, LineChart, Line, ComposedChart,
  PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts'
import ChartCard from '@/components/dashboard/ChartCard'
import KpiCard from '@/components/dashboard/KpiCard'
import AIInsights from '@/components/dashboard/AIInsights'
import { CHART_COLORS, axisTick, gridStroke, ChartTooltip } from '@/components/dashboard/chartTheme'
import { cn } from '@/lib/utils'
import api from '@/lib/api'

const RANGES = [
  { label: '30D', days: 30 },
  { label: '90D', days: 90 },
  { label: '6M', days: 180 },
  { label: '1Y', days: 365 },
]

interface DashboardStats {
  total_jobs: number
  active_jobs: number
  archived_jobs: number
  applications_sent: number
  shortlisted: number
  avg_match: number
  resume_analyses: number
  ats_average: number
  smtp_success_rate: number | null
  emails_sent: number
  ai_usage: number
  jobs_this_week: number
  total_users: number | null
  active_users: number | null
}

interface DashboardCharts {
  match_distribution: { name: string; value: number }[]
  experience_distribution: { name: string; value: number }[]
  top_skills: { skill: string; count: number }[]
  job_locations: { location: string; count: number }[]
  application_funnel: { stage: string; count: number }[]
  weekly_activity: { day: string; date: string; jobs: number; actions: number }[]
  resume_scores: { range: string; count: number }[]
  monthly_growth: { month: string; jobs: number; cumulative: number }[]
  technology_trends: { skills: string[]; data: Record<string, string | number>[] }
  smtp_performance: { success: number; failed: number; rate: number } | null
}

function Funnel({ data }: { data: { stage: string; count: number }[] }) {
  const max = Math.max(...data.map(d => d.count), 1)
  return (
    <div className="space-y-3 pt-2">
      {data.map((step, i) => {
        const pct = Math.round((step.count / max) * 100)
        const conversion = i > 0 && data[i - 1].count > 0
          ? Math.round((step.count / data[i - 1].count) * 100)
          : null
        return (
          <div key={step.stage}>
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="text-muted-foreground">{step.stage}</span>
              <span className="text-foreground font-semibold tabular-nums">
                {step.count}
                {conversion != null && <span className="text-muted-foreground/70 font-normal ml-1.5">({conversion}%)</span>}
              </span>
            </div>
            <div className="h-2.5 bg-foreground/5 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${Math.max(pct, step.count > 0 ? 4 : 0)}%` }}
                transition={{ delay: 0.2 + i * 0.1, duration: 0.6, ease: 'easeOut' }}
                className="h-full rounded-full"
                style={{ background: `linear-gradient(90deg, ${CHART_COLORS[i % CHART_COLORS.length]}, ${CHART_COLORS[i % CHART_COLORS.length]}88)` }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default function Dashboard() {
  const [days, setDays] = useState(180)

  const { data: stats, isLoading: statsLoading } = useQuery<DashboardStats>({
    queryKey: ['dashboard-stats'],
    queryFn: async () => (await api.get('/api/dashboard/stats')).data,
  })

  const { data: charts, isLoading: chartsLoading, isPlaceholderData } = useQuery<DashboardCharts>({
    queryKey: ['dashboard-charts', days],
    queryFn: async () => (await api.get(`/api/dashboard/charts?days=${days}`)).data,
    placeholderData: keepPreviousData, // optimistic: keep old charts visible while range changes
  })

  const loadingCharts = chartsLoading && !charts
  const trendSkills = charts?.technology_trends?.skills ?? []
  const trendHasData = trendSkills.length > 0 &&
    (charts?.technology_trends?.data ?? []).some(row => trendSkills.some(s => Number(row[s]) > 0))

  return (
    <div className={cn('w-full space-y-5 transition-opacity', isPlaceholderData && 'opacity-70')}>
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-wrap items-center justify-between gap-3"
      >
        <div>
          <h1 className="text-2xl font-bold text-foreground">Analytics Overview</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Live metrics computed from your job hunting data</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Date range filter */}
          <div className="flex items-center gap-1 glass rounded-xl border border-border p-1">
            <CalendarDays className="w-3.5 h-3.5 text-muted-foreground ml-1.5" />
            {RANGES.map(r => (
              <button
                key={r.days}
                onClick={() => setDays(r.days)}
                className={cn(
                  'px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all',
                  days === r.days
                    ? 'bg-accent/25 text-accent border border-accent/30'
                    : 'text-muted-foreground hover:text-foreground border border-transparent'
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
          <Link to="/import">
            <motion.span
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-accent/20 border border-accent/30 text-accent text-sm hover:bg-accent/30 transition-colors cursor-pointer"
            >
              <Import className="w-4 h-4" /> Import Jobs
            </motion.span>
          </Link>
        </div>
      </motion.div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
        <KpiCard icon={Briefcase} label="Total Imported Jobs" value={stats?.total_jobs} loading={statsLoading}
          delta={stats?.jobs_this_week ? { value: stats.jobs_this_week, label: 'this week' } : null} color="indigo" delay={0} />
        <KpiCard icon={Target} label="Active Jobs" value={stats?.active_jobs} loading={statsLoading} color="emerald" delay={0.04} />
        <KpiCard icon={Send} label="Applications Sent" value={stats?.applications_sent} loading={statsLoading} color="cyan" delay={0.08} />
        <KpiCard icon={Archive} label="Archived Jobs" value={stats?.archived_jobs} loading={statsLoading} color="purple" delay={0.12} />
        <KpiCard icon={FileText} label="Avg ATS Score" value={stats?.ats_average || null} suffix="%" decimals={1} loading={statsLoading} color="amber" delay={0.16} />
        <KpiCard icon={Cpu} label="AI Analyses Run" value={stats?.ai_usage} loading={statsLoading} color="rose" delay={0.2} />
      </div>

      {/* Admin platform KPIs */}
      {stats?.total_users != null && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KpiCard icon={Users} label="Total Users" value={stats.total_users} loading={statsLoading} color="indigo" delay={0.22} />
          <KpiCard icon={Activity} label="Active Users (7d)" value={stats.active_users} loading={statsLoading} color="emerald" delay={0.26} />
          <KpiCard icon={Mail} label="Emails Delivered" value={stats.emails_sent} loading={statsLoading} color="cyan" delay={0.3} />
          <KpiCard icon={TrendingUp} label="SMTP Success Rate" value={stats.smtp_success_rate} suffix="%" decimals={1} loading={statsLoading} color="amber" delay={0.34} />
        </div>
      )}

      {/* Row: Monthly Growth + Match Distribution */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <ChartCard
          title="Monthly Growth" subtitle="Jobs imported per month with cumulative total"
          icon={TrendingUp} loading={loadingCharts} empty={!charts?.monthly_growth?.length}
          className="xl:col-span-2" delay={0.1} height={260}
        >
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={charts?.monthly_growth ?? []}>
              <defs>
                <linearGradient id="gradCumulative" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#818cf8" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#818cf8" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradMonthly" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#22d3ee" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
              <XAxis dataKey="month" tick={axisTick} axisLine={false} tickLine={false} />
              <YAxis tick={axisTick} axisLine={false} tickLine={false} allowDecimals={false} width={32} />
              <Tooltip content={<ChartTooltip />} />
              <Area type="monotone" dataKey="cumulative" name="Total jobs" stroke="#818cf8" strokeWidth={2} fill="url(#gradCumulative)" />
              <Area type="monotone" dataKey="jobs" name="Added" stroke="#22d3ee" strokeWidth={2} fill="url(#gradMonthly)" />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Match Distribution" subtitle="Score breakdown of imported jobs"
          icon={PieIcon} loading={loadingCharts} empty={!charts?.match_distribution?.length}
          delay={0.14} height={260}
        >
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie
                data={charts?.match_distribution ?? []} dataKey="value" nameKey="name"
                cx="50%" cy="45%" innerRadius={55} outerRadius={82} paddingAngle={4} strokeWidth={0}
              >
                {(charts?.match_distribution ?? []).map((_, i) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} fillOpacity={0.9} />
                ))}
              </Pie>
              <Legend formatter={(v) => <span style={{ color: 'var(--muted-foreground)', fontSize: 11 }}>{v}</span>} />
              <Tooltip content={<ChartTooltip />} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Row: Top Skills + Funnel + Experience */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        <ChartCard
          title="Top Skills in Demand" subtitle="Most requested across your job pool"
          icon={Layers} loading={loadingCharts} empty={!charts?.top_skills?.length}
          delay={0.18} height={250}
        >
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={(charts?.top_skills ?? []).slice(0, 8)} layout="vertical" barSize={12}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} horizontal={false} />
              <XAxis type="number" tick={axisTick} axisLine={false} tickLine={false} allowDecimals={false} />
              <YAxis type="category" dataKey="skill" tick={{ ...axisTick, fontSize: 10 }} axisLine={false} tickLine={false} width={80} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: 'color-mix(in srgb, var(--foreground) 6%, transparent)' }} />
              <Bar dataKey="count" name="Jobs" radius={[0, 6, 6, 0]}>
                {(charts?.top_skills ?? []).slice(0, 8).map((_, i) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} fillOpacity={0.85} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Application Funnel" subtitle="Imported → Qualified → Shortlisted → Applied"
          icon={GitBranch} loading={loadingCharts} empty={!charts?.application_funnel?.length}
          delay={0.22} height={250}
        >
          <Funnel data={charts?.application_funnel ?? []} />
        </ChartCard>

        <ChartCard
          title="Experience Distribution" subtitle="Jobs by required experience level"
          icon={BarChart3} loading={loadingCharts} empty={!charts?.experience_distribution?.length}
          delay={0.26} height={250}
        >
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={charts?.experience_distribution ?? []} barSize={30}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
              <XAxis dataKey="name" tick={axisTick} axisLine={false} tickLine={false} />
              <YAxis tick={axisTick} axisLine={false} tickLine={false} allowDecimals={false} width={28} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: 'color-mix(in srgb, var(--foreground) 6%, transparent)' }} />
              <Bar dataKey="value" name="Jobs" radius={[6, 6, 0, 0]}>
                {(charts?.experience_distribution ?? []).map((_, i) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} fillOpacity={0.85} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Row: Weekly Activity + Resume Scores + Technology Trends */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        <ChartCard
          title="Weekly Activity" subtitle="Jobs added & actions over the last 7 days"
          icon={Activity} loading={loadingCharts} empty={!charts?.weekly_activity?.length}
          delay={0.3} height={230}
        >
          <ResponsiveContainer width="100%" height={230}>
            <ComposedChart data={charts?.weekly_activity ?? []} barSize={18}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
              <XAxis dataKey="day" tick={axisTick} axisLine={false} tickLine={false} />
              <YAxis tick={axisTick} axisLine={false} tickLine={false} allowDecimals={false} width={28} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: 'color-mix(in srgb, var(--foreground) 6%, transparent)' }} />
              <Bar dataKey="jobs" name="Jobs added" fill="#818cf8" fillOpacity={0.8} radius={[5, 5, 0, 0]} />
              <Line type="monotone" dataKey="actions" name="Actions" stroke="#34d399" strokeWidth={2} dot={{ r: 2.5, fill: '#34d399' }} />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Resume Score Distribution" subtitle="ATS scores across your analyzed resumes"
          icon={FileText} loading={loadingCharts} empty={!charts?.resume_scores?.length}
          emptyLabel="No resumes analyzed yet" delay={0.34} height={230}
        >
          <ResponsiveContainer width="100%" height={230}>
            <BarChart data={charts?.resume_scores ?? []} barSize={34}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
              <XAxis dataKey="range" tick={axisTick} axisLine={false} tickLine={false} />
              <YAxis tick={axisTick} axisLine={false} tickLine={false} allowDecimals={false} width={28} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: 'color-mix(in srgb, var(--foreground) 6%, transparent)' }} />
              <Bar dataKey="count" name="Resumes" fill="#c084fc" fillOpacity={0.85} radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Technology Trends" subtitle="Top-5 skill demand month over month"
          icon={TrendingUp} loading={loadingCharts} empty={!trendHasData}
          delay={0.38} height={230}
        >
          <ResponsiveContainer width="100%" height={230}>
            <LineChart data={charts?.technology_trends?.data ?? []}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
              <XAxis dataKey="month" tick={axisTick} axisLine={false} tickLine={false} />
              <YAxis tick={axisTick} axisLine={false} tickLine={false} allowDecimals={false} width={28} />
              <Tooltip content={<ChartTooltip />} />
              <Legend formatter={(v) => <span style={{ color: 'var(--muted-foreground)', fontSize: 10 }}>{v}</span>} />
              {trendSkills.map((skill, i) => (
                <Line key={skill} type="monotone" dataKey={skill} stroke={CHART_COLORS[i % CHART_COLORS.length]}
                  strokeWidth={2} dot={false} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Row: AI Insights (replaces Recent Activity) + Job Locations */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <AIInsights className="xl:col-span-2" delay={0.42} />

        <ChartCard
          title="Job Locations" subtitle="Where your opportunities are"
          icon={MapPin} loading={loadingCharts} empty={!charts?.job_locations?.length}
          delay={0.46} height={280}
        >
          <div className="space-y-3 pt-1">
            {(charts?.job_locations ?? []).map((loc, i) => {
              const max = charts?.job_locations?.[0]?.count || 1
              return (
                <div key={loc.location} className="flex items-center gap-3">
                  <span className="text-muted-foreground text-xs w-24 shrink-0 truncate">{loc.location}</span>
                  <div className="flex-1 h-2 bg-foreground/5 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${(loc.count / max) * 100}%` }}
                      transition={{ delay: 0.5 + i * 0.05, duration: 0.5, ease: 'easeOut' }}
                      className="h-full rounded-full"
                      style={{ background: CHART_COLORS[i % CHART_COLORS.length], opacity: 0.85 }}
                    />
                  </div>
                  <span className="text-muted-foreground text-xs w-6 text-right tabular-nums">{loc.count}</span>
                </div>
              )
            })}
          </div>
        </ChartCard>
      </div>
    </div>
  )
}
