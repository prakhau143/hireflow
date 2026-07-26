import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import {
  User, Bell, Shield, Palette, Trash2, Save, Sparkles, Zap, Globe2,
  Eye, EyeOff, LogOut, Download, AlertTriangle, Loader2, Smartphone, History,
} from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAppStore } from '@/store/useAppStore'
import { cn } from '@/lib/utils'
import api from '@/lib/api'
import toast from 'react-hot-toast'
import type { User as UserType } from '@/types'

interface Settings {
  notification_prefs: Record<string, boolean>
  ai_preferences: { provider: string; tone: string }
  apply_preferences: {
    auto_apply: boolean; min_match_score: number; daily_limit: number
    skip_duplicate: boolean; skip_no_contact: boolean; skip_low_match: boolean
  }
  appearance_prefs: { theme: string; accent: string; animations: boolean; compact_mode: boolean }
  locale_prefs: { language: string; country: string; date_format: string }
}

const TABS = [
  { id: 'account', label: 'Account', icon: User },
  { id: 'security', label: 'Security', icon: Shield },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'ai', label: 'AI Preferences', icon: Sparkles },
  { id: 'apply', label: 'Apply Preferences', icon: Zap },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'privacy', label: 'Privacy', icon: Globe2 },
] as const

const NOTIF_LABELS: Record<string, string> = {
  job_match: 'New job matches', resume_analysis: 'Resume analysis complete',
  smtp_status: 'SMTP delivery issues', application_sent: 'Application sent confirmations',
  interview_reminder: 'Interview reminders', ai_reports: 'AI report ready',
  weekly_summary: 'Weekly summary email', monthly_report: 'Monthly report email',
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!checked)}
      className={cn('relative w-10 h-5 rounded-full transition-colors shrink-0', checked ? 'bg-indigo-500/70' : 'bg-foreground/15')}>
      <motion.div layout className={cn('absolute top-0.5 w-4 h-4 rounded-full bg-white', checked ? 'left-5' : 'left-0.5')} />
    </button>
  )
}

function SectionCard({ title, icon: Icon, children }: { title: string; icon: any; children: React.ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
      className="glass rounded-2xl border border-border p-5 space-y-4">
      <h2 className="text-foreground font-medium text-sm flex items-center gap-2">
        <Icon className="w-4 h-4 text-indigo-400" />{title}
      </h2>
      {children}
    </motion.div>
  )
}

