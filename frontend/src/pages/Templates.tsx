import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { FileCode2, Plus, Trash2, Star, Sparkles, Paperclip, X, Save } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { cn } from '@/lib/utils'
import { LoadingCards } from '@/components/ui/EmptyState'
import api from '@/lib/api'
import toast from 'react-hot-toast'

interface Tpl {
  id: string
  name: string
  category: string
  subject: string
  body: string
  is_default?: boolean
  ai_personalization?: boolean
  attachments?: Record<string, boolean>
  times_used?: number
  success_count?: number
}

const CATEGORIES = [
  'All', 'Resume Submission', 'Cold Outreach', 'Referral Request', 'Follow-up',
  'Internship', 'Fresher', 'Experienced', 'Remote', 'Startup', 'MNC',
  'Recruiter Reply', 'Thank You', 'Interview Follow-up', 'Negotiation', 'Networking',
]

const CAT_COLORS = [
  'text-indigo-400 bg-indigo-500/10 border-indigo-500/20',
  'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
  'text-purple-400 bg-purple-500/10 border-purple-500/20',
  'text-amber-400 bg-amber-500/10 border-amber-500/20',
  'text-rose-400 bg-rose-500/10 border-rose-500/20',
  'text-blue-400 bg-blue-500/10 border-blue-500/20',
]
const catColor = (c: string) => CAT_COLORS[Math.abs([...c].reduce((a, ch) => a + ch.charCodeAt(0), 0)) % CAT_COLORS.length]

const VARIABLES = [
  'name', 'email', 'phone', 'role', 'company', 'location', 'skills', 'matched_skills',
  'missing_skills', 'experience', 'portfolio', 'github', 'linkedin', 'resume',
  'current_role', 'today', 'job_summary', 'match_score', 'recruiter_name', 'career_goal',
]

const ATTACH_KEYS = ['resume', 'portfolio', 'github', 'linkedin', 'cover_letter'] as const

function successRate(t: Tpl): number | null {
  if (!t.times_used) return null
  return Math.round(((t.success_count || 0) / t.times_used) * 100)
}

function stars(t: Tpl): number {
  const rate = successRate(t)
  if (rate == null) return 4
  return Math.max(1, Math.min(5, Math.round(rate / 20)))
}

