import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  Users, Shield, User, Briefcase, MapPin, CheckCircle2, Clock, ChevronDown,
  TrendingUp, BarChart3, PieChart as PieIcon, Layers, FileText, Mail,
} from 'lucide-react'
import { useState } from 'react'
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts'
import ChartCard from '@/components/dashboard/ChartCard'
import { CHART_COLORS, axisTick, gridStroke, ChartTooltip } from '@/components/dashboard/chartTheme'
import api from '@/lib/api'
import { cn } from '@/lib/utils'
import toast from 'react-hot-toast'

interface AdminAnalytics {
  totals: {
    users: number; admins: number; onboarded: number; signups_today: number
    active_today: number; active_week: number; jobs: number; resumes: number
    avg_ats: number; ai_usage: number
  }
  user_growth: { month: string; signups: number; total: number }[]
  experience_distribution: { name: string; value: number }[]
  top_skills: { skill: string; count: number }[]
  preferred_roles: { name: string; value: number }[]
  locations: { location: string; count: number }[]
  resume_scores: { range: string; count: number }[]
  smtp_performance: { success: number; failed: number; rate: number } | null
  applications: { stage: string; count: number }[]
}

interface AdminUser {
  id: string
  name: string
  email: string
  role: 'user' | 'admin'
  avatar: string | null
  current_role: string | null
  current_location: string | null
  skills: string[]
  years_experience: number | null
  onboarding_complete: boolean
  is_active: boolean
  permissions: string[] | null
  created_at: string | null
  last_login: string | null
  last_active: string | null
  job_count: number
  application_count: number
  resume_count: number
  best_ats: number | null
  smtp_status: string | null
}

interface UserListResponse { items: AdminUser[]; total: number; limit: number; offset: number }

interface UserDetail {
  user: AdminUser
  profile: { phone: string | null; linkedin_url: string | null; github_url: string | null; portfolio_url: string | null; preferred_roles: string[]; preferred_locations: string[] }
  resumes: { id: string; name: string; ats_score: number; file_url: string }[]
  applications: { id: string; to_email: string; subject: string; status: string; created_at: string }[]
  activity: { action: string; description: string; created_at: string }[]
}

const PERMISSION_KEYS = [
  ['dashboard', 'Dashboard'], ['import', 'Import Jobs'], ['jobs', 'Jobs'], ['archives', 'Archives'],
  ['smtp', 'SMTP'], ['resume', 'Resume'], ['analytics', 'Analytics'], ['templates', 'Templates'],
  ['logs', 'Activity Logs'], ['settings', 'Settings'],
] as const

const PAGE = 15

