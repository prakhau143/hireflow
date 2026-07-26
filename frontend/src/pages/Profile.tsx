import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Link } from 'react-router-dom'
import {
  Upload, Download, Eye, Share2, Pencil, Save, X, Plus, Trash2, Star,
  MapPin, Briefcase, CheckCircle2, FolderGit2, Globe, Terminal, Code2, BookOpen,
  Target, Trophy, Sparkles, Brain, ShieldCheck, Link2, ExternalLink,
  Loader2, RefreshCw, Award, Building2, Wallet, MessageSquare,
} from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store/useAppStore'
import api from '@/lib/api'
import toast from 'react-hot-toast'
import type { User, ExperienceEntry, ProjectEntry, CertificationEntry } from '@/types'
import CareerIntelligenceCard from '@/components/profile/CareerIntelligenceCard'
import WeeklyGoalsCard from '@/components/profile/WeeklyGoalsCard'

const API_BASE = (import.meta.env.VITE_API_URL as string) || 'http://localhost:8000'

// ─────────────────────────────────────────────────────────────────────────────
// Types for the intelligence endpoints
// ─────────────────────────────────────────────────────────────────────────────
interface HealthScore {
  score: number
  breakdown: { key: string; label: string; percent: number; points: number; max_points: number }[]
  suggestions: { action: string; gain: number }[]
}
interface CareerInsights {
  career_path: { stage: string; title: string; skills_needed: string[] }[]
  interview_readiness: { score: number; missing_topics: string[]; strong_topics: string[] }
  recruiter_view: { first_impression: string; top_highlights: string[]; biggest_gap: string }
  cached?: boolean
}
interface PortfolioHealth {
  checks: { label: string; url: string | null; status: string; status_code?: number; error?: string }[]
  github_activity: { username: string; public_repos: number; followers: number; updated_at: string } | null
}
interface ResumeSummary { id: string; name: string; file_url: string; ats_score: number }
interface Intelligence {
  best_resume_id: string | null
  avg_ats: number
  versions: { id: string; name: string; ats_score: number; section_scores: Record<string, number> | null }[]
}

// ─────────────────────────────────────────────────────────────────────────────
// Small shared UI pieces
// ─────────────────────────────────────────────────────────────────────────────
function Card({ title, icon: Icon, iconColor = 'text-accent', action, children, id }: {
  title: string; icon: any; iconColor?: string; action?: React.ReactNode; children: React.ReactNode; id?: string
}) {
  return (
    <motion.div id={id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
      className="glass rounded-2xl border border-border p-5 space-y-4 scroll-mt-20">
      <div className="flex items-center justify-between">
        <h3 className="text-foreground font-semibold text-sm flex items-center gap-2">
          <Icon className={cn('w-4 h-4', iconColor)} />{title}
        </h3>
        {action}
      </div>
      {children}
    </motion.div>
  )
}

function StarRating({ value, onChange }: { value: number; onChange?: (v: number) => void }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(n => (
        <button key={n} type="button" disabled={!onChange} onClick={() => onChange?.(n)}
          className={cn(!onChange && 'cursor-default')}>
          <Star className={cn('w-3.5 h-3.5', n <= value ? 'text-yellow-400 fill-yellow-400' : 'text-muted-foreground/50')} />
        </button>
      ))}
    </div>
  )
}

function ChipList({ items, onAdd, onRemove, placeholder, colorClass = 'bg-accent/10 text-accent border-accent/20' }: {
  items: string[]; onAdd: (v: string) => void; onRemove: (v: string) => void; placeholder: string; colorClass?: string
}) {
  const [val, setVal] = useState('')
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {items.map(item => (
          <span key={item} className={cn('flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border', colorClass)}>
            {item}
            <button onClick={() => onRemove(item)} className="hover:text-red-400"><X className="w-2.5 h-2.5" /></button>
          </span>
        ))}
        {items.length === 0 && <span className="text-xs text-muted-foreground">None added yet</span>}
      </div>
      <div className="flex gap-1.5">
        <input value={val} onChange={e => setVal(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && val.trim()) { onAdd(val.trim()); setVal('') } }}
          placeholder={placeholder}
          className="flex-1 glass rounded-lg px-2.5 py-1.5 text-xs text-foreground/85 placeholder:text-muted-foreground border border-border focus:border-accent/40 focus:outline-none" />
        <button onClick={() => { if (val.trim()) { onAdd(val.trim()); setVal('') } }}
          className="px-2.5 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:border-accent/30">
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}

function EditToggle({ editing, onToggle, onSave, saving }: { editing: boolean; onToggle: () => void; onSave: () => void; saving?: boolean }) {
  return editing ? (
    <div className="flex items-center gap-1.5">
      <button onClick={onSave} disabled={saving} className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-accent hover:bg-accent/90 text-accent-foreground text-xs disabled:opacity-50">
        {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />} Save
      </button>
      <button onClick={onToggle} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground/80"><X className="w-3.5 h-3.5" /></button>
    </div>
  ) : (
    <button onClick={onToggle} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground/85 hover:bg-foreground/5"><Pencil className="w-3.5 h-3.5" /></button>
  )
}

function Field({ label, value, onChange, placeholder, type = 'text' }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string
}) {
  return (
    <div className="space-y-1">
      <label className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full glass rounded-lg px-2.5 py-2 text-sm text-foreground/85 placeholder:text-muted-foreground border border-border focus:border-accent/40 focus:outline-none" />
    </div>
  )
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <div className="space-y-1">
      <label className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)}
        className="w-full glass rounded-lg px-2.5 py-2 text-sm text-foreground/80 border border-border focus:border-accent/40 focus:outline-none">
        <option value="" className="bg-card">Not set</option>
        {options.map(o => <option key={o} value={o} className="bg-card">{o}</option>)}
      </select>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────
