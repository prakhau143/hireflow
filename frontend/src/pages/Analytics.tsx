import { motion } from 'framer-motion'
import {
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts'
import { useQuery } from '@tanstack/react-query'
import { BarChart3 } from 'lucide-react'
import { EmptyState, LoadingCards } from '@/components/ui/EmptyState'
import api from '@/lib/api'

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div className="glass rounded-xl px-3 py-2 border border-border shadow-xl text-sm">
      <p className="text-muted-foreground mb-1 text-xs">{label}</p>
      <p className="text-foreground font-semibold">
        {payload[0].value}{payload[0].name?.includes('score') ? '%' : ' jobs'}
      </p>
    </div>
  )
}

export default function Analytics() {
  const { data: stats, isLoading } = useQuery<any>({
    queryKey: ['analytics'],
    queryFn: async () => {
      const { data } = await api.get('/api/jobs/stats/dashboard')
      return data
    },
  })

  const hasData = stats && (
    (stats.top_skills?.length > 0) ||
    (stats.match_distribution?.length > 0) ||
    (stats.total_jobs > 0)
  )

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Analytics</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Comprehensive insights into your job hunt</p>
        </div>
        <LoadingCards count={4} />
      </div>
    )
  }

  if (!hasData) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Analytics</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Comprehensive insights into your job hunt</p>
        </div>
        <EmptyState
          icon={BarChart3}
          title="No analytics data yet"
          description="Import jobs to start seeing trends, skill demand, company breakdowns, and match score improvements."
        />
      </div>
    )
  }

  const topSkills = stats?.top_skills ?? []
  const matchDist = stats?.match_distribution ?? []
  const expDist = stats?.experience_distribution ?? []
  const companies = stats?.top_companies ?? []
  const PIE_COLORS = ['#3b82f6', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b']

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Analytics</h1>
        <p className="text-muted-foreground text-sm mt-0.5">Comprehensive insights into your job hunt</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top Skills in Demand */}
        {topSkills.length > 0 && (
          <ChartCard title="Top Skills in Demand" subtitle="Most required skills across your jobs">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={topSkills} layout="vertical" barSize={16}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                <XAxis type="number" tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="skill" tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }} axisLine={false} tickLine={false} width={70} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="count" radius={[0, 6, 6, 0]}>
                  {topSkills.map((_: any, i: number) => (
                    <Cell key={i} fill={`hsl(${210 + i * 20}, 85%, ${55 + i * 3}%)`} fillOpacity={0.8} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        )}

        {/* Match Distribution */}
        {matchDist.length > 0 && (
          <ChartCard title="Match Score Distribution" subtitle="How your jobs score against your profile">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={matchDist} barSize={32}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="range" tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                  {matchDist.map((_: any, i: number) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} fillOpacity={0.85} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        )}

        {/* Experience Distribution */}
        {expDist.length > 0 && (
          <ChartCard title="Experience Distribution" subtitle="Jobs by required experience level">
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={expDist} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={4} dataKey="count">
                  {expDist.map((_: any, i: number) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} fillOpacity={0.85} />
                  ))}
                </Pie>
                <Legend formatter={(v) => <span style={{ color: 'var(--muted-foreground)', fontSize: 11 }}>{v}</span>} />
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </ChartCard>
        )}

        {/* Top Companies */}
        {companies.length > 0 && (
          <ChartCard title="Companies Hiring" subtitle="Most active companies in your job pool">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={companies} barSize={28}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="company" tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                  {companies.map((_: any, i: number) => (
                    <Cell key={i} fill="#4f46e5" fillOpacity={0.5 + (i % 3) * 0.15} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        )}
      </div>

      {/* Locations */}
      {stats?.top_locations?.length > 0 && (
        <ChartCard title="Locations Overview" subtitle="Top hiring cities for your profile">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 py-2">
            {stats.top_locations.slice(0, 5).map((loc: any, i: number) => {
              const maxCount = stats.top_locations[0]?.count || 1
              return (
                <motion.div
                  key={loc.city ?? loc.location}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: i * 0.07 }}
                  className="glass rounded-xl p-3 border border-border text-center"
                >
                  <div
                    className="h-1.5 rounded-full mb-3 mx-auto"
                    style={{
                      width: `${(loc.count / maxCount) * 100}%`,
                      background: 'linear-gradient(90deg, #4f46e5, #06b6d4)',
                      opacity: 0.6,
                    }}
                  />
                  <p className="text-foreground font-semibold text-lg">{loc.count}</p>
                  <p className="text-muted-foreground text-xs">{loc.city ?? loc.location}</p>
                </motion.div>
              )
            })}
          </div>
        </ChartCard>
      )}
    </div>
  )
}

function ChartCard({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass rounded-2xl border border-border p-5"
    >
      <h3 className="text-foreground font-semibold text-sm">{title}</h3>
      <p className="text-muted-foreground text-xs mb-4 mt-0.5">{subtitle}</p>
      {children}
    </motion.div>
  )
}
