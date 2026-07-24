import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ShieldCheck, Search, CheckCircle, XCircle, GitMerge, Trash2, Pencil,
  ChevronDown, ChevronLeft, ChevronRight, AlertTriangle, X, Save, RefreshCw,
} from 'lucide-react'
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { cn } from '@/lib/utils'
import api from '@/lib/api'
import toast from 'react-hot-toast'

interface ReviewJob {
  id: string; title: string; company: string; location: string; location_type: string
  skills: string[]; contact_email: string | null; contact_phone: string | null
  apply_link: string | null; salary: string | null; employment_type: string | null
  experience_min: number; experience_max: number
  match_score: number | null; match_tier: string | null
  confidence_score: number | null; application_type: string | null
  review_status: string; import_session_id: string | null
  duplicate_reason: string | null; validation_warnings: string[]
  missing_fields: string[]; source: string | null; description: string | null
}

interface ReviewResponse {
  items: ReviewJob[]; total: number; limit: number; offset: number
  counts: Record<string, number>
}

const TABS = [
  { id: 'pending', label: 'Pending' },
  { id: 'approved', label: 'Approved' },
  { id: 'rejected', label: 'Rejected' },
  { id: 'merged', label: 'Merged' },
  { id: 'duplicates', label: 'Duplicates' },
  { id: 'low_confidence', label: 'Low Confidence' },
]

const APP_TYPE_STYLE: Record<string, string> = {
  email: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/25',
  google_form: 'text-purple-400 bg-purple-500/10 border-purple-500/25',
  linkedin: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/25',
  portal: 'text-blue-400 bg-blue-500/10 border-blue-500/25',
  phone: 'text-amber-400 bg-amber-500/10 border-amber-500/25',
  none: 'text-red-400 bg-red-500/10 border-red-500/25',
}

function confColor(c: number | null) {
  const v = c ?? 0
  return v >= 80 ? 'text-emerald-400' : v >= 65 ? 'text-yellow-400' : 'text-red-400'
}

const PAGE_SIZE = 20