export default function Profile() {
  const qc = useQueryClient()
  const storeUser = useAppStore(s => s.user)
  const setStoreUser = useAppStore(s => s.setUser)

  const { data: user, isLoading: userLoading } = useQuery<User>({
    queryKey: ['me-full'],
    queryFn: async () => {
      const { data } = await api.get('/api/users/me')
      setStoreUser(data)
      return data
    },
    initialData: storeUser ?? undefined,
  })

  const { data: health, isLoading: healthLoading } = useQuery<HealthScore>({
    queryKey: ['profile-health'],
    queryFn: async () => (await api.get('/api/users/me/health-score')).data,
  })

  const { data: resumes } = useQuery<ResumeSummary[]>({
    queryKey: ['resumes'],
    queryFn: async () => (await api.get('/api/resumes/')).data,
  })
  const bestResume = resumes?.length ? [...resumes].sort((a, b) => b.ats_score - a.ats_score)[0] : null

  const { data: intelligence } = useQuery<Intelligence>({
    queryKey: ['resume-intelligence'],
    queryFn: async () => (await api.get('/api/resumes/intelligence')).data,
    enabled: (resumes?.length ?? 0) > 0,
  })
  const bestVersion = intelligence?.versions.find(v => v.id === intelligence.best_resume_id)

  const saveProfile = useMutation({
    mutationFn: async (patch: Partial<User>) => (await api.patch('/api/users/profile', patch)).data,
    onSuccess: (data) => {
      qc.setQueryData(['me-full'], data)
      setStoreUser(data)
      qc.invalidateQueries({ queryKey: ['profile-health'] })
      toast.success('Profile updated')
    },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Update failed'),
  })

  const fileInputRef = useRef<HTMLInputElement>(null)
  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData()
      fd.append('file', file)
      return (await api.post('/api/resumes/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } })).data
    },
    onSuccess: () => {
      toast.success('Resume uploaded and analyzed')
      qc.invalidateQueries({ queryKey: ['resumes'] })
      qc.invalidateQueries({ queryKey: ['resume-intelligence'] })
      qc.invalidateQueries({ queryKey: ['profile-health'] })
    },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Upload failed'),
  })

  function shareProfile() {
    if (!user) return
    const lines = [
      `${user.name}${user.headline ? ' — ' + user.headline : ''}`,
      user.current_location ? `📍 ${user.current_location}` : '',
      user.years_experience != null ? `💼 ${user.years_experience} years experience` : '',
      (user.skills?.length ?? 0) > 0 ? `Skills: ${user.skills!.slice(0, 8).join(', ')}` : '',
      user.github_url ? `GitHub: ${user.github_url}` : '',
      user.portfolio_url ? `Portfolio: ${user.portfolio_url}` : '',
      user.linkedin_url ? `LinkedIn: ${user.linkedin_url}` : '',
    ].filter(Boolean)
    navigator.clipboard.writeText(lines.join('\n'))
    toast.success('Profile summary copied to clipboard')
  }

  if (userLoading || !user) {
    return <div className="w-full space-y-4"><div className="h-40 rounded-2xl bg-foreground/5 shimmer" /><div className="h-64 rounded-2xl bg-foreground/5 shimmer" /></div>
  }

  return (
    <div className="w-full space-y-5 pb-24">
      <Hero user={user} health={health} healthLoading={healthLoading} bestResume={bestResume}
        onUploadClick={() => fileInputRef.current?.click()} onShare={shareProfile} />
      <input ref={fileInputRef} type="file" accept=".pdf" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) uploadMutation.mutate(f) }} />

      <CompletionCard health={health} loading={healthLoading} />

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        {/* LEFT — main content */}
        <div className="xl:col-span-2 space-y-5">
          <ProfessionalInfoCard user={user} onSave={patch => saveProfile.mutate(patch)} saving={saveProfile.isPending} />
          <SkillsMatrixCard user={user} onSave={patch => saveProfile.mutate(patch)} saving={saveProfile.isPending} />
          <ExperienceTimelineCard user={user} onSave={patch => saveProfile.mutate(patch)} saving={saveProfile.isPending} />
          <ProjectsCard user={user} onSave={patch => saveProfile.mutate(patch)} saving={saveProfile.isPending} />
        </div>

        {/* RIGHT — sidebar */}
        <div className="space-y-5">
          <CareerGoalsCard user={user} onSave={patch => saveProfile.mutate(patch)} />
          <CertificationsCard user={user} onSave={patch => saveProfile.mutate(patch)} saving={saveProfile.isPending} />
          <SocialProfilesCard user={user} onSave={patch => saveProfile.mutate(patch)} saving={saveProfile.isPending} />
          <ResumeIntelligenceSummary bestResume={bestResume} bestVersion={bestVersion} />
          <CareerIntelligenceCard />
          <WeeklyGoalsCard />
          <AICareerAdvisorCard hasData={(user.skills?.length ?? 0) > 0} />
          <PortfolioHealthCard user={user} />
        </div>
      </div>

      <FloatingAIAssistant user={user} health={health} intelligence={intelligence} />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Hero