export default function Templates() {
  const qc = useQueryClient()
  const [category, setCategory] = useState('All')
  const [editing, setEditing] = useState<Tpl | null>(null)
  const [isNew, setIsNew] = useState(false)

  const { data: templates = [], isLoading } = useQuery<Tpl[]>({
    queryKey: ['templates'],
    queryFn: async () => (await api.get('/api/templates/')).data,
  })

  const saveMutation = useMutation({
    mutationFn: async (t: Tpl) => {
      const payload = {
        name: t.name, category: t.category, subject: t.subject, body: t.body,
        ai_personalization: t.ai_personalization ?? true, attachments: t.attachments ?? {},
      }
      if (isNew) return (await api.post('/api/templates/', payload)).data
      return (await api.patch(`/api/templates/${t.id}`, payload)).data
    },
    onSuccess: () => {
      toast.success(isNew ? 'Template created' : 'Template saved')
      setEditing(null)
      qc.invalidateQueries({ queryKey: ['templates'] })
    },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Save failed'),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => api.delete(`/api/templates/${id}`),
    onSuccess: () => {
      toast.success('Template deleted')
      setEditing(null)
      qc.invalidateQueries({ queryKey: ['templates'] })
    },
  })

  const filtered = category === 'All' ? templates : templates.filter(t => t.category === category)

  function openNew() {
    setIsNew(true)
    setEditing({
      id: '', name: '', category: 'Resume Submission',
      subject: 'Application for {{role}} at {{company}} — {{name}}',
      body: 'Dear Hiring Team,\n\n\n',
      ai_personalization: true,
      attachments: { resume: true, portfolio: true, github: true, linkedin: true, cover_letter: false },
    })
  }

  return (
    <div className="w-full space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Email Template Library</h1>
          <p className="text-white/40 text-sm mt-0.5">
            AI-dynamic templates with {'{{variables}}'} — the Application Agent picks and personalizes them per job
          </p>
        </div>
        <button onClick={openNew}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-500/20 border border-indigo-500/30 text-indigo-400 text-sm hover:bg-indigo-500/30 transition-colors">
          <Plus className="w-4 h-4" /> New Template
        </button>
      </div>

      {/* Category chips */}
      <div className="flex flex-wrap gap-1.5">
        {CATEGORIES.map(c => (
          <button key={c} onClick={() => setCategory(c)}
            className={cn(
              'px-3 py-1.5 rounded-full text-xs border transition-all',
              category === c
                ? 'bg-indigo-500/25 text-indigo-300 border-indigo-500/40'
                : 'glass text-white/45 border-white/10 hover:text-white/80 hover:border-white/25'
            )}>
            {c}
          </button>
        ))}
      </div>

      {/* Template cards */}
      {isLoading ? (
        <LoadingCards count={6} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((t, i) => {
            const rate = successRate(t)
            return (
              <motion.button
                key={t.id}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                onClick={() => { setIsNew(false); setEditing({ ...t, attachments: { ...(t.attachments ?? {}) } }) }}
                className="glass rounded-2xl border border-white/10 p-4 text-left hover:border-indigo-500/40 transition-all group"
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h3 className="text-white font-semibold text-sm group-hover:text-indigo-300 transition-colors truncate">{t.name}</h3>
                  <div className="flex shrink-0">
                    {[...Array(5)].map((_, s) => (
                      <Star key={s} className={cn('w-3 h-3', s < stars(t) ? 'text-yellow-400 fill-yellow-400' : 'text-white/15')} />
                    ))}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 mb-3">
                  <span className={cn('text-[10px] px-2 py-0.5 rounded-full border', catColor(t.category))}>{t.category}</span>
                  {t.is_default && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full border bg-white/5 text-white/40 border-white/15">Default</span>
                  )}
                  {t.ai_personalization && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full border bg-purple-500/10 text-purple-400 border-purple-500/25 flex items-center gap-1">
                      <Sparkles className="w-2.5 h-2.5" /> AI
                    </span>
                  )}
                </div>
                <p className="text-white/35 text-xs line-clamp-2 mb-3 whitespace-pre-line">{t.body}</p>
                <div className="flex items-center justify-between text-[11px] text-white/40 border-t border-white/5 pt-2">
                  <span>Used <span className="text-white/70 font-medium">{t.times_used ?? 0}</span> times</span>
                  <span>Success <span className={cn('font-medium', rate == null ? 'text-white/30' : rate >= 50 ? 'text-emerald-400' : 'text-yellow-400')}>
                    {rate == null ? '—' : `${rate}%`}
                  </span></span>
                </div>
              </motion.button>
            )
          })}
          {filtered.length === 0 && (
            <div className="col-span-full text-center py-16 text-white/25 text-sm">
              <FileCode2 className="w-10 h-10 mx-auto mb-3 text-white/15" />
              No templates in this category yet
            </div>
          )}
        </div>
      )}

      {/* Template Editor */}
      <AnimatePresence>
        {editing && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(10px)' }}
            onClick={() => setEditing(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="glass rounded-2xl border border-white/15 w-full max-w-3xl max-h-[90vh] overflow-y-auto"
              onClick={e => e.stopPropagation()}
            >
              <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-4 border-b border-white/10 bg-[#0d1424]/90 backdrop-blur-xl">
                <h3 className="text-white font-semibold text-sm">{isNew ? 'New Template' : 'Edit Template'}</h3>
                <button onClick={() => setEditing(null)} className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/5">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-5 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs text-white/40 uppercase tracking-wider">Name</label>
                    <input value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })}
                      className="w-full glass rounded-xl px-3 py-2.5 text-sm text-white/80 border border-white/10 focus:border-indigo-500/40 focus:outline-none" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs text-white/40 uppercase tracking-wider">Category</label>
                    <select value={editing.category} onChange={e => setEditing({ ...editing, category: e.target.value })}
                      className="w-full glass rounded-xl px-3 py-2.5 text-sm text-white/70 border border-white/10 focus:border-indigo-500/40 focus:outline-none">
                      {CATEGORIES.filter(c => c !== 'All').map(c => <option key={c} value={c} className="bg-[#0f1829]">{c}</option>)}
                    </select>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs text-white/40 uppercase tracking-wider">Subject</label>
                  <input value={editing.subject} onChange={e => setEditing({ ...editing, subject: e.target.value })}
                    className="w-full glass rounded-xl px-3 py-2.5 text-sm text-white/80 border border-white/10 focus:border-indigo-500/40 focus:outline-none font-mono" />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs text-white/40 uppercase tracking-wider">Body</label>
                  <textarea value={editing.body} onChange={e => setEditing({ ...editing, body: e.target.value })} rows={9}
                    className="w-full glass rounded-xl px-3 py-2.5 text-sm text-white/80 border border-white/10 focus:border-indigo-500/40 focus:outline-none font-mono leading-relaxed resize-y" />
                </div>

                {/* Variable palette */}
                <div>
                  <p className="text-xs text-white/40 uppercase tracking-wider mb-2">Variables — click to insert</p>
                  <div className="flex flex-wrap gap-1.5">
                    {VARIABLES.map(v => (
                      <button key={v}
                        onClick={() => setEditing({ ...editing, body: editing.body + `{{${v}}}` })}
                        className="text-[10px] px-2 py-1 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 hover:bg-indigo-500/20 transition-colors font-mono">
                        {'{{'}{v}{'}}'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* AI toggle + attachments */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <button
                    onClick={() => setEditing({ ...editing, ai_personalization: !editing.ai_personalization })}
                    className={cn(
                      'flex items-center justify-between px-4 py-3 rounded-xl border transition-all',
                      editing.ai_personalization
                        ? 'bg-purple-500/15 border-purple-500/30'
                        : 'glass border-white/10'
                    )}>
                    <span className="flex items-center gap-2 text-sm text-white/80">
                      <Sparkles className={cn('w-4 h-4', editing.ai_personalization ? 'text-purple-400' : 'text-white/30')} />
                      AI Personalization
                    </span>
                    <span className={cn('text-xs font-bold', editing.ai_personalization ? 'text-purple-400' : 'text-white/30')}>
                      {editing.ai_personalization ? 'ON' : 'OFF'}
                    </span>
                  </button>
                  <div className="glass rounded-xl border border-white/10 px-4 py-3">
                    <p className="text-xs text-white/40 mb-2 flex items-center gap-1.5"><Paperclip className="w-3 h-3" /> Attachment Rules</p>
                    <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                      {ATTACH_KEYS.map(k => (
                        <label key={k} className="flex items-center gap-1.5 text-xs text-white/60 cursor-pointer">
                          <input type="checkbox"
                            checked={editing.attachments?.[k] ?? false}
                            onChange={e => setEditing({ ...editing, attachments: { ...(editing.attachments ?? {}), [k]: e.target.checked } })}
                            className="accent-indigo-500" />
                          {k.replace('_', ' ')}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 pt-1">
                  <button
                    onClick={() => saveMutation.mutate(editing)}
                    disabled={saveMutation.isPending || !editing.name || !editing.subject}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-500/20 border border-indigo-500/30 text-sm text-indigo-400 hover:bg-indigo-500/30 transition-all disabled:opacity-50">
                    <Save className="w-4 h-4" /> {saveMutation.isPending ? 'Saving…' : 'Save Template'}
                  </button>
                  {!isNew && (
                    <button
                      onClick={() => deleteMutation.mutate(editing.id)}
                      className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-red-500/25 text-sm text-red-400/80 hover:bg-red-500/10 transition-all">
                      <Trash2 className="w-4 h-4" /> Delete
                    </button>
                  )}
                  <p className="ml-auto text-[11px] text-white/25">AI only rewrites the body — subject & signature stay yours</p>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
