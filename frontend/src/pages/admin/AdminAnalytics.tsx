import { motion } from 'framer-motion'
import {
  Users, Activity, UserX, Briefcase, CheckCircle, XCircle, Send, Mail,
  TrendingUp, PieChart as PieIcon, BarChart3, Building2, MapPin, Layers, Flame, GitBranch,
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts'
import ChartCard from '@/components/dashboard/ChartCard'
import KpiCard from '@/components/dashboard/KpiCard'
import { CHART_COLORS, axisTick, gridStroke, ChartTooltip } from '@/components/dashboard/chartTheme'
import { cn } from '@/lib/utils'
import api from '@/lib/api'

interface AdminAnalytics {
  totals: Record<string, number>
  imports_daily: { date: string; day: string; jobs: number }[]
  imports_weekly: { week: string; jobs: number }[]
  imports_monthly: { month: string; jobs: number }[]
  review_funnel: { stage: string; count: number }[]
  application_types: { name: string; value: number }[]
  top_companies: { company: string; count: number }[]
  top_cities: { city: string; count: number }[]
  top_roles: { role: string; count: number }[]
  email_stats: { sent: number; failed: number; queued: number; success_rate: number | null }
  smtp_daily: { day: string; success: number; failed: number }[]
  activity_heatmap: { days: string[]; buckets: string[]; data: number[][]; max: number } | null
  user_growth: { month: string; signups: number; total: number }[]
  experience_distribution: { name: string; value: number }[]
}

function Heatmap({ hm }: { hm: NonNullable<AdminAnalytics['activity_heatmap']> }) {
  return (
    <div className="pt-1">
      <div className="grid gap-1" style={{ gridTemplateColumns: `44px repeat(${hm.buckets.length}, 1fr)` }}>
        <span />
        {hm.buckets.map(b => (
          <span key={b} className="text-[9px] text-white/30 text-center">{b}</span>
        ))}
        {hm.days.map((d, di) => (
          [
            <span key={d} className="text-[10px] text-white/40 leading-6">{d}</span>,
            ...hm.data[di].map((count, bi) => (
              <motion.div
                key={`${d}-${bi}`}
                initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                transition={{ delay: (di * hm.buckets.length + bi) * 0.008 }}
                title={`${d} ${hm.buckets[bi]}: ${count} action${count !== 1 ? 's' : ''}`}
                className="h-6 rounded-md border border-white/5"
                style={{
                  background: count === 0
                    ? 'rgba(255,255,255,0.02)'
                    : `rgba(129,140,248,${0.15 + 0.75 * (count / hm.max)})`,
                }}
              />
            )),
          ]
        ))}
      </div>
      <div className="flex items-center justify-end gap-1.5 mt-3 text-[9px] text-white/30">
        Less
        {[0.1, 0.35, 0.6, 0.9].map(a => (
          <span key={a} className="w-3 h-3 rounded" style={{ background: `rgba(129,140,248,${a})` }} />
        ))}
        More
      </div>
    </div>
  )
}

function FunnelBars({ data }: { data: { stage: string; count: number }[] }) {
  const max = Math.max(...data.map(d => d.count), 1)
  return (
    <div className="space-y-3 pt-2">
      {data.map((step, i) => (
        <div key={step.stage}>
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="text-white/55">{step.stage}</span>
            <span className="text-white/80 font-semibold tabular-nums">{step.count}</span>
          </div>
          <div className="h-2.5 bg-white/5 rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${Math.max((step.count / max) * 100, step.count > 0 ? 4 : 0)}%` }}
              transition={{ delay: 0.15 + i * 0.08, duration: 0.5, ease: 'easeOut' }}
              className="h-full rounded-full"
              style={{ background: CHART_COLORS[i % CHART_COLORS.length] }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

function HBar({ data, nameKey, icon: Icon, title, subtitle, loading, delay }: any) {
  return (
    <ChartCard title={title} subtitle={subtitle} icon={Icon} loading={loading}
      empty={!data?.length} delay={delay} height={230}>
      <ResponsiveContainer width="100%" height={230}>
        <BarChart data={(data ?? []).slice(0, 7)} layout="vertical" barSize={12}>
          <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} horizontal={false} />
          <XAxis type="number" tick={axisTick} axisLine={false} tickLine={false} allowDecimals={false} />
          <YAxis type="category" dataKey={nameKey} tick={{ ...axisTick, fontSize: 10 }} axisLine={false} tickLine={false} width={92} />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
          <Bar dataKey="count" name="Jobs" radius={[0, 6, 6, 0]}>
            {(data ?? []).slice(0, 7).map((_: any, i: number) => (
              <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} fillOpacity={0.85} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  )
}

export default function AdminAnalyticsPage() {
  const { data, isLoading, dataUpdatedAt } = useQuery<AdminAnalytics>({
    queryKey: ['admin-analytics-full'],
    queryFn: async () => (await api.get('/api/dashboard/admin')).data,
    refetchInterval: 30_000,           // realtime: refresh every 30s
    refetchOnWindowFocus: true,
  })

  const t = data?.totals ?? {}

  return (
    <div className="w-full space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Platform Analytics</h1>
          <p className="text-white/40 text-sm mt-0.5">Real database metrics across users, imports, reviews and email delivery</p>
        </div>
        <span className="flex items-center gap-2 text-xs text-white/35 glass border border-white/10 rounded-full px-3 py-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          Live · refreshes every 30s
          {dataUpdatedAt ? ` · updated ${new Date(dataUpdatedAt).toLocaleTimeString()}` : ''}
        </span>
      </div>

      {/* KPI rows */}
      <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-3">
        <KpiCard icon={Users} label="Users Registered" value={t.users} loading={isLoading} color="indigo" delay={0} />
        <KpiCard icon={Activity} label="Active (7d)" value={t.active_week} loading={isLoading} color="emerald" delay={0.03} />
        <KpiCard icon={UserX} label="Inactive" value={t.inactive} loading={isLoading} color="rose" delay={0.06} />
        <KpiCard icon={Briefcase} label="Jobs Imported" value={t.jobs} loading={isLoading} color="cyan" delay={0.09} />
        <KpiCard icon={CheckCircle} label="Jobs Approved" value={t.jobs_approved} loading={isLoading} color="emerald" delay={0.12} />
        <KpiCard icon={XCircle} label="Jobs Rejected" value={t.jobs_rejected} loading={isLoading} color="rose" delay={0.15} />
        <KpiCard icon={Send} label="Emails Sent" value={data?.email_stats?.sent} loading={isLoading} color="purple" delay={0.18} />
        <KpiCard icon={Mail} label="Email Success" value={data?.email_stats?.success_rate ?? null} suffix="%" decimals={1} loading={isLoading} color="amber" delay={0.21} />
      </div>

      {/* Row: imports daily (area) + review funnel */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <ChartCard title="Daily Imports" subtitle="Jobs imported per day — last 14 days"
          icon={TrendingUp} loading={isLoading} empty={!data?.imports_daily?.length}
          className="xl:col-span-2" delay={0.1} height={250}>
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={data?.imports_daily ?? []}>
              <defs>
                <linearGradient id="gradImports" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#22d3ee" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
              <XAxis dataKey="day" tick={axisTick} axisLine={false} tickLine={false} />
              <YAxis tick={axisTick} axisLine={false} tickLine={false} allowDecimals={false} width={28} />
              <Tooltip content={<ChartTooltip />} />
              <Area type="monotone" dataKey="jobs" name="Jobs" stroke="#22d3ee" strokeWidth={2} fill="url(#gradImports)" />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Review Funnel" subtitle="Imported → Pending → Approved → Published"
          icon={GitBranch} loading={isLoading} empty={!data?.review_funnel?.length} delay={0.14} height={250}>
          <FunnelBars data={data?.review_funnel ?? []} />
        </ChartCard>
      </div>

      {/* Row: weekly + monthly + application types */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        <ChartCard title="Weekly Imports" subtitle="Last 8 weeks" icon={BarChart3}
          loading={isLoading} empty={!data?.imports_weekly?.length} delay={0.18} height={220}>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data?.imports_weekly ?? []} barSize={22}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
              <XAxis dataKey="week" tick={axisTick} axisLine={false} tickLine={false} />
              <YAxis tick={axisTick} axisLine={false} tickLine={false} allowDecimals={false} width={28} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
              <Bar dataKey="jobs" name="Jobs" fill="#818cf8" fillOpacity={0.85} radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Monthly Imports" subtitle="Last 6 months" icon={BarChart3}
          loading={isLoading} empty={!data?.imports_monthly?.length} delay={0.22} height={220}>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data?.imports_monthly ?? []} barSize={26}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
              <XAxis dataKey="month" tick={axisTick} axisLine={false} tickLine={false} />
              <YAxis tick={axisTick} axisLine={false} tickLine={false} allowDecimals={false} width={28} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
              <Bar dataKey="jobs" name="Jobs" fill="#c084fc" fillOpacity={0.85} radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Application Type Distribution" subtitle="How imported jobs accept applications"
          icon={PieIcon} loading={isLoading} empty={!data?.application_types?.length} delay={0.26} height={220}>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={data?.application_types ?? []} dataKey="value" nameKey="name"
                cx="50%" cy="45%" innerRadius={45} outerRadius={70} paddingAngle={4} strokeWidth={0}>
                {(data?.application_types ?? []).map((_, i) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} fillOpacity={0.9} />
                ))}
              </Pie>
              <Legend formatter={(v) => <span style={{ color: 'rgba(255,255,255,0.55)', fontSize: 10 }}>{v}</span>} />
              <Tooltip content={<ChartTooltip />} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Row: top companies / cities / roles */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        <HBar data={data?.top_companies} nameKey="company" icon={Building2}
          title="Top Companies" subtitle="Most frequent in imported jobs" loading={isLoading} delay={0.3} />
        <HBar data={data?.top_cities} nameKey="city" icon={MapPin}
          title="Top Cities" subtitle="Where the jobs are" loading={isLoading} delay={0.34} />
        <HBar data={data?.top_roles} nameKey="role" icon={Layers}
          title="Top Roles" subtitle="Role families in demand" loading={isLoading} delay={0.38} />
      </div>

      {/* Row: SMTP daily + heatmap + user growth */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        <ChartCard title="Email Delivery" subtitle="SMTP success vs failures — last 14 days"
          icon={Mail} loading={isLoading} empty={!data?.smtp_daily?.length} delay={0.42} height={230}>
          <ResponsiveContainer width="100%" height={230}>
            <ComposedChart data={data?.smtp_daily ?? []} barSize={12}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
              <XAxis dataKey="day" tick={{ ...axisTick, fontSize: 9 }} axisLine={false} tickLine={false} />
              <YAxis tick={axisTick} axisLine={false} tickLine={false} allowDecimals={false} width={26} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="success" name="Delivered" fill="#34d399" fillOpacity={0.85} radius={[4, 4, 0, 0]} />
              <Line type="monotone" dataKey="failed" name="Failed" stroke="#f87171" strokeWidth={2} dot={{ r: 2 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Activity Heatmap" subtitle="Platform actions by weekday & time"
          icon={Flame} loading={isLoading} empty={!data?.activity_heatmap} delay={0.46} height={230}>
          {data?.activity_heatmap && <Heatmap hm={data.activity_heatmap} />}
        </ChartCard>

        <ChartCard title="User Growth" subtitle="Signups & running total" icon={Users}
          loading={isLoading} empty={!data?.user_growth?.length} delay={0.5} height={230}>
          <ResponsiveContainer width="100%" height={230}>
            <AreaChart data={data?.user_growth ?? []}>
              <defs>
                <linearGradient id="gradUsersA" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#818cf8" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#818cf8" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
              <XAxis dataKey="month" tick={axisTick} axisLine={false} tickLine={false} />
              <YAxis tick={axisTick} axisLine={false} tickLine={false} allowDecimals={false} width={26} />
              <Tooltip content={<ChartTooltip />} />
              <Area type="monotone" dataKey="total" name="Total" stroke="#818cf8" strokeWidth={2} fill="url(#gradUsersA)" />
              <Area type="monotone" dataKey="signups" name="Signups" stroke="#34d399" strokeWidth={2} fill="transparent" />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  )
}