// ─────────────────────────────────────────────────────────────────────────────
function Hero({ user, health, healthLoading, bestResume, onUploadClick, onShare }: {
  user: User; health: HealthScore | undefined; healthLoading: boolean
  bestResume: ResumeSummary | null; onUploadClick: () => void; onShare: () => void
}) {
  return (
    <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
      className="glass rounded-2xl border border-border p-6 relative overflow-hidden">
      <div className="absolute -top-24 -right-24 w-64 h-64 rounded-full blur-3xl pointer-events-none" style={{ background: 'var(--gradient-2)', opacity: 0.15 }} />
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-5 relative">
        <div className="flex items-center gap-4 min-w-0">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[var(--gradient-1)] to-[var(--gradient-2)] flex items-center justify-center text-2xl font-bold text-white shrink-0">
            {user.name?.[0]?.toUpperCase() ?? 'U'}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold text-foreground truncate">{user.name}</h1>
              {user.is_active !== false && (
                <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
                  <CheckCircle2 className="w-2.5 h-2.5" /> Verified
                </span>
              )}
            </div>
            {user.headline && <p className="text-muted-foreground text-sm mt-0.5 truncate">{user.headline}</p>}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-xs text-muted-foreground">
              {user.current_location && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{user.current_location}</span>}
              {user.years_experience != null && <span className="flex items-center gap-1"><Briefcase className="w-3 h-3" />{user.years_experience} yrs experience</span>}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4 shrink-0">
          <div className="text-center">
            <p className={cn('text-lg font-bold', !bestResume ? 'text-muted-foreground' : bestResume.ats_score >= 80 ? 'text-emerald-400' : 'text-yellow-400')}>
              {bestResume ? `${bestResume.ats_score}%` : '—'}
            </p>
            <p className="text-[10px] text-muted-foreground">Resume Score</p>
          </div>
          <div className="text-center">
            <p className={cn('text-lg font-bold', healthLoading ? 'text-muted-foreground' : (health?.score ?? 0) >= 80 ? 'text-emerald-400' : (health?.score ?? 0) >= 50 ? 'text-yellow-400' : 'text-red-400')}>
              {healthLoading ? '—' : `${health?.score ?? 0}%`}
            </p>
            <p className="text-[10px] text-muted-foreground">Profile Complete</p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mt-5 pt-4 border-t border-border">
        <button onClick={onUploadClick} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-accent/20 border border-accent/30 text-accent text-xs hover:bg-accent/30">
          <Upload className="w-3.5 h-3.5" /> Upload Resume
        </button>
        {bestResume && (
          <>
            <a href={`${API_BASE}${bestResume.file_url}`} download
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl glass border border-border text-muted-foreground text-xs hover:text-foreground hover:border-accent/30">
              <Download className="w-3.5 h-3.5" /> Download Resume
            </a>
            <a href={`${API_BASE}${bestResume.file_url}`} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl glass border border-border text-muted-foreground text-xs hover:text-foreground hover:border-accent/30">
              <Eye className="w-3.5 h-3.5" /> Preview Resume
            </a>
          </>
        )}
        <button onClick={onShare} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl glass border border-border text-muted-foreground text-xs hover:text-foreground hover:border-accent/30 ml-auto">
          <Share2 className="w-3.5 h-3.5" /> Share Profile
        </button>
      </div>
    </motion.div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Profile Completion
// ─────────────────────────────────────────────────────────────────────────────
function CompletionCard({ health, loading }: { health: HealthScore | undefined; loading: boolean }) {
  return (
    <Card title="Profile Completion" icon={Target} iconColor="text-purple-400">
      {loading || !health ? (
        <div className="h-24 rounded-xl bg-foreground/5 shimmer" />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {health.breakdown.map(b => (
              <div key={b.key}>
                <div className="flex items-center justify-between text-[10px] mb-1">
                  <span className="text-muted-foreground truncate">{b.label}</span>
                  <span className="text-foreground/80 font-semibold">{b.percent}%</span>
                </div>
                <div className="h-1.5 bg-foreground/5 rounded-full overflow-hidden">
                  <motion.div initial={{ width: 0 }} animate={{ width: `${b.percent}%` }} transition={{ duration: 0.6 }}
                    className={cn('h-full rounded-full', b.percent >= 75 ? 'bg-emerald-500' : b.percent >= 40 ? 'bg-yellow-500' : 'bg-red-500')} />
                </div>
              </div>
            ))}
          </div>
          {health.suggestions.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5">Quick wins</p>
              {health.suggestions.map(s => (
                <div key={s.action} className="flex items-center justify-between text-xs bg-foreground/[0.02] border border-border rounded-lg px-2.5 py-1.5">
                  <span className="text-muted-foreground">{s.action}</span>
                  <span className="text-emerald-400 font-semibold shrink-0 ml-2">+{s.gain}%</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Professional Information
// ─────────────────────────────────────────────────────────────────────────────
function ProfessionalInfoCard({ user, onSave, saving }: { user: User; onSave: (p: Partial<User>) => void; saving: boolean }) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({
    headline: user.headline ?? '', current_role: user.current_role ?? '', current_company: user.current_company ?? '',
    years_experience: String(user.years_experience ?? ''), expected_salary: user.expected_salary ?? '',
    notice_period: user.notice_period ?? '', employment_type_pref: user.employment_type_pref ?? '',
    current_location: user.current_location ?? '', remote_preference: user.remote_preference ?? '', timezone: user.timezone ?? '',
  })

  useEffect(() => { if (!editing) setForm({
    headline: user.headline ?? '', current_role: user.current_role ?? '', current_company: user.current_company ?? '',
    years_experience: String(user.years_experience ?? ''), expected_salary: user.expected_salary ?? '',
    notice_period: user.notice_period ?? '', employment_type_pref: user.employment_type_pref ?? '',
    current_location: user.current_location ?? '', remote_preference: user.remote_preference ?? '', timezone: user.timezone ?? '',
  }) }, [user, editing])

  function save() {
    onSave({
      ...form,
      years_experience: form.years_experience ? Number(form.years_experience) : undefined,
    } as any)
    setEditing(false)
  }

  return (
    <Card title="Professional Information" icon={Building2}
      action={<EditToggle editing={editing} onToggle={() => setEditing(!editing)} onSave={save} saving={saving} />}>
      {editing ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Headline" value={form.headline} onChange={v => setForm({ ...form, headline: v })} placeholder="Backend Engineer | AI Automation Developer" />
          <Field label="Current Role" value={form.current_role} onChange={v => setForm({ ...form, current_role: v })} />
          <Field label="Current Company" value={form.current_company} onChange={v => setForm({ ...form, current_company: v })} />
          <Field label="Years Experience" type="number" value={form.years_experience} onChange={v => setForm({ ...form, years_experience: v })} />
          <Field label="Expected Salary" value={form.expected_salary} onChange={v => setForm({ ...form, expected_salary: v })} placeholder="e.g. 18-20 LPA" />
          <Field label="Notice Period" value={form.notice_period} onChange={v => setForm({ ...form, notice_period: v })} placeholder="e.g. Immediate, 30 days" />
          <Select label="Employment Type" value={form.employment_type_pref} onChange={v => setForm({ ...form, employment_type_pref: v })}
            options={['Full Time', 'Contract', 'Internship', 'Part Time']} />
          <Field label="Preferred Location" value={form.current_location} onChange={v => setForm({ ...form, current_location: v })} />
          <Select label="Remote Preference" value={form.remote_preference} onChange={v => setForm({ ...form, remote_preference: v })}
            options={['Remote', 'Hybrid', 'Onsite', 'Flexible']} />
          <Field label="Timezone" value={form.timezone} onChange={v => setForm({ ...form, timezone: v })} placeholder="e.g. IST (UTC+5:30)" />
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
          {[
            ['Current Role', user.current_role], ['Company', user.current_company],
            ['Experience', user.years_experience != null ? `${user.years_experience} yrs` : null],
            ['Expected Salary', user.expected_salary], ['Notice Period', user.notice_period],
            ['Employment Type', user.employment_type_pref], ['Location', user.current_location],
            ['Remote Pref', user.remote_preference], ['Timezone', user.timezone],
          ].map(([label, val]) => (
            <div key={label as string}>
              <p className="text-muted-foreground">{label}</p>
              <p className="text-foreground/85 mt-0.5">{val || <span className="text-muted-foreground/60 italic">Not set</span>}</p>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Skills Matrix
// ─────────────────────────────────────────────────────────────────────────────
function SkillsMatrixCard({ user, onSave, saving }: { user: User; onSave: (p: Partial<User>) => void; saving: boolean }) {
  const [editing, setEditing] = useState(false)
  const [rows, setRows] = useState<{ skill: string; level: number; years: number }[]>([])
  const [newSkill, setNewSkill] = useState('')

  useEffect(() => {
    const prof = user.skill_proficiency ?? {}
    const merged = (user.skills ?? []).map(s => ({
      skill: s, level: prof[s]?.level ?? 3, years: prof[s]?.years ?? 0,
    }))
    setRows(merged)
  }, [user, editing])

  function save() {
    const skill_proficiency: Record<string, { level: number; years: number }> = {}
    rows.forEach(r => { skill_proficiency[r.skill] = { level: r.level, years: r.years } })
    onSave({ skills: rows.map(r => r.skill), skill_proficiency } as any)
    setEditing(false)
  }

  return (
    <Card title="Skills Matrix" icon={Code2}
      action={<EditToggle editing={editing} onToggle={() => setEditing(!editing)} onSave={save} saving={saving} />}>
      {rows.length === 0 && !editing ? (
        <p className="text-muted-foreground text-xs">No skills added yet — click edit to add some.</p>
      ) : (
        <div className="space-y-2">
          {rows.map((r, i) => (
            <div key={r.skill} className="flex items-center justify-between gap-3 py-1 border-b border-border last:border-0">
              <span className="text-sm text-foreground/85 min-w-0 truncate flex-1">{r.skill}</span>
              <div className="flex items-center gap-3 shrink-0">
                {editing && (
                  <input type="number" min={0} step={0.5} value={r.years}
                    onChange={e => setRows(rows.map((x, xi) => xi === i ? { ...x, years: Number(e.target.value) } : x))}
                    className="w-14 glass rounded-md px-1.5 py-0.5 text-xs text-foreground/80 border border-border focus:outline-none" />
                )}
                {!editing && r.years > 0 && <span className="text-[10px] text-muted-foreground">{r.years}y</span>}
                <StarRating value={r.level} onChange={editing ? (v => setRows(rows.map((x, xi) => xi === i ? { ...x, level: v } : x))) : undefined} />
                {editing && (
                  <button onClick={() => setRows(rows.filter((_, xi) => xi !== i))} className="text-muted-foreground hover:text-red-400">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
          {editing && (
            <div className="flex gap-1.5 pt-2">
              <input value={newSkill} onChange={e => setNewSkill(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && newSkill.trim()) { setRows([...rows, { skill: newSkill.trim(), level: 3, years: 0 }]); setNewSkill('') } }}
                placeholder="Add a skill…"
                className="flex-1 glass rounded-lg px-2.5 py-1.5 text-xs text-foreground/85 placeholder:text-muted-foreground border border-border focus:border-accent/40 focus:outline-none" />
              <button onClick={() => { if (newSkill.trim()) { setRows([...rows, { skill: newSkill.trim(), level: 3, years: 0 }]); setNewSkill('') } }}
                className="px-2.5 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:border-accent/30"><Plus className="w-3.5 h-3.5" /></button>
            </div>
          )}
        </div>
      )}
    </Card>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Experience Timeline
// ─────────────────────────────────────────────────────────────────────────────
function ExperienceTimelineCard({ user, onSave, saving }: { user: User; onSave: (p: Partial<User>) => void; saving: boolean }) {
  const [editing, setEditing] = useState(false)
  const [rows, setRows] = useState<ExperienceEntry[]>([])

  useEffect(() => { setRows(user.experience_timeline ?? []) }, [user, editing])

  function update(i: number, patch: Partial<ExperienceEntry>) {
    setRows(rows.map((r, ri) => ri === i ? { ...r, ...patch } : r))
  }
  function save() { onSave({ experience_timeline: rows } as any); setEditing(false) }

  return (
    <Card title="Experience Timeline" icon={Briefcase}
      action={<EditToggle editing={editing} onToggle={() => setEditing(!editing)} onSave={save} saving={saving} />}>
      {rows.length === 0 && !editing ? (
        <p className="text-muted-foreground text-xs">No experience entries yet.</p>
      ) : (
        <div className="space-y-0">
          {rows.map((r, i) => (
            <div key={i} className="relative pl-5 pb-5 last:pb-0 border-l border-border last:border-transparent">
              <div className="absolute -left-[5px] top-0.5 w-2.5 h-2.5 rounded-full bg-accent border-2 border-card" />
              {editing ? (
                <div className="grid grid-cols-2 gap-2 -mt-1">
                  <Field label="Title" value={r.title} onChange={v => update(i, { title: v })} />
                  <Field label="Company" value={r.company} onChange={v => update(i, { company: v })} />
                  <Field label="Start" value={r.start} onChange={v => update(i, { start: v })} placeholder="2022" />
                  <Field label="End" value={r.end} onChange={v => update(i, { end: v })} placeholder="Present" />
                  <div className="col-span-2">
                    <Field label="Description" value={r.description ?? ''} onChange={v => update(i, { description: v })} />
                  </div>
                  <button onClick={() => setRows(rows.filter((_, ri) => ri !== i))}
                    className="col-span-2 text-xs text-red-400/70 hover:text-red-400 flex items-center gap-1 justify-end"><Trash2 className="w-3 h-3" /> Remove</button>
                </div>
              ) : (
                <div>
                  <p className="text-sm text-foreground/85 font-medium">{r.title}</p>
                  <p className="text-xs text-muted-foreground">{r.company} · {r.start} – {r.current ? 'Present' : r.end}</p>
                  {r.description && <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{r.description}</p>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {editing && (
        <button onClick={() => setRows([...rows, { title: '', company: '', start: '', end: 'Present', current: true, description: '' }])}
          className="flex items-center gap-1.5 text-xs text-accent hover:text-accent/80"><Plus className="w-3.5 h-3.5" /> Add experience</button>
      )}
    </Card>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Projects
// ─────────────────────────────────────────────────────────────────────────────
function ProjectsCard({ user, onSave, saving }: { user: User; onSave: (p: Partial<User>) => void; saving: boolean }) {
  const [editing, setEditing] = useState(false)
  const [rows, setRows] = useState<ProjectEntry[]>([])

  useEffect(() => { setRows(user.projects ?? []) }, [user, editing])

  function update(i: number, patch: Partial<ProjectEntry>) { setRows(rows.map((r, ri) => ri === i ? { ...r, ...patch } : r)) }
  function save() { onSave({ projects: rows } as any); setEditing(false) }

  return (
    <Card title="Projects" icon={BookOpen}
      action={<EditToggle editing={editing} onToggle={() => setEditing(!editing)} onSave={save} saving={saving} />}>
      {rows.length === 0 && !editing ? (
        <p className="text-muted-foreground text-xs">No projects added yet.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {rows.map((r, i) => (
            <div key={i} className="rounded-xl border border-border bg-foreground/[0.02] p-3 space-y-2">
              {editing ? (
                <>
                  <Field label="Name" value={r.name} onChange={v => update(i, { name: v })} />
                  <Field label="Description" value={r.description ?? ''} onChange={v => update(i, { description: v })} />
                  <Field label="Tech (comma separated)" value={(r.tech ?? []).join(', ')} onChange={v => update(i, { tech: v.split(',').map(t => t.trim()).filter(Boolean) })} />
                  <Field label="GitHub" value={r.github ?? ''} onChange={v => update(i, { github: v })} />
                  <Field label="Live Demo" value={r.demo ?? ''} onChange={v => update(i, { demo: v })} />
                  <button onClick={() => setRows(rows.filter((_, ri) => ri !== i))}
                    className="text-xs text-red-400/70 hover:text-red-400 flex items-center gap-1"><Trash2 className="w-3 h-3" /> Remove</button>
                </>
              ) : (
                <>
                  <p className="text-sm text-foreground/85 font-medium">{r.name}</p>
                  {r.description && <p className="text-xs text-muted-foreground leading-relaxed">{r.description}</p>}
                  {(r.tech?.length ?? 0) > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {r.tech!.map(t => <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/20 text-cyan-300">{t}</span>)}
                    </div>
                  )}
                  <div className="flex gap-3 pt-1">
                    {r.github && <a href={r.github.startsWith('http') ? r.github : `https://${r.github}`} target="_blank" rel="noopener noreferrer" className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"><FolderGit2 className="w-3 h-3" /> GitHub</a>}
                    {r.demo && <a href={r.demo.startsWith('http') ? r.demo : `https://${r.demo}`} target="_blank" rel="noopener noreferrer" className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"><ExternalLink className="w-3 h-3" /> Live Demo</a>}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
      {editing && (
        <button onClick={() => setRows([...rows, { name: '', description: '', tech: [], github: '', demo: '' }])}
          className="flex items-center gap-1.5 text-xs text-accent hover:text-accent/80"><Plus className="w-3.5 h-3.5" /> Add project</button>
      )}
    </Card>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Career Goals
// ─────────────────────────────────────────────────────────────────────────────
function CareerGoalsCard({ user, onSave }: { user: User; onSave: (p: Partial<User>) => void }) {
  const [targetSalary, setTargetSalary] = useState(user.target_salary ?? '')
  useEffect(() => setTargetSalary(user.target_salary ?? ''), [user])

  return (
    <Card title="Career Goals" icon={Trophy} iconColor="text-yellow-400">
      <div className="space-y-3">
        <div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5">Dream Companies</p>
          <ChipList items={user.dream_companies ?? []} placeholder="e.g. Google"
            colorClass="bg-yellow-500/10 text-yellow-300 border-yellow-500/20"
            onAdd={v => onSave({ dream_companies: [...(user.dream_companies ?? []), v] } as any)}
            onRemove={v => onSave({ dream_companies: (user.dream_companies ?? []).filter(x => x !== v) } as any)} />
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5">Preferred Domains</p>
          <ChipList items={user.preferred_domains ?? []} placeholder="e.g. Backend, AI"
            colorClass="bg-purple-500/10 text-purple-300 border-purple-500/20"
            onAdd={v => onSave({ preferred_domains: [...(user.preferred_domains ?? []), v] } as any)}
            onRemove={v => onSave({ preferred_domains: (user.preferred_domains ?? []).filter(x => x !== v) } as any)} />
        </div>
        <div className="flex items-center gap-2">
          <Wallet className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <input value={targetSalary} onChange={e => setTargetSalary(e.target.value)}
            onBlur={() => { if (targetSalary !== (user.target_salary ?? '')) onSave({ target_salary: targetSalary } as any) }}
            placeholder="Target salary e.g. 20 LPA"
            className="flex-1 glass rounded-lg px-2.5 py-1.5 text-xs text-foreground/85 placeholder:text-muted-foreground border border-border focus:border-accent/40 focus:outline-none" />
        </div>
        <p className="text-[10px] text-muted-foreground leading-relaxed">These goals are used by the AI matching engine to prioritize recommended jobs.</p>
      </div>
    </Card>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Certifications
// ─────────────────────────────────────────────────────────────────────────────
function CertificationsCard({ user, onSave, saving }: { user: User; onSave: (p: Partial<User>) => void; saving: boolean }) {
  const [editing, setEditing] = useState(false)
  const [rows, setRows] = useState<CertificationEntry[]>([])
  useEffect(() => { setRows(user.certifications ?? []) }, [user, editing])

  function save() { onSave({ certifications: rows } as any); setEditing(false) }

  return (
    <Card title="Certifications" icon={Award} iconColor="text-emerald-400"
      action={<EditToggle editing={editing} onToggle={() => setEditing(!editing)} onSave={save} saving={saving} />}>
      {rows.length === 0 && !editing ? (
        <p className="text-muted-foreground text-xs">No certifications added yet.</p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {rows.map((c, i) => (
            <div key={i} className={cn(
              'rounded-lg border p-2.5 text-xs',
              (c as any).url ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-border bg-foreground/[0.02]'
            )}>
              {editing ? (
                <div className="space-y-1.5">
                  <input value={c.name} onChange={e => setRows(rows.map((x, xi) => xi === i ? { ...x, name: e.target.value } : x))}
                    placeholder="Certification name" className="w-full bg-transparent border-b border-border text-foreground/85 text-xs focus:outline-none pb-1" />
                  <input value={c.issuer ?? ''} onChange={e => setRows(rows.map((x, xi) => xi === i ? { ...x, issuer: e.target.value } : x))}
                    placeholder="Issuer" className="w-full bg-transparent border-b border-border text-muted-foreground text-[10px] focus:outline-none pb-1" />
                  <button onClick={() => setRows(rows.filter((_, xi) => xi !== i))} className="text-red-400/70 hover:text-red-400"><Trash2 className="w-3 h-3" /></button>
                </div>
              ) : (c as any).url ? (
                <a href={(c as any).url} target="_blank" rel="noopener noreferrer" className="block">
                  <p className="text-foreground/85 font-medium truncate">{c.name}</p>
                  <p className="text-muted-foreground">{c.issuer}{c.year ? ` · ${c.year}` : ''}</p>
                </a>
              ) : (
                <div>
                  <p className="text-foreground/85 font-medium truncate">{c.name}</p>
                  <p className="text-muted-foreground">{c.issuer}{c.year ? ` · ${c.year}` : ''}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {editing && (
        <button onClick={() => setRows([...rows, { name: '', issuer: '', year: new Date().getFullYear() }])}
          className="flex items-center gap-1.5 text-xs text-accent hover:text-accent/80"><Plus className="w-3.5 h-3.5" /> Add certification</button>
      )}
    </Card>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Social Profiles
// ─────────────────────────────────────────────────────────────────────────────
function SocialProfilesCard({ user, onSave, saving }: { user: User; onSave: (p: Partial<User>) => void; saving: boolean }) {
  const [editing, setEditing] = useState(false)
  const fields: [string, keyof User, any][] = [
    ['GitHub', 'github_url', FolderGit2], ['Portfolio', 'portfolio_url', Globe], ['LinkedIn', 'linkedin_url', Briefcase],
    ['LeetCode', 'leetcode_url', Code2], ['HackerRank', 'hackerrank_url', Terminal], ['Medium', 'medium_url', BookOpen],
  ]
  const [form, setForm] = useState<Record<string, string>>({})
  useEffect(() => {
    const f: Record<string, string> = {}
    fields.forEach(([, key]) => { f[key as string] = (user[key] as string) ?? '' })
    setForm(f)
  }, [user, editing])

  function save() { onSave(form as any); setEditing(false) }

  return (
    <Card title="Social Profiles" icon={Link2}
      action={<EditToggle editing={editing} onToggle={() => setEditing(!editing)} onSave={save} saving={saving} />}>
      <div className="space-y-2">
        {fields.map(([label, key, Icon]) => (
          <div key={key as string} className="flex items-center gap-2.5">
            <Icon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            {editing ? (
              <input value={form[key as string] ?? ''} onChange={e => setForm({ ...form, [key]: e.target.value })}
                placeholder={`${label} URL`}
                className="flex-1 glass rounded-lg px-2.5 py-1.5 text-xs text-foreground/85 placeholder:text-muted-foreground border border-border focus:border-accent/40 focus:outline-none" />
            ) : user[key] ? (
              <a href={user[key] as string} target="_blank" rel="noopener noreferrer" className="text-xs text-muted-foreground hover:text-accent truncate">{user[key] as string}</a>
            ) : (
              <span className="text-xs text-muted-foreground/60 italic">Not linked</span>
            )}
          </div>
        ))}
      </div>
    </Card>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Resume Intelligence summary + Smart Resume Selection
// ─────────────────────────────────────────────────────────────────────────────
function ResumeIntelligenceSummary({ bestResume, bestVersion }: { bestResume: ResumeSummary | null; bestVersion: Intelligence['versions'][number] | undefined }) {
  const sections = bestVersion?.section_scores
  return (
    <Card title="Resume Intelligence" icon={Sparkles} iconColor="text-cyan-400">
      {!bestResume ? (
        <p className="text-muted-foreground text-xs">Upload a resume to see AI insights here.</p>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs bg-cyan-500/8 border border-cyan-500/20 rounded-lg px-3 py-2">
            <span className="text-cyan-300">Recommended: <b>{bestResume.name}</b></span>
            <span className="text-cyan-400 font-bold">ATS {bestResume.ats_score}</span>
          </div>
          {sections && (
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
              {Object.entries(sections).slice(0, 6).map(([k, v]) => (
                <div key={k}>
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-muted-foreground capitalize">{k.replace(/_/g, ' ')}</span>
                    <span className="text-foreground/80 font-semibold">{v}</span>
                  </div>
                  <div className="h-1 bg-foreground/5 rounded-full overflow-hidden">
                    <div className={cn('h-full rounded-full', v >= 75 ? 'bg-emerald-500' : v >= 50 ? 'bg-yellow-500' : 'bg-red-500')} style={{ width: `${v}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
          <Link to="/resume" className="flex items-center justify-center gap-1.5 text-xs text-accent hover:text-accent/80 pt-1">
            Improve Resume <ExternalLink className="w-3 h-3" />
          </Link>
        </div>
      )}
    </Card>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// AI Career Advisor: career path + interview readiness + recruiter view
// ─────────────────────────────────────────────────────────────────────────────
function AICareerAdvisorCard({ hasData }: { hasData: boolean }) {
  const qc = useQueryClient()
  const [tab, setTab] = useState<'path' | 'interview' | 'recruiter'>('path')

  const { data, isLoading, refetch, isFetching } = useQuery<CareerInsights>({
    queryKey: ['career-insights'],
    queryFn: async () => (await api.get('/api/users/me/career-insights')).data,
    enabled: false,
    retry: false,
  })

  async function regenerate() {
    try {
      const { data } = await api.get('/api/users/me/career-insights?refresh=true')
      qc.setQueryData(['career-insights'], data)
    } catch (e: any) {
      toast.error(e.response?.data?.detail || 'Failed to generate insights')
    }
  }

  return (
    <Card title="AI Career Advisor" icon={Brain} iconColor="text-purple-400"
      action={
        data ? (
          <button onClick={regenerate} disabled={isFetching} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground/80 disabled:opacity-40">
            <RefreshCw className={cn('w-3.5 h-3.5', isFetching && 'animate-spin')} />
          </button>
        ) : null
      }>
      {!data ? (
        <div className="text-center py-4 space-y-2">
          <p className="text-xs text-muted-foreground">Get your AI-generated career path, interview readiness score, and a preview of how recruiters see your profile.</p>
          <button onClick={() => refetch()} disabled={isLoading || !hasData}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-500/20 border border-purple-500/30 text-purple-300 text-xs hover:bg-purple-500/30 disabled:opacity-40">
            {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            {isLoading ? 'Analyzing…' : 'Generate Insights'}
          </button>
          {!hasData && <p className="text-[10px] text-muted-foreground">Add some skills first</p>}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex gap-1 text-[10px]">
            {(['path', 'interview', 'recruiter'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={cn('px-2 py-1 rounded-lg border capitalize',
                  tab === t ? 'bg-purple-500/20 border-purple-500/30 text-purple-300' : 'border-border text-muted-foreground hover:text-foreground/80')}>
                {t === 'path' ? 'Career Path' : t === 'interview' ? 'Interview Readiness' : 'Recruiter View'}
              </button>
            ))}
          </div>

          {tab === 'path' && (
            <div className="space-y-2.5">
              {data.career_path.map((s, i) => (
                <div key={i} className="flex items-start gap-2.5">
                  <div className={cn('w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0 mt-0.5',
                    s.stage === 'current' ? 'bg-foreground/10 text-muted-foreground' : 'bg-purple-500/20 text-purple-300')}>{i + 1}</div>
                  <div className="min-w-0">
                    <p className="text-xs text-foreground/85 font-medium">{s.title}</p>
                    {s.skills_needed.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {s.skills_needed.map(sk => <span key={sk} className="text-[9px] px-1.5 py-0.5 rounded bg-purple-500/10 border border-purple-500/20 text-purple-300">{sk}</span>)}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === 'interview' && (
            <div className="space-y-2.5">
              <div className="text-center">
                <p className={cn('text-2xl font-black', data.interview_readiness.score >= 75 ? 'text-emerald-400' : data.interview_readiness.score >= 50 ? 'text-yellow-400' : 'text-red-400')}>
                  {data.interview_readiness.score}%
                </p>
                <p className="text-[10px] text-muted-foreground">Interview Readiness</p>
              </div>
              {data.interview_readiness.strong_topics.length > 0 && (
                <div>
                  <p className="text-[10px] text-emerald-400/70 mb-1">Strong in</p>
                  <div className="flex flex-wrap gap-1">{data.interview_readiness.strong_topics.map(t => <span key={t} className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-300">{t}</span>)}</div>
                </div>
              )}
              {data.interview_readiness.missing_topics.length > 0 && (
                <div>
                  <p className="text-[10px] text-red-400/70 mb-1">Prepare</p>
                  <div className="flex flex-wrap gap-1">{data.interview_readiness.missing_topics.map(t => <span key={t} className="text-[9px] px-1.5 py-0.5 rounded bg-red-500/10 border border-red-500/20 text-red-300">{t}</span>)}</div>
                </div>
              )}
            </div>
          )}

          {tab === 'recruiter' && (
            <div className="space-y-2.5 text-xs">
              <div className="p-2.5 rounded-lg bg-foreground/[0.03] border border-border">
                <p className="text-muted-foreground text-[10px] mb-1">First 6-second impression</p>
                <p className="text-foreground/80 leading-relaxed">{data.recruiter_view.first_impression}</p>
              </div>
              <div>
                <p className="text-[10px] text-emerald-400/70 mb-1">Top highlights</p>
                {data.recruiter_view.top_highlights.map((h, i) => <p key={i} className="text-muted-foreground flex items-start gap-1.5"><CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0 mt-0.5" />{h}</p>)}
              </div>
              <div className="p-2.5 rounded-lg bg-amber-500/8 border border-amber-500/20">
                <p className="text-amber-300/80 text-[10px] mb-1">Biggest gap</p>
                <p className="text-muted-foreground leading-relaxed">{data.recruiter_view.biggest_gap}</p>
              </div>
            </div>
          )}
          {data.cached && <p className="text-[9px] text-muted-foreground/60 text-center">⚡ Cached — click ↻ to regenerate</p>}
        </div>
      )}
    </Card>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Portfolio Health Check
// ─────────────────────────────────────────────────────────────────────────────
function PortfolioHealthCard({ user }: { user: User }) {
  const { data, isFetching, refetch } = useQuery<PortfolioHealth>({
    queryKey: ['portfolio-health'],
    queryFn: async () => (await api.get('/api/users/me/portfolio-health')).data,
    enabled: false,
    retry: false,
  })
  const hasLinks = !!(user.github_url || user.portfolio_url || user.linkedin_url)

  return (
    <Card title="Portfolio Health Check" icon={ShieldCheck} iconColor="text-emerald-400"
      action={
        <button onClick={() => refetch()} disabled={isFetching || !hasLinks}
          className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-border text-muted-foreground hover:text-foreground text-[10px] disabled:opacity-40">
          {isFetching ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />} Check Links
        </button>
      }>
      {!hasLinks ? (
        <p className="text-muted-foreground text-xs">Add GitHub, Portfolio or LinkedIn links to verify them here.</p>
      ) : !data ? (
        <p className="text-muted-foreground text-xs">Click "Check Links" to verify your links are live and reachable.</p>
      ) : (
        <div className="space-y-2">
          {data.checks.filter(c => c.status !== 'not_set').map(c => (
            <div key={c.label} className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{c.label}</span>
              <span className={cn('flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-[10px]',
                c.status === 'reachable' ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                  : c.status_code === 999 ? 'text-muted-foreground bg-foreground/5 border-border'
                  : 'text-red-400 bg-red-500/10 border-red-500/20')}>
                {c.status === 'reachable' ? <CheckCircle2 className="w-2.5 h-2.5" /> : null}
                {c.status === 'reachable' ? 'Live' : c.status_code === 999 ? 'Blocks bots' : 'Broken'}
              </span>
            </div>
          ))}
          {data.github_activity && (
            <div className="pt-2 mt-1 border-t border-border text-[10px] text-muted-foreground flex justify-between">
              <span>{data.github_activity.public_repos} public repos</span>
              <span>{data.github_activity.followers} followers</span>
            </div>
          )}
        </div>
      )}
    </Card>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// AI Career Coach — floating, interactive, grounded in the user's real data
// ─────────────────────────────────────────────────────────────────────────────
interface CoachMessage { role: 'system' | 'user' | 'assistant'; text: string; action?: string | null }

function FloatingAIAssistant({ user, health, intelligence }: { user: User; health: HealthScore | undefined; intelligence: Intelligence | undefined }) {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [history, setHistory] = useState<CoachMessage[]>([])
  const scrollRef = useRef<HTMLDivElement>(null)

  const { data: promptsData } = useQuery<{ prompts: string[] }>({
    queryKey: ['career-coach-prompts'],
    queryFn: async () => (await api.get('/api/users/me/career-coach/prompts')).data,
    enabled: open,
    staleTime: Infinity,
  })

  const ask = useMutation({
    mutationFn: async (question: string) => (await api.post('/api/users/me/career-coach', { question })).data,
    onSuccess: (data) => {
      setHistory(h => [...h, { role: 'assistant', text: data.answer, action: data.suggested_action }])
      setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }), 50)
    },
    onError: (e: any) => {
      setHistory(h => [...h, { role: 'assistant', text: e.response?.data?.detail || 'Something went wrong — try again.' }])
    },
  })

  const tips: string[] = []
  if (health?.suggestions?.length) {
    tips.push(`${health.suggestions.length} improvement${health.suggestions.length !== 1 ? 's' : ''} suggested for your profile — top one: "${health.suggestions[0].action}" (+${health.suggestions[0].gain}%).`)
  }
  if (intelligence?.avg_ats) {
    tips.push(`Your average resume ATS score is ${intelligence.avg_ats}. ${intelligence.avg_ats < 85 ? 'A few tweaks could push this well above 90.' : "That's a strong score — keep it up."}`)
  }
  if (tips.length === 0) tips.push("Ask me anything about your job search — which job to apply to, resume tips, salary negotiation, whatever's on your mind.")

  function send(text: string) {
    const q = text.trim()
    if (!q || ask.isPending) return
    setHistory(h => [...h, { role: 'user', text: q }])
    setInput('')
    ask.mutate(q)
  }

  return (
    <div className="fixed bottom-6 right-6 z-40">
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, y: 12, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 12, scale: 0.95 }}
            className="mb-3 w-80 glass rounded-2xl border border-purple-500/25 shadow-2xl flex flex-col overflow-hidden" style={{ maxHeight: 480 }}>
            <div className="flex items-center gap-2 p-4 pb-3 border-b border-border shrink-0">
              <Brain className="w-4 h-4 text-purple-400" />
              <p className="text-foreground text-sm font-semibold">AI Career Coach</p>
            </div>

            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 pt-3 space-y-2.5 min-h-[160px]">
              {history.length === 0 && tips.map((m, i) => (
                <div key={i} className="flex items-start gap-2 text-xs text-foreground/80 bg-foreground/[0.03] border border-border rounded-xl p-2.5 leading-relaxed">
                  <Sparkles className="w-3 h-3 text-purple-400 shrink-0 mt-0.5" />{m}
                </div>
              ))}
              {history.map((m, i) => (
                <div key={i} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
                  <div className={cn(
                    'max-w-[85%] text-xs rounded-xl p-2.5 leading-relaxed',
                    m.role === 'user' ? 'bg-purple-500/20 border border-purple-500/25 text-purple-100' : 'bg-foreground/[0.03] border border-border text-foreground/80'
                  )}>
                    {m.text}
                    {m.action && (
                      <p className="mt-1.5 pt-1.5 border-t border-border text-purple-300 font-medium">→ {m.action}</p>
                    )}
                  </div>
                </div>
              ))}
              {ask.isPending && (
                <div className="flex items-center gap-1.5 text-muted-foreground text-xs px-2.5">
                  <Loader2 className="w-3 h-3 animate-spin" /> Thinking…
                </div>
              )}
            </div>

            {history.length === 0 && (promptsData?.prompts?.length ?? 0) > 0 && (
              <div className="px-4 pb-2 flex flex-wrap gap-1.5 shrink-0">
                {promptsData!.prompts.slice(0, 3).map(p => (
                  <button key={p} onClick={() => send(p)}
                    className="text-[10px] px-2 py-1 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-300 hover:bg-purple-500/20">
                    {p}
                  </button>
                ))}
              </div>
            )}

            <div className="p-3 border-t border-border flex items-center gap-2 shrink-0">
              <input value={input} onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') send(input) }}
                placeholder="Ask your career coach…" disabled={ask.isPending}
                className="flex-1 glass rounded-lg px-3 py-2 text-xs text-foreground/85 placeholder:text-muted-foreground border border-border focus:border-purple-500/40 focus:outline-none disabled:opacity-50" />
              <button onClick={() => send(input)} disabled={!input.trim() || ask.isPending}
                className="p-2 rounded-lg bg-purple-500/20 border border-purple-500/30 text-purple-300 hover:bg-purple-500/30 disabled:opacity-40 shrink-0">
                <Sparkles className="w-3.5 h-3.5" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <motion.button whileTap={{ scale: 0.92 }} onClick={() => setOpen(!open)}
        className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center shadow-xl shadow-purple-900/30">
        {open ? <X className="w-5 h-5 text-white" /> : <Brain className="w-5 h-5 text-white" />}
      </motion.button>
    </div>
  )
}