export default function AdminUsers() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [sort, setSort] = useState('created_at')
  const [offset, setOffset] = useState(0)
  const [drawerId, setDrawerId] = useState<string | null>(null)
  const [tempPass, setTempPass] = useState<{ email: string; password: string } | null>(null)
  const [permDraft, setPermDraft] = useState<string[] | null>(null)

  const { data: userPage, isLoading } = useQuery<UserListResponse>({
    queryKey: ['admin-users', search, roleFilter, statusFilter, sort, offset],
    queryFn: async () => {
      const p = new URLSearchParams({ sort, limit: String(PAGE), offset: String(offset) })
      if (search.trim()) p.set('q', search.trim())
      if (roleFilter) p.set('role', roleFilter)
      if (statusFilter) p.set('status', statusFilter)
      const { data } = await api.get(`/api/users/admin/list?${p}`)
      return data
    },
    placeholderData: (prev) => prev,
  })
  const users = userPage?.items ?? []

  const { data: detail } = useQuery<UserDetail>({
    queryKey: ['admin-user-detail', drawerId],
    queryFn: async () => (await api.get(`/api/users/admin/${drawerId}/detail`)).data,
    enabled: !!drawerId,
  })

  const statusMutation = useMutation({
    mutationFn: async ({ userId, is_active }: { userId: string; is_active: boolean }) =>
      (await api.patch(`/api/users/admin/${userId}/status`, { is_active })).data,
    onSuccess: (res) => {
      toast.success(res.is_active ? 'Account activated' : 'Account suspended')
      qc.invalidateQueries({ queryKey: ['admin-users'] })
      qc.invalidateQueries({ queryKey: ['admin-user-detail'] })
    },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Failed'),
  })

  const resetMutation = useMutation({
    mutationFn: async (userId: string) =>
      (await api.post(`/api/users/admin/${userId}/reset-password`)).data,
    onSuccess: (res, userId) => {
      const u = users.find(x => x.id === userId)
      setTempPass({ email: u?.email ?? '', password: res.temp_password })
    },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Failed'),
  })

  const permMutation = useMutation({
    mutationFn: async ({ userId, permissions }: { userId: string; permissions: string[] | null }) =>
      (await api.patch(`/api/users/admin/${userId}/permissions`, { permissions })).data,
    onSuccess: () => {
      toast.success('Sidebar permissions saved')
      qc.invalidateQueries({ queryKey: ['admin-users'] })
      qc.invalidateQueries({ queryKey: ['admin-user-detail'] })
    },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Failed'),
  })

  const { data: analytics, isLoading: analyticsLoading } = useQuery<AdminAnalytics>({
    queryKey: ['admin-analytics'],
    queryFn: async () => {
      const { data } = await api.get('/api/dashboard/admin')
      return data
    },
  })

  const roleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      const { data } = await api.patch(`/api/users/admin/${userId}/role`, { role })
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-users'] })
      toast.success('Role updated')
    },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Failed to update role'),
  })

  const total = userPage?.total ?? 0
  const page = Math.floor(offset / PAGE) + 1
  const pages = Math.max(1, Math.ceil(total / PAGE))
  const totalAdmins = analytics?.totals.admins ?? 0
  const onboardedCount = analytics?.totals.onboarded ?? 0

  return (
    <div className="w-full space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">User Management</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Manage registered users, roles, and permissions</p>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
        {[
          { label: 'Total Users', value: analytics?.totals.users ?? total, icon: Users, color: 'text-indigo-400', bg: 'bg-indigo-500/10 border-indigo-500/20' },
          { label: 'Admins', value: totalAdmins, icon: Shield, color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/20' },
          { label: 'Onboarded', value: onboardedCount, icon: CheckCircle2, color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
          { label: 'Total Jobs', value: analytics?.totals.jobs ?? '—', icon: Briefcase, color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20' },
          { label: 'Signups Today', value: analytics?.totals.signups_today ?? '—', icon: TrendingUp, color: 'text-cyan-400', bg: 'bg-cyan-500/10 border-cyan-500/20' },
          { label: 'Active Today', value: analytics?.totals.active_today ?? '—', icon: Clock, color: 'text-purple-400', bg: 'bg-purple-500/10 border-purple-500/20' },
          { label: 'Avg ATS Score', value: analytics ? `${analytics.totals.avg_ats}%` : '—', icon: FileText, color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20' },
          { label: 'AI Analyses', value: analytics?.totals.ai_usage ?? '—', icon: Layers, color: 'text-rose-400', bg: 'bg-rose-500/10 border-rose-500/20' },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className={cn('glass rounded-xl border p-4 flex items-center gap-3', bg)}>
            <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center bg-foreground/5 shrink-0')}>
              <Icon className={cn('w-4 h-4', color)} />
            </div>
            <div className="min-w-0">
              <p className={cn('text-xl font-bold', color)}>{value}</p>
              <p className="text-xs text-muted-foreground truncate">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Platform analytics charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        <ChartCard
          title="User Growth" subtitle="Signups per month with running total"
          icon={TrendingUp} loading={analyticsLoading} empty={!analytics?.user_growth?.length}
          delay={0.05} height={220}
        >
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={analytics?.user_growth ?? []}>
              <defs>
                <linearGradient id="gradUsers" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#818cf8" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#818cf8" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
              <XAxis dataKey="month" tick={axisTick} axisLine={false} tickLine={false} />
              <YAxis tick={axisTick} axisLine={false} tickLine={false} allowDecimals={false} width={28} />
              <Tooltip content={<ChartTooltip />} />
              <Area type="monotone" dataKey="total" name="Total users" stroke="#818cf8" strokeWidth={2} fill="url(#gradUsers)" />
              <Area type="monotone" dataKey="signups" name="Signups" stroke="#34d399" strokeWidth={2} fill="transparent" />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Experience Distribution" subtitle="User base by years of experience"
          icon={BarChart3} loading={analyticsLoading} empty={!analytics?.experience_distribution?.length}
          delay={0.1} height={220}
        >
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={analytics?.experience_distribution ?? []} barSize={28}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
              <XAxis dataKey="name" tick={axisTick} axisLine={false} tickLine={false} />
              <YAxis tick={axisTick} axisLine={false} tickLine={false} allowDecimals={false} width={28} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: 'color-mix(in srgb, var(--foreground) 6%, transparent)' }} />
              <Bar dataKey="value" name="Users" radius={[6, 6, 0, 0]}>
                {(analytics?.experience_distribution ?? []).map((_, i) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} fillOpacity={0.85} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Preferred Roles" subtitle="What users are hunting for"
          icon={PieIcon} loading={analyticsLoading} empty={!analytics?.preferred_roles?.length}
          delay={0.15} height={220}
        >
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={analytics?.preferred_roles ?? []} dataKey="value" nameKey="name"
                cx="50%" cy="45%" innerRadius={45} outerRadius={70} paddingAngle={4} strokeWidth={0}
              >
                {(analytics?.preferred_roles ?? []).map((_, i) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} fillOpacity={0.9} />
                ))}
              </Pie>
              <Legend formatter={(v) => <span style={{ color: 'var(--muted-foreground)', fontSize: 10 }}>{v}</span>} />
              <Tooltip content={<ChartTooltip />} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Top User Skills" subtitle="Most common skills across the platform"
          icon={Layers} loading={analyticsLoading} empty={!analytics?.top_skills?.length}
          delay={0.2} height={220}
        >
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={(analytics?.top_skills ?? []).slice(0, 7)} layout="vertical" barSize={12}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} horizontal={false} />
              <XAxis type="number" tick={axisTick} axisLine={false} tickLine={false} allowDecimals={false} />
              <YAxis type="category" dataKey="skill" tick={{ ...axisTick, fontSize: 10 }} axisLine={false} tickLine={false} width={76} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: 'color-mix(in srgb, var(--foreground) 6%, transparent)' }} />
              <Bar dataKey="count" name="Users" radius={[0, 6, 6, 0]}>
                {(analytics?.top_skills ?? []).slice(0, 7).map((_, i) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} fillOpacity={0.85} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Resume Scores" subtitle="ATS score distribution platform-wide"
          icon={FileText} loading={analyticsLoading} empty={!analytics?.resume_scores?.length}
          emptyLabel="No resumes analyzed yet" delay={0.25} height={220}
        >
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={analytics?.resume_scores ?? []} barSize={30}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
              <XAxis dataKey="range" tick={axisTick} axisLine={false} tickLine={false} />
              <YAxis tick={axisTick} axisLine={false} tickLine={false} allowDecimals={false} width={28} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: 'color-mix(in srgb, var(--foreground) 6%, transparent)' }} />
              <Bar dataKey="count" name="Resumes" fill="#c084fc" fillOpacity={0.85} radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="SMTP Delivery Health" subtitle="Successful vs failed email operations"
          icon={Mail} loading={analyticsLoading} empty={!analytics?.smtp_performance}
          emptyLabel="No email activity yet" delay={0.3} height={220}
        >
          {analytics?.smtp_performance && (
            <div className="flex flex-col items-center justify-center h-[220px] gap-3">
              <ResponsiveContainer width="100%" height={150}>
                <PieChart>
                  <Pie
                    data={[
                      { name: 'Success', value: analytics.smtp_performance.success },
                      { name: 'Failed', value: analytics.smtp_performance.failed },
                    ]}
                    dataKey="value" nameKey="name" cx="50%" cy="50%"
                    innerRadius={42} outerRadius={62} paddingAngle={4} strokeWidth={0}
                  >
                    <Cell fill="#34d399" fillOpacity={0.9} />
                    <Cell fill="#f87171" fillOpacity={0.9} />
                  </Pie>
                  <Tooltip content={<ChartTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              <p className="text-sm">
                <span className="text-emerald-400 font-bold text-lg">{analytics.smtp_performance.rate}%</span>
                <span className="text-muted-foreground ml-2 text-xs">success rate ({analytics.smtp_performance.success} ok / {analytics.smtp_performance.failed} failed)</span>
              </p>
            </div>
          )}
        </ChartCard>
      </div>

      {/* Toolbar: search + filters + sort */}
      <div className="flex flex-wrap gap-2">
        <input
          value={search}
          onChange={e => { setSearch(e.target.value); setOffset(0) }}
          placeholder="Search by name, email, or role…"
          className="flex-1 min-w-[220px] glass rounded-xl border border-border bg-transparent px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-indigo-500/50 transition-colors"
        />
        <select value={roleFilter} onChange={e => { setRoleFilter(e.target.value); setOffset(0) }}
          className="glass rounded-xl px-3 py-2.5 text-sm text-muted-foreground border border-border focus:border-indigo-500/40 focus:outline-none">
          <option value="" className="bg-card">All roles</option>
          <option value="user" className="bg-card">User</option>
          <option value="admin" className="bg-card">Admin</option>
        </select>
        <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setOffset(0) }}
          className="glass rounded-xl px-3 py-2.5 text-sm text-muted-foreground border border-border focus:border-indigo-500/40 focus:outline-none">
          <option value="" className="bg-card">All status</option>
          <option value="active" className="bg-card">Active</option>
          <option value="suspended" className="bg-card">Suspended</option>
        </select>
        <select value={sort} onChange={e => { setSort(e.target.value); setOffset(0) }}
          className="glass rounded-xl px-3 py-2.5 text-sm text-muted-foreground border border-border focus:border-indigo-500/40 focus:outline-none">
          <option value="created_at" className="bg-card">Newest first</option>
          <option value="name" className="bg-card">Name</option>
          <option value="last_login" className="bg-card">Last active</option>
          <option value="jobs" className="bg-card">Most jobs</option>
          <option value="applications" className="bg-card">Most applications</option>
          <option value="ats" className="bg-card">Best ATS</option>
        </select>
      </div>

      {/* Users table */}
      <div className="glass rounded-2xl border border-border overflow-hidden">
        <div className="hidden lg:grid grid-cols-[2.2fr_1fr_0.6fr_0.6fr_0.6fr_0.8fr_1fr_0.8fr_1.4fr] gap-3 px-5 py-3 text-[10px] text-muted-foreground uppercase tracking-wider">
          <span>User</span><span>Experience</span><span>Jobs</span><span>Apps</span>
          <span>ATS</span><span>SMTP</span><span>Last Active</span><span>Status</span><span>Actions</span>
        </div>

        {isLoading ? (
          <div className="p-12 text-center text-muted-foreground text-sm">Loading users…</div>
        ) : users.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground text-sm">No users match these filters</div>
        ) : (
          <div className="divide-y divide-white/5">
            {users.map((u, idx) => (
              <motion.div
                key={u.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.02 }}
                className={cn(
                  'grid grid-cols-2 lg:grid-cols-[2.2fr_1fr_0.6fr_0.6fr_0.6fr_0.8fr_1fr_0.8fr_1.4fr] gap-3 px-5 py-3.5 items-center hover:bg-foreground/[0.02] transition-colors',
                  !u.is_active && 'opacity-50'
                )}
              >
                <button onClick={() => { setDrawerId(u.id); setPermDraft(null) }} className="flex items-center gap-3 min-w-0 text-left">
                  <div className="w-8 h-8 rounded-full bg-indigo-600/30 border border-indigo-500/30 flex items-center justify-center shrink-0 text-xs font-bold text-indigo-300">
                    {u.avatar
                      ? <img src={u.avatar} alt={u.name} className="w-full h-full rounded-full object-cover" />
                      : u.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white truncate flex items-center gap-1.5">
                      {u.name}
                      {u.role === 'admin' && <Shield className="w-3 h-3 text-yellow-400 shrink-0" />}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                  </div>
                </button>
                <span className="text-xs text-muted-foreground truncate">
                  {u.years_experience != null ? `${u.years_experience} yrs` : '—'}
                  {u.current_role ? ` · ${u.current_role}` : ''}
                </span>
                <span className="text-sm text-muted-foreground tabular-nums">{u.job_count}</span>
                <span className="text-sm text-muted-foreground tabular-nums">{u.application_count}</span>
                <span className={cn('text-sm font-semibold tabular-nums',
                  u.best_ats == null ? 'text-muted-foreground/60' : u.best_ats >= 80 ? 'text-emerald-400' : u.best_ats >= 60 ? 'text-yellow-400' : 'text-red-400')}>
                  {u.best_ats ?? '—'}
                </span>
                <span>
                  {u.smtp_status === 'success'
                    ? <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Verified</span>
                    : u.smtp_status === 'failed'
                    ? <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20">Failed</span>
                    : <span className="text-[10px] text-muted-foreground/60">—</span>}
                </span>
                <span className="text-xs text-muted-foreground">
                  {u.last_active ? new Date(u.last_active).toLocaleDateString() : u.last_login ? new Date(u.last_login).toLocaleDateString() : 'Never'}
                </span>
                <span>
                  {u.is_active
                    ? <span className="flex items-center gap-1 text-xs text-emerald-400"><CheckCircle2 className="w-3 h-3" /> Active</span>
                    : <span className="flex items-center gap-1 text-xs text-red-400"><Clock className="w-3 h-3" /> Suspended</span>}
                </span>
                <div className="flex items-center gap-1.5 justify-end lg:justify-start">
                  <div className="relative">
                    <select
                      value={u.role}
                      onChange={e => roleMutation.mutate({ userId: u.id, role: e.target.value })}
                      className={cn(
                        'appearance-none pl-2 pr-5 py-1 rounded-lg text-[10px] border cursor-pointer outline-none bg-transparent',
                        u.role === 'admin' ? 'text-yellow-400 border-yellow-500/30 bg-yellow-500/10' : 'text-muted-foreground border-white/15'
                      )}>
                      <option value="user" className="bg-card text-foreground">User</option>
                      <option value="admin" className="bg-card text-foreground">Admin</option>
                    </select>
                    <ChevronDown className="w-2.5 h-2.5 text-muted-foreground absolute right-1 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                  <button
                    title={u.is_active ? 'Suspend account' : 'Activate account'}
                    onClick={() => statusMutation.mutate({ userId: u.id, is_active: !u.is_active })}
                    className={cn('px-2 py-1 rounded-lg text-[10px] border transition-colors',
                      u.is_active
                        ? 'text-red-400/70 border-red-500/20 hover:bg-red-500/10'
                        : 'text-emerald-400 border-emerald-500/25 hover:bg-emerald-500/10')}>
                    {u.is_active ? 'Suspend' : 'Activate'}
                  </button>
                  <button title="Reset password" onClick={() => resetMutation.mutate(u.id)}
                    className="px-2 py-1 rounded-lg text-[10px] border border-border text-muted-foreground hover:text-foreground/85 hover:border-accent/30">
                    Reset PW
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        )}

        {total > PAGE && (
          <div className="flex items-center justify-between px-5 py-2.5 border-t border-border text-xs text-muted-foreground">
            <span>{total} users · page {page} of {pages}</span>
            <div className="flex gap-1.5">
              <button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}
                className="px-2.5 py-1 rounded-lg border border-border hover:border-accent/30 disabled:opacity-30">Prev</button>
              <button disabled={offset + PAGE >= total} onClick={() => setOffset(offset + PAGE)}
                className="px-2.5 py-1 rounded-lg border border-border hover:border-accent/30 disabled:opacity-30">Next</button>
            </div>
          </div>
        )}
      </div>

      {/* Temp password modal (shown once) */}
      {tempPass && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)' }} onClick={() => setTempPass(null)}>
          <div className="glass rounded-2xl border border-white/15 p-6 max-w-sm w-full text-center space-y-3" onClick={e => e.stopPropagation()}>
            <h3 className="text-foreground font-semibold text-sm">Temporary Password</h3>
            <p className="text-muted-foreground text-xs">For {tempPass.email} — shown only once. Share it securely; user should change it after login.</p>
            <p className="font-mono text-lg text-indigo-300 bg-indigo-500/10 border border-indigo-500/25 rounded-xl py-2.5 select-all">{tempPass.password}</p>
            <button onClick={() => { navigator.clipboard.writeText(tempPass.password); toast.success('Copied') }}
              className="w-full py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium">Copy & Close</button>
          </div>
        </div>
      )}

      {/* User detail drawer */}
      {drawerId && (
        <div className="fixed inset-0 z-50 flex justify-end" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={() => setDrawerId(null)}>
          <motion.div initial={{ x: 420 }} animate={{ x: 0 }} transition={{ type: 'tween', duration: 0.25 }}
            className="w-full max-w-md h-full overflow-y-auto bg-card border-l border-border p-5 space-y-5"
            onClick={e => e.stopPropagation()}>
            {!detail ? (
              <div className="h-40 rounded-xl bg-foreground/5 shimmer" />
            ) : (
              <>
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-indigo-600/30 border border-indigo-500/30 flex items-center justify-center text-lg font-bold text-indigo-300">
                    {detail.user.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-foreground font-semibold truncate">{detail.user.name}</p>
                    <p className="text-muted-foreground text-xs truncate">{detail.user.email}</p>
                  </div>
                  <button onClick={() => setDrawerId(null)} className="text-muted-foreground hover:text-white text-xl leading-none">×</button>
                </div>

                <div className="grid grid-cols-4 gap-2 text-center">
                  {[['Jobs', detail.user.job_count], ['Apps', detail.user.application_count],
                    ['Resumes', detail.user.resume_count], ['ATS', detail.user.best_ats ?? '—']].map(([l, v]) => (
                    <div key={l as string} className="glass rounded-xl border border-border py-2">
                      <p className="text-foreground font-bold text-sm">{v as any}</p>
                      <p className="text-muted-foreground text-[10px]">{l}</p>
                    </div>
                  ))}
                </div>

                <div className="space-y-1 text-xs text-muted-foreground">
                  {detail.profile.phone && <p>📞 {detail.profile.phone}</p>}
                  {detail.profile.github_url && <p className="truncate">GitHub: {detail.profile.github_url}</p>}
                  {detail.profile.linkedin_url && <p className="truncate">LinkedIn: {detail.profile.linkedin_url}</p>}
                  {detail.profile.portfolio_url && <p className="truncate">Portfolio: {detail.profile.portfolio_url}</p>}
                </div>

                {/* Sidebar permissions matrix */}
                <div className="glass rounded-xl border border-border p-3.5">
                  <p className="text-xs text-muted-foreground font-medium mb-2">Sidebar Access (DB-driven)</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {PERMISSION_KEYS.map(([key, label]) => {
                      const current = permDraft ?? detail.user.permissions ?? PERMISSION_KEYS.map(([k]) => k)
                      const checked = current.includes(key)
                      return (
                        <label key={key} className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                          <input type="checkbox" checked={checked} className="accent-indigo-500"
                            onChange={() => {
                              const next = checked ? current.filter(k => k !== key) : [...current, key]
                              setPermDraft(next)
                            }} />
                          {label}
                        </label>
                      )
                    })}
                  </div>
                  <div className="flex gap-2 mt-3">
                    <button onClick={() => permMutation.mutate({ userId: detail.user.id, permissions: permDraft })}
                      disabled={permDraft == null || permMutation.isPending}
                      className="flex-1 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium disabled:opacity-40">
                      Save Access
                    </button>
                    <button onClick={() => { permMutation.mutate({ userId: detail.user.id, permissions: null }); setPermDraft(null) }}
                      className="py-1.5 px-3 rounded-lg border border-border text-muted-foreground text-xs hover:text-foreground/80">
                      Reset to all
                    </button>
                  </div>
                </div>

                {detail.resumes.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground font-medium mb-2">Resumes</p>
                    {detail.resumes.map(r => (
                      <div key={r.id} className="flex items-center justify-between text-xs py-1.5 border-b border-border">
                        <span className="text-muted-foreground truncate">{r.name}</span>
                        <span className="text-emerald-400 font-semibold ml-2">ATS {r.ats_score}</span>
                      </div>
                    ))}
                  </div>
                )}

                {detail.applications.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground font-medium mb-2">Recent Applications</p>
                    {detail.applications.map(a => (
                      <div key={a.id} className="text-xs py-1.5 border-b border-border">
                        <p className="text-muted-foreground truncate">{a.subject}</p>
                        <p className="text-muted-foreground">{a.to_email} · <span className={a.status === 'sent' ? 'text-emerald-400' : a.status === 'failed' ? 'text-red-400' : 'text-yellow-400'}>{a.status}</span></p>
                      </div>
                    ))}
                  </div>
                )}

                {detail.activity.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground font-medium mb-2">Recent Activity</p>
                    {detail.activity.map((l, i) => (
                      <p key={i} className="text-xs text-muted-foreground py-1 border-b border-border truncate">
                        {l.action} <span className="text-muted-foreground">— {new Date(l.created_at).toLocaleString()}</span>
                      </p>
                    ))}
                  </div>
                )}
              </>
            )}
          </motion.div>
        </div>
      )}
    </div>
  )
}