export default function SettingsPage() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { setToken, logout } = useAppStore()
  const [tab, setTab] = useState<typeof TABS[number]['id']>('account')

  const { data: user } = useQuery<UserType>({
    queryKey: ['me-full'],
    queryFn: async () => (await api.get('/api/users/me')).data,
  })
  const { data: settings, isLoading: settingsLoading } = useQuery<Settings>({
    queryKey: ['settings'],
    queryFn: async () => (await api.get('/api/users/me/settings')).data,
  })

  const saveProfile = useMutation({
    mutationFn: async (patch: Partial<UserType>) => (await api.patch('/api/users/profile', patch)).data,
    onSuccess: (data) => { qc.setQueryData(['me-full'], data); toast.success('Saved') },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Save failed'),
  })

  const saveSettings = useMutation({
    mutationFn: async (patch: Partial<Settings>) => (await api.patch('/api/users/me/settings', patch)).data,
    onSuccess: (data) => { qc.setQueryData(['settings'], data); toast.success('Preferences saved') },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Save failed'),
  })

  return (
    <div className="w-full max-w-5xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Settings</h1>
        <p className="text-muted-foreground text-sm mt-0.5">Manage your account, security and preferences</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[180px_1fr] gap-5">
        {/* Vertical tab nav */}
        <div className="flex md:flex-col gap-1 overflow-x-auto md:overflow-visible">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={cn(
                'flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium whitespace-nowrap transition-colors text-left',
                tab === t.id ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30' : 'text-muted-foreground hover:text-foreground/85 hover:bg-foreground/5 border border-transparent'
              )}>
              <t.icon className="w-3.5 h-3.5 shrink-0" />{t.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="space-y-5 min-w-0">
          {tab === 'account' && user && <AccountTab user={user} onSave={p => saveProfile.mutate(p)} saving={saveProfile.isPending} />}
          {tab === 'security' && <SecurityTab onTokenRefresh={t => setToken(t)} />}
          {tab === 'notifications' && (
            settingsLoading || !settings ? <div className="h-64 rounded-2xl bg-foreground/5 shimmer" /> :
            <NotificationsTab prefs={settings.notification_prefs} onSave={p => saveSettings.mutate({ notification_prefs: p })} saving={saveSettings.isPending} />
          )}
          {tab === 'ai' && (
            settingsLoading || !settings ? <div className="h-64 rounded-2xl bg-foreground/5 shimmer" /> :
            <AIPreferencesTab prefs={settings.ai_preferences} onSave={p => saveSettings.mutate({ ai_preferences: p })} saving={saveSettings.isPending} />
          )}
          {tab === 'apply' && (
            settingsLoading || !settings ? <div className="h-64 rounded-2xl bg-foreground/5 shimmer" /> :
            <ApplyPreferencesTab prefs={settings.apply_preferences} onSave={p => saveSettings.mutate({ apply_preferences: p })} saving={saveSettings.isPending} />
          )}
          {tab === 'appearance' && (
            settingsLoading || !settings ? <div className="h-64 rounded-2xl bg-foreground/5 shimmer" /> :
            <AppearanceTab prefs={settings.appearance_prefs} onSave={p => saveSettings.mutate({ appearance_prefs: p })} saving={saveSettings.isPending} />
          )}
          {tab === 'privacy' && <PrivacyTab onLogout={() => { logout(); navigate('/login') }} />}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
function AccountTab({ user, onSave, saving }: { user: UserType; onSave: (p: Partial<UserType>) => void; saving: boolean }) {
  const [name, setName] = useState(user.name)
  const [timezone, setTimezone] = useState(user.timezone ?? '')
  useEffect(() => { setName(user.name); setTimezone(user.timezone ?? '') }, [user])

  return (
    <SectionCard title="Account" icon={User}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground uppercase tracking-wider">Full Name</label>
          <input value={name} onChange={e => setName(e.target.value)}
            className="w-full glass rounded-xl px-3 py-2.5 text-sm text-foreground/80 border border-border focus:border-indigo-500/40 focus:outline-none" />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground uppercase tracking-wider">Email</label>
          <input value={user.email} disabled
            className="w-full glass rounded-xl px-3 py-2.5 text-sm text-muted-foreground border border-border cursor-not-allowed" />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground uppercase tracking-wider">Timezone</label>
          <input value={timezone} onChange={e => setTimezone(e.target.value)} placeholder="e.g. IST (UTC+5:30)"
            className="w-full glass rounded-xl px-3 py-2.5 text-sm text-foreground/80 placeholder:text-muted-foreground border border-border focus:border-indigo-500/40 focus:outline-none" />
        </div>
      </div>
      <button onClick={() => onSave({ name, timezone })} disabled={saving}
        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-500/20 border border-indigo-500/30 text-indigo-400 text-sm hover:bg-indigo-500/30 disabled:opacity-50">
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save Changes
      </button>
    </SectionCard>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
function SecurityTab({ onTokenRefresh }: { onTokenRefresh: (token: string) => void }) {
  const [showPw, setShowPw] = useState(false)
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')

  const changePw = useMutation({
    mutationFn: async () => (await api.post('/api/users/me/change-password', { current_password: current, new_password: next })).data,
    onSuccess: (data) => {
      onTokenRefresh(data.access_token)
      toast.success('Password updated')
      setCurrent(''); setNext('')
    },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Failed to update password'),
  })

  const logoutAll = useMutation({
    mutationFn: async () => (await api.post('/api/users/me/logout-all-devices')).data,
    onSuccess: (data) => { onTokenRefresh(data.access_token); toast.success('All other devices signed out') },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Failed'),
  })

  return (
    <>
      <SectionCard title="Password" icon={Shield}>
        <div className="space-y-3 max-w-sm">
          <div className="relative">
            <input type={showPw ? 'text' : 'password'} value={current} onChange={e => setCurrent(e.target.value)}
              placeholder="Current password"
              className="w-full glass rounded-xl px-3 py-2.5 text-sm text-foreground/80 placeholder:text-muted-foreground border border-border focus:border-indigo-500/40 focus:outline-none pr-9" />
          </div>
          <div className="relative">
            <input type={showPw ? 'text' : 'password'} value={next} onChange={e => setNext(e.target.value)}
              placeholder="New password (min 8 characters)"
              className="w-full glass rounded-xl px-3 py-2.5 text-sm text-foreground/80 placeholder:text-muted-foreground border border-border focus:border-indigo-500/40 focus:outline-none pr-9" />
            <button onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-muted-foreground">
              {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <button onClick={() => changePw.mutate()} disabled={changePw.isPending || !current || next.length < 8}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-500/20 border border-indigo-500/30 text-indigo-400 text-sm hover:bg-indigo-500/30 disabled:opacity-50">
            {changePw.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Update Password
          </button>
        </div>
      </SectionCard>

      <SectionCard title="Sessions & Devices" icon={Smartphone}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-foreground/80 text-sm">Logout all other devices</p>
            <p className="text-muted-foreground text-xs mt-0.5">Signs out every session except this one. You'll stay logged in here.</p>
          </div>
          <button onClick={() => logoutAll.mutate()} disabled={logoutAll.isPending}
            className="flex items-center gap-2 px-3 py-2 rounded-xl border border-red-500/25 text-red-400/80 text-xs hover:bg-red-500/10 disabled:opacity-50 shrink-0">
            {logoutAll.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LogOut className="w-3.5 h-3.5" />} Logout Others
          </button>
        </div>
        <div className="pt-3 border-t border-border space-y-2 opacity-50">
          {['Two-factor authentication (2FA)', 'Trusted devices', 'Detailed login history'].map(f => (
            <div key={f} className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground flex items-center gap-1.5"><History className="w-3 h-3" />{f}</span>
              <span className="px-1.5 py-0.5 rounded bg-foreground/5 border border-border text-muted-foreground">Coming soon</span>
            </div>
          ))}
        </div>
      </SectionCard>
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
function NotificationsTab({ prefs, onSave, saving }: { prefs: Record<string, boolean>; onSave: (p: Record<string, boolean>) => void; saving: boolean }) {
  const [local, setLocal] = useState(prefs)
  useEffect(() => setLocal(prefs), [prefs])
  const dirty = JSON.stringify(local) !== JSON.stringify(prefs)

  return (
    <SectionCard title="Notifications" icon={Bell}>
      {Object.keys(NOTIF_LABELS).map(key => (
        <div key={key} className="flex items-center justify-between py-1.5">
          <p className="text-foreground/85 text-sm">{NOTIF_LABELS[key]}</p>
          <Toggle checked={local[key] ?? false} onChange={v => setLocal({ ...local, [key]: v })} />
        </div>
      ))}
      {dirty && (
        <button onClick={() => onSave(local)} disabled={saving}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-500/20 border border-indigo-500/30 text-indigo-400 text-sm hover:bg-indigo-500/30 disabled:opacity-50">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save Changes
        </button>
      )}
    </SectionCard>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
function AIPreferencesTab({ prefs, onSave, saving }: { prefs: { provider: string; tone: string }; onSave: (p: any) => void; saving: boolean }) {
  const [provider, setProvider] = useState(prefs.provider)
  const [tone, setTone] = useState(prefs.tone)
  useEffect(() => { setProvider(prefs.provider); setTone(prefs.tone) }, [prefs])
  const dirty = provider !== prefs.provider || tone !== prefs.tone

  return (
    <SectionCard title="AI Preferences" icon={Sparkles}>
      <div>
        <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Preferred AI Provider</p>
        <div className="flex flex-wrap gap-2">
          {['groq', 'openrouter', 'gemini', 'claude', 'openai'].map(p => (
            <button key={p} onClick={() => setProvider(p)}
              className={cn('px-3 py-1.5 rounded-xl text-xs border capitalize',
                provider === p ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-300' : 'border-border text-muted-foreground hover:text-foreground/85')}>
              {p}
            </button>
          ))}
        </div>
        <p className="text-[10px] text-muted-foreground mt-1.5">HireFlow currently runs on Groq under the hood — other providers are on the roadmap.</p>
      </div>
      <div>
        <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Writing Tone</p>
        <div className="flex flex-wrap gap-2">
          {['formal', 'friendly', 'corporate', 'startup'].map(t => (
            <button key={t} onClick={() => setTone(t)}
              className={cn('px-3 py-1.5 rounded-xl text-xs border capitalize',
                tone === t ? 'bg-purple-500/20 border-purple-500/40 text-purple-300' : 'border-border text-muted-foreground hover:text-foreground/85')}>
              {t}
            </button>
          ))}
        </div>
        <p className="text-[10px] text-muted-foreground mt-1.5">Used when generating application emails and cover letters.</p>
      </div>
      {dirty && (
        <button onClick={() => onSave({ provider, tone })} disabled={saving}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-500/20 border border-indigo-500/30 text-indigo-400 text-sm hover:bg-indigo-500/30 disabled:opacity-50">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save Changes
        </button>
      )}
    </SectionCard>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
function ApplyPreferencesTab({ prefs, onSave, saving }: { prefs: Settings['apply_preferences']; onSave: (p: any) => void; saving: boolean }) {
  const [local, setLocal] = useState(prefs)
  useEffect(() => setLocal(prefs), [prefs])
  const dirty = JSON.stringify(local) !== JSON.stringify(prefs)

  return (
    <SectionCard title="Apply Preferences" icon={Zap}>
      <div className="flex items-center justify-between p-3 rounded-xl bg-purple-500/8 border border-purple-500/20">
        <div>
          <p className="text-foreground/85 text-sm font-medium">Auto Apply</p>
          <p className="text-muted-foreground text-xs mt-0.5">Automatically send applications for jobs above your minimum match score</p>
        </div>
        <Toggle checked={local.auto_apply} onChange={v => setLocal({ ...local, auto_apply: v })} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground uppercase tracking-wider">Only above match score</label>
          <div className="flex items-center gap-2">
            <input type="range" min={50} max={100} value={local.min_match_score}
              onChange={e => setLocal({ ...local, min_match_score: Number(e.target.value) })} className="flex-1 accent-indigo-500" />
            <span className="text-sm text-foreground/80 w-10 text-right">{local.min_match_score}%</span>
          </div>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground uppercase tracking-wider">Daily send limit</label>
          <input type="number" min={1} max={450} value={local.daily_limit}
            onChange={e => setLocal({ ...local, daily_limit: Number(e.target.value) })}
            className="w-full glass rounded-xl px-3 py-2 text-sm text-foreground/80 border border-border focus:border-indigo-500/40 focus:outline-none" />
        </div>
      </div>

      <div className="space-y-2 pt-2 border-t border-border">
        {[
          ['skip_duplicate', 'Skip Duplicate', 'Never re-apply to a job you already applied to'],
          ['skip_no_contact', 'Skip Without Contact', 'Skip jobs with no email, form, or apply link'],
          ['skip_low_match', 'Skip Low Match', 'Skip jobs below your minimum match score'],
        ].map(([key, label, desc]) => (
          <div key={key} className="flex items-center justify-between py-1">
            <div>
              <p className="text-foreground/80 text-sm">{label}</p>
              <p className="text-muted-foreground text-xs">{desc}</p>
            </div>
            <Toggle checked={(local as any)[key]} onChange={v => setLocal({ ...local, [key]: v })} />
          </div>
        ))}
      </div>

      {dirty && (
        <button onClick={() => onSave(local)} disabled={saving}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-500/20 border border-indigo-500/30 text-indigo-400 text-sm hover:bg-indigo-500/30 disabled:opacity-50">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save Changes
        </button>
      )}
    </SectionCard>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
function AppearanceTab({ prefs, onSave, saving }: { prefs: Settings['appearance_prefs']; onSave: (p: any) => void; saving: boolean }) {
  const { toggleTheme, theme } = useAppStore()
  const [local, setLocal] = useState(prefs)
  useEffect(() => setLocal(prefs), [prefs])
  const dirty = JSON.stringify(local) !== JSON.stringify(prefs)

  function saveAndSync() {
    onSave(local)
    if (local.theme !== theme && (local.theme === 'dark' || local.theme === 'light')) toggleTheme()
  }

  return (
    <SectionCard title="Appearance" icon={Palette}>
      <div>
        <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Theme</p>
        <div className="flex gap-2">
          {['dark', 'oled', 'light'].map(t => (
            <button key={t} onClick={() => setLocal({ ...local, theme: t })}
              className={cn('flex-1 px-3 py-2.5 rounded-xl text-xs border capitalize',
                local.theme === t ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-300' : 'border-border text-muted-foreground hover:text-foreground/85')}>
              {t === 'oled' ? 'OLED Black' : t}
            </button>
          ))}
        </div>
      </div>
      <div>
        <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Accent Color</p>
        <div className="flex gap-2">
          {[['purple', '#a855f7'], ['blue', '#6366f1'], ['green', '#10b981']].map(([name, color]) => (
            <button key={name} onClick={() => setLocal({ ...local, accent: name })}
              className={cn('w-9 h-9 rounded-xl border-2 flex items-center justify-center', local.accent === name ? 'border-foreground' : 'border-transparent')}
              style={{ background: color }} />
          ))}
        </div>
      </div>
      <div className="flex items-center justify-between py-1">
        <p className="text-foreground/80 text-sm">Animations</p>
        <Toggle checked={local.animations} onChange={v => setLocal({ ...local, animations: v })} />
      </div>
      <div className="flex items-center justify-between py-1">
        <p className="text-foreground/80 text-sm">Compact Mode</p>
        <Toggle checked={local.compact_mode} onChange={v => setLocal({ ...local, compact_mode: v })} />
      </div>
      {dirty && (
        <button onClick={saveAndSync} disabled={saving}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-500/20 border border-indigo-500/30 text-indigo-400 text-sm hover:bg-indigo-500/30 disabled:opacity-50">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save Changes
        </button>
      )}
    </SectionCard>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
function PrivacyTab({ onLogout }: { onLogout: () => void }) {
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [password, setPassword] = useState('')

  const clearAi = useMutation({
    mutationFn: async () => (await api.post('/api/users/me/clear-ai-history')).data,
    onSuccess: (d) => toast.success(`Cleared ${d.cleared_jobs} cached AI analyses`),
    onError: () => toast.error('Failed to clear AI history'),
  })

  async function downloadData() {
    try {
      const { data } = await api.get('/api/users/me/export-data')
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = 'hireflow-data-export.json'; a.click()
      URL.revokeObjectURL(url)
      toast.success('Data exported')
    } catch {
      toast.error('Export failed')
    }
  }

  const deleteAccount = useMutation({
    mutationFn: async () => (await api.post('/api/users/me/delete-account', { password })).data,
    onSuccess: () => { toast.success('Account deleted'); onLogout() },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Deletion failed'),
  })

  return (
    <>
      <SectionCard title="Your Data" icon={Globe2}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-foreground/80 text-sm">Clear AI history</p>
            <p className="text-muted-foreground text-xs mt-0.5">Wipes cached career insights and job AI analyses. Scores and matches are unaffected.</p>
          </div>
          <button onClick={() => clearAi.mutate()} disabled={clearAi.isPending}
            className="flex items-center gap-2 px-3 py-2 rounded-xl border border-border text-muted-foreground text-xs hover:text-foreground hover:border-accent/30 disabled:opacity-50 shrink-0">
            {clearAi.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />} Clear
          </button>
        </div>
        <div className="flex items-center justify-between pt-3 border-t border-border">
          <div>
            <p className="text-foreground/80 text-sm">Download your data</p>
            <p className="text-muted-foreground text-xs mt-0.5">Export every job, resume, application and activity record as JSON</p>
          </div>
          <button onClick={downloadData}
            className="flex items-center gap-2 px-3 py-2 rounded-xl border border-border text-muted-foreground text-xs hover:text-foreground hover:border-accent/30 shrink-0">
            <Download className="w-3.5 h-3.5" /> Export
          </button>
        </div>
      </SectionCard>

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="glass rounded-2xl border border-red-500/20 p-5">
        <h2 className="text-red-400 font-medium text-sm flex items-center gap-2 mb-4"><AlertTriangle className="w-4 h-4" /> Danger Zone</h2>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-foreground/80 text-sm">Delete account</p>
            <p className="text-muted-foreground text-xs mt-0.5">Permanently delete your account and all associated data. This cannot be undone.</p>
          </div>
          <button onClick={() => setConfirmOpen(true)} className="px-4 py-2 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm hover:bg-red-500/20 shrink-0">
            Delete Account
          </button>
        </div>

        {confirmOpen && (
          <div className="mt-4 pt-4 border-t border-red-500/15 space-y-3">
            <p className="text-xs text-red-300/80">Enter your password to confirm permanent deletion.</p>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Your password"
              className="w-full max-w-xs glass rounded-xl px-3 py-2 text-sm text-foreground/80 placeholder:text-muted-foreground border border-red-500/25 focus:outline-none" />
            <div className="flex gap-2">
              <button onClick={() => deleteAccount.mutate()} disabled={!password || deleteAccount.isPending}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-danger hover:bg-danger/90 text-white text-xs font-medium disabled:opacity-40">
                {deleteAccount.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />} Permanently Delete
              </button>
              <button onClick={() => { setConfirmOpen(false); setPassword('') }} className="px-4 py-2 rounded-xl border border-border text-muted-foreground text-xs hover:text-foreground">
                Cancel
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </>
  )
}
