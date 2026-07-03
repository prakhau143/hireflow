import { motion } from 'framer-motion'
import { Import, Target, Archive, Send, Activity } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts'
import StatsCard from '@/components/dashboard/StatsCard'
import { LoadingRows } from '@/components/ui/EmptyState'
import { EmptyState } from '@/components/ui/EmptyState'
import api from '@/lib/api'
import { formatTime } from '@/lib/utils'

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div className="glass rounded-xl px-3 py-2 border border-white/10 shadow-xl text-sm">
      <p className="text-white/60 mb-1">{label}</p>
      <p className="text-white font-semibold">{payload[0].value} jobs</p>
    </div>
  )
}

export default function Dashboard() {
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: async () => {
      const { data } = await api.get('/api/jobs/stats/dashboard')
      return data
    },
  })

  const { data: logs, isLoading: logsLoading } = useQuery({
    queryKey: ['recent-logs'],
    queryFn: async () => {
      const { data } = await api.get('/api/logs/?limit=5')
      return data
    },
  })

  const matchDist = stats?.match_distribution ?? []
  const skillsDemand = stats?.top_skills ?? []
  const expDist = stats?.experience_distribution ?? []

  const PIE_COLORS = ['#3b82f6', '#8b5cf6', '#06b6d4', '#10b981']

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-white/40 text-sm mt-0.5">Your job hunting overview</p>
        </div>
        <Link to="/import">
          <motion.span
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-500/20 border border-indigo-500/30 text-indigo-400 text-sm hover:bg-indigo-500/30 transition-colors cursor-pointer"
          >
            <Import className="w-4 h-4" />
            Import Jobs
          </motion.span>
        </Link>
      </motion.div>

      {/* Stats Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard icon={Import} label="Jobs Imported" value={statsLoading ? '—' : (stats?.total_jobs ?? 0)} change={0} color="blue" delay={0} />
        <StatsCard icon={Target} label="Matched Jobs" value={statsLoading ? '—' : (stats?.matched_jobs ?? 0)} change={0} color="emerald" delay={0.05} />
        <StatsCard icon={Archive} label="Archived" value={statsLoading ? '—' : (stats?.archived_jobs ?? 0)} change={0} color="purple" delay={0.1} />
        <StatsCard icon={Send} label="Applications Sent" value={statsLoading ? '—' : (stats?.applications_sent ?? 0)} change={0} color="cyan" delay={0.15} />
      </div>

      {/* Charts Row */}
      {matchDist.length > 0 || skillsDemand.length > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Match Distribution */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="glass rounded-2xl p-5 border border-white/10"
          >
            <h3 className="text-white font-semibold mb-1">Match Distribution</h3>
            <p className="text-white/40 text-xs mb-4">Score breakdown across imported jobs</p>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={matchDist} barSize={32}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="range" tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                  {matchDist.map((_: any, i: number) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} fillOpacity={0.85} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </motion.div>

          {/* Skills Demand */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            className="glass rounded-2xl p-5 border border-white/10"
          >
            <h3 className="text-white font-semibold mb-1">Skills in Demand</h3>
            <p className="text-white/40 text-xs mb-4">Most requested in your job pool</p>
            <div className="space-y-3">
              {skillsDemand.slice(0, 6).map((item: any, i: number) => (
                <div key={item.skill} className="flex items-center gap-3">
                  <span className="text-white/60 text-xs w-16 shrink-0 truncate">{item.skill}</span>
                  <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${(item.count / (skillsDemand[0]?.count || 1)) * 100}%` }}
                      transition={{ delay: 0.3 + i * 0.05, duration: 0.6, ease: 'easeOut' }}
                      className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-cyan-500"
                      style={{ opacity: 0.7 + i * 0.04 }}
                    />
                  </div>
                  <span className="text-white/40 text-xs w-6 text-right">{item.count}</span>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Experience Distribution */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="glass rounded-2xl p-5 border border-white/10"
          >
            <h3 className="text-white font-semibold mb-1">Experience Distribution</h3>
            <p className="text-white/40 text-xs mb-4">Jobs by required experience</p>
            {expDist.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={expDist} cx="50%" cy="50%" innerRadius={55} outerRadius={80} paddingAngle={4} dataKey="count">
                    {expDist.map((_: any, i: number) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} fillOpacity={0.85} />
                    ))}
                  </Pie>
                  <Legend formatter={(value) => <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11 }}>{value}</span>} />
                  <Tooltip content={<CustomTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[200px]">
                <p className="text-white/20 text-sm">No data yet</p>
              </div>
            )}
          </motion.div>
        </div>
      ) : !statsLoading && (
        <EmptyState
          icon={Import}
          title="No data yet"
          description="Import your first jobs to see charts and analytics here."
          action={
            <Link to="/import" className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-500 transition-colors">
              <Import className="w-4 h-4" /> Import Jobs
            </Link>
          }
        />
      )}

      {/* Recent Activity */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35 }}
        className="glass rounded-2xl p-5 border border-white/10"
      >
        <h3 className="text-white font-semibold mb-4">Recent Activity</h3>
        {logsLoading ? (
          <LoadingRows count={3} />
        ) : !logs?.length ? (
          <EmptyState
            icon={Activity}
            title="No activity yet"
            description="Your actions will appear here as you use HireFlow."
          />
        ) : (
          <div className="space-y-3">
            {logs.map((log: any, i: number) => (
              <motion.div
                key={log.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.4 + i * 0.05 }}
                className="flex items-center gap-4"
              >
                <span className="text-white/30 text-xs w-20 shrink-0">{formatTime(log.created_at)}</span>
                <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 shrink-0" />
                <span className="text-white/70 text-sm">{log.action}</span>
              </motion.div>
            ))}
          </div>
        )}
      </motion.div>
    </div>
  )
}