export default function ReviewPanel() {
  const qc = useQueryClient()
  const [tab, setTab] = useState('pending')
  const [q, setQ] = useState('')
  const [appType, setAppType] = useState('')
  const [offset, setOffset] = useState(0)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [expanded, setExpanded] = useState<string | null>(null)
  const [editing, setEditing] = useState<ReviewJob | null>(null)

  const { data, isLoading, isFetching } = useQuery<ReviewResponse>({
    queryKey: ['review-jobs', tab, q, appType, offset],
    queryFn: async () => {
      const params = new URLSearchParams({ tab, limit: String(PAGE_SIZE), offset: String(offset) })
      if (q.trim()) params.set('q', q.trim())
      if (appType) params.set('application_type', appType)
      return (await api.get(`/api/review/jobs?${params}`)).data
    },
    placeholderData: keepPreviousData,
  })

  const bulkMutation = useMutation({
    mutationFn: async ({ ids, action }: { ids: string[]; action: string }) =>
      (await api.post('/api/review/bulk', { job_ids: ids, action })).data,
    onSuccess: (res) => {
      toast.success(
        res.action === 'merge' ? `Merged ${res.merged} duplicate(s) into one job`
        : `${res.updated} job(s) ${res.action === 'delete' ? 'deleted' : res.action + 'd'}`
      )
      setSelected(new Set())
      qc.invalidateQueries({ queryKey: ['review-jobs'] })
      qc.invalidateQueries({ queryKey: ['jobs'] })
    },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Action failed'),
  })

  const editMutation = useMutation({
    mutationFn: async (j: ReviewJob) => (await api.patch(`/api/review/jobs/${j.id}`, {
      title: j.title, company: j.company, location: j.location,
      contact_email: j.contact_email || undefined, apply_link: j.apply_link || undefined,
      salary: j.salary || undefined,
    })).data,
    onSuccess: () => {
      toast.success('Job updated')
      setEditing(null)
      qc.invalidateQueries({ queryKey: ['review-jobs'] })
    },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Update failed'),
  })

  const items = data?.items ?? []
  const counts = data?.counts ?? {}
  const total = data?.total ?? 0
  const page = Math.floor(offset / PAGE_SIZE) + 1
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const allChecked = items.length > 0 && items.every(j => selected.has(j.id))

  function toggleAll() {
    setSelected(allChecked ? new Set() : new Set(items.map(j => j.id)))
  }
  function toggle(id: string) {
    const next = new Set(selected)
    next.has(id) ? next.delete(id) : next.add(id)
    setSelected(next)
  }
  function switchTab(t: string) {
    setTab(t); setOffset(0); setSelected(new Set())
  }

  return (
    <div className="w-full space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-indigo-400" /> Import Review
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Imported jobs go live only after approval — review quality, contacts and duplicates here
          </p>
        </div>
        {isFetching && <RefreshCw className="w-4 h-4 text-muted-foreground animate-spin" />}
      </div>

      {/* Tabs with live counts */}
      <div className="flex flex-wrap gap-1.5">
        {TABS.map(t => (
          <button key={t.id} onClick={() => switchTab(t.id)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs border transition-all',
              tab === t.id
                ? 'bg-indigo-500/25 text-indigo-300 border-indigo-500/40'
                : 'glass text-muted-foreground border-border hover:text-foreground/85 hover:border-accent/30'
            )}>
            {t.label}
            <span className={cn('px-1.5 py-0.5 rounded-full text-[10px] font-bold',
              tab === t.id ? 'bg-indigo-500/30 text-indigo-200' : 'bg-foreground/5 text-muted-foreground')}>
              {counts[t.id] ?? 0}
            </span>
          </button>
        ))}
      </div>

      {/* Search + filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
          <input value={q} onChange={e => { setQ(e.target.value); setOffset(0) }}
            placeholder="Search title or company…"
            className="w-full glass rounded-xl pl-9 pr-3 py-2.5 text-sm text-foreground/85 placeholder:text-muted-foreground border border-border focus:border-indigo-500/40 focus:outline-none" />
        </div>
        <select value={appType} onChange={e => { setAppType(e.target.value); setOffset(0) }}
          className="glass rounded-xl px-3 py-2.5 text-sm text-muted-foreground border border-border focus:border-indigo-500/40 focus:outline-none">
          <option value="" className="bg-card">All apply types</option>
          {['email', 'google_form', 'linkedin', 'portal', 'phone', 'none'].map(t => (
            <option key={t} value={t} className="bg-card">{t.replace('_', ' ')}</option>
          ))}
        </select>
      </div>

      {/* Bulk action bar */}
      <AnimatePresence>
        {selected.size > 0 && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            className="glass rounded-xl border border-indigo-500/30 px-4 py-2.5 flex flex-wrap items-center gap-2">
            <span className="text-sm text-foreground/80 font-medium mr-2">{selected.size} selected</span>
            <button onClick={() => bulkMutation.mutate({ ids: [...selected], action: 'approve' })}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium">
              <CheckCircle className="w-3 h-3" /> Approve
            </button>
            <button onClick={() => bulkMutation.mutate({ ids: [...selected], action: 'reject' })}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-red-500/30 text-red-400 text-xs hover:bg-red-500/10">
              <XCircle className="w-3 h-3" /> Reject
            </button>
            <button onClick={() => bulkMutation.mutate({ ids: [...selected], action: 'merge' })}
              disabled={selected.size < 2}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-purple-500/30 text-purple-400 text-xs hover:bg-purple-500/10 disabled:opacity-40">
              <GitMerge className="w-3 h-3" /> Merge into one
            </button>
            <button onClick={() => { if (confirm(`Delete ${selected.size} job(s) permanently?`)) bulkMutation.mutate({ ids: [...selected], action: 'delete' }) }}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-border text-muted-foreground text-xs hover:text-red-400 hover:border-red-500/25">
              <Trash2 className="w-3 h-3" /> Delete
            </button>
            <button onClick={() => setSelected(new Set())} className="ml-auto text-xs text-muted-foreground hover:text-foreground/80">Clear</button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Job list */}
      <div className="glass rounded-2xl border border-border overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border text-[11px] text-muted-foreground uppercase tracking-wider">
          <input type="checkbox" checked={allChecked} onChange={toggleAll} className="accent-indigo-500" />
          <span className="flex-1">Job</span>
          <span className="w-20 text-center">Confidence</span>
          <span className="w-16 text-center">Match</span>
          <span className="w-24 text-center hidden md:block">Apply Via</span>
          <span className="w-28 text-right">Actions</span>
        </div>

        {isLoading ? (
          <div className="p-10 text-center text-muted-foreground text-sm">Loading review queue…</div>
        ) : items.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground text-sm">
            <ShieldCheck className="w-9 h-9 mx-auto mb-3 text-muted-foreground/50" />
            Nothing in “{TABS.find(t => t.id === tab)?.label}”
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {items.map((j, i) => (
              <motion.div key={j.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.02 }}>
                <div className="flex items-center gap-3 px-4 py-3 hover:bg-foreground/[0.02]">
                  <input type="checkbox" checked={selected.has(j.id)} onChange={() => toggle(j.id)} className="accent-indigo-500" />
                  <button onClick={() => setExpanded(expanded === j.id ? null : j.id)} className="flex-1 min-w-0 text-left">
                    <div className="flex items-center gap-2">
                      <p className="text-foreground/85 text-sm font-medium truncate">{j.title}</p>
                      <span className="text-muted-foreground text-xs truncate">· {j.company}</span>
                      <ChevronDown className={cn('w-3 h-3 text-muted-foreground shrink-0 transition-transform', expanded === j.id && 'rotate-180')} />
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 mt-1">
                      {j.location && <span className="text-[10px] text-muted-foreground">{j.location}</span>}
                      {j.missing_fields.map(f => (
                        <span key={f} className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400/90 border border-amber-500/20">
                          no {f}
                        </span>
                      ))}
                      {j.duplicate_reason && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20 truncate max-w-[240px]">
                          {j.duplicate_reason}
                        </span>
                      )}
                      {j.validation_warnings.map((w, wi) => (
                        <span key={wi} className="text-[9px] px-1.5 py-0.5 rounded bg-foreground/5 text-muted-foreground border border-border truncate max-w-[220px]">
                          <AlertTriangle className="w-2.5 h-2.5 inline mr-0.5 text-amber-400/70" />{w}
                        </span>
                      ))}
                    </div>
                  </button>
                  <span className={cn('w-20 text-center text-sm font-bold tabular-nums', confColor(j.confidence_score))}>
                    {j.confidence_score ?? '—'}%
                  </span>
                  <span className="w-16 text-center text-sm text-muted-foreground tabular-nums">{Math.round(j.match_score ?? 0)}%</span>
                  <span className="w-24 text-center hidden md:block">
                    {j.application_type && (
                      <span className={cn('text-[9px] px-1.5 py-0.5 rounded-full border', APP_TYPE_STYLE[j.application_type] ?? '')}>
                        {j.application_type.replace('_', ' ')}
                      </span>
                    )}
                  </span>
                  <div className="w-28 flex items-center justify-end gap-1">
                    {j.review_status === 'pending_review' && (
                      <>
                        <button title="Approve" onClick={() => bulkMutation.mutate({ ids: [j.id], action: 'approve' })}
                          className="p-1.5 rounded-lg text-emerald-400/70 hover:text-emerald-300 hover:bg-emerald-500/10">
                          <CheckCircle className="w-4 h-4" />
                        </button>
                        <button title="Reject" onClick={() => bulkMutation.mutate({ ids: [j.id], action: 'reject' })}
                          className="p-1.5 rounded-lg text-red-400/60 hover:text-red-300 hover:bg-red-500/10">
                          <XCircle className="w-4 h-4" />
                        </button>
                      </>
                    )}
                    <button title="Edit" onClick={() => setEditing({ ...j })}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground/85 hover:bg-foreground/5">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Preview expand */}
                <AnimatePresence>
                  {expanded === j.id && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden bg-foreground/[0.015] border-t border-border">
                      <div className="px-11 py-3 grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-1.5 text-xs">
                        <p className="text-muted-foreground"><span className="text-muted-foreground">Contact:</span> {j.contact_email || j.contact_phone || '—'}</p>
                        <p className="text-muted-foreground truncate"><span className="text-muted-foreground">Apply link:</span> {j.apply_link || '—'}</p>
                        <p className="text-muted-foreground"><span className="text-muted-foreground">Experience:</span> {j.experience_min}–{j.experience_max} yrs · <span className="text-muted-foreground">Salary:</span> {j.salary || '—'}</p>
                        <p className="text-muted-foreground"><span className="text-muted-foreground">Session:</span> {j.import_session_id?.slice(0, 8) || 'manual'} · <span className="text-muted-foreground">Source:</span> {j.source || '—'}</p>
                        <p className="text-muted-foreground md:col-span-2"><span className="text-muted-foreground">Skills:</span> {j.skills.join(', ') || '—'}</p>
                        {j.description && <p className="text-muted-foreground md:col-span-2 leading-relaxed">{j.description}</p>}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {total > PAGE_SIZE && (
          <div className="flex items-center justify-between px-4 py-2.5 border-t border-border text-xs text-muted-foreground">
            <span>{total} jobs · page {page} of {pages}</span>
            <div className="flex gap-1">
              <button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                className="p-1.5 rounded-lg border border-border hover:border-accent/30 disabled:opacity-30">
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <button disabled={offset + PAGE_SIZE >= total} onClick={() => setOffset(offset + PAGE_SIZE)}
                className="p-1.5 rounded-lg border border-border hover:border-accent/30 disabled:opacity-30">
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Edit modal */}
      <AnimatePresence>
        {editing && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(10px)' }}
            onClick={() => setEditing(null)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="glass rounded-2xl border border-border w-full max-w-lg p-5 space-y-3"
              onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between">
                <h3 className="text-foreground font-semibold text-sm">Edit Job</h3>
                <button onClick={() => setEditing(null)} className="p-1 text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
              </div>
              {([['title', 'Title'], ['company', 'Company'], ['location', 'Location'],
                 ['contact_email', 'Contact Email'], ['apply_link', 'Apply Link'], ['salary', 'Salary']] as const
              ).map(([key, label]) => (
                <div key={key} className="space-y-1">
                  <label className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</label>
                  <input value={(editing as any)[key] ?? ''}
                    onChange={e => setEditing({ ...editing, [key]: e.target.value })}
                    className="w-full glass rounded-lg px-3 py-2 text-sm text-foreground/85 border border-border focus:border-indigo-500/40 focus:outline-none" />
                </div>
              ))}
              <button onClick={() => editMutation.mutate(editing)} disabled={editMutation.isPending}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium disabled:opacity-50">
                <Save className="w-4 h-4" /> {editMutation.isPending ? 'Saving…' : 'Save Changes'}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
