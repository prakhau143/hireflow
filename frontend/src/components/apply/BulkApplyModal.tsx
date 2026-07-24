import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Send, Sparkles, RefreshCw, Mail, FileText, CheckCircle, AlertTriangle } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { cn } from '@/lib/utils'
import api from '@/lib/api'
import toast from 'react-hot-toast'

interface Package {
  job_id: string
  job_title: string
  company: string
  match_score: number
  to_email: string
  subject: string
  body: string
  template_id: string | null
  template_name: string | null
  resume_id: string | null
  resume_name: string | null
  reply_probability: number | null
  reply_reason: string | null
  follow_up_draft: string | null
  generated_by: 'ai' | 'rules'
}

interface PrepareResponse {
  packages: Package[]
  skipped: { job_id: string; title: string; reason: string; apply_link?: string | null; application_type?: string }[]
  quota: { daily_limit: number; sent_today: number; remaining: number }
}

/** AI Review + send flow for one or many selected jobs. */
export default function BulkApplyModal({ jobIds, onClose }: { jobIds: string[]; onClose: () => void }) {
  const qc = useQueryClient()
  const [edits, setEdits] = useState<Record<string, { subject: string; body: string }>>({})
  const [expanded, setExpanded] = useState<string | null>(null)

  const { data, isLoading, error } = useQuery<PrepareResponse>({
    queryKey: ['bulk-prepare', [...jobIds].sort().join(',')],
    queryFn: async () => (await api.post('/api/applications/prepare', { job_ids: jobIds })).data,
    staleTime: Infinity,
    retry: false,
  })

  const sendMutation = useMutation({
    mutationFn: async () => {
      const items = (data?.packages ?? []).map(p => ({
        job_id: p.job_id,
        to_email: p.to_email,
        subject: edits[p.job_id]?.subject ?? p.subject,
        body: edits[p.job_id]?.body ?? p.body,
        template_id: p.template_id,
        resume_id: p.resume_id,
        follow_up_draft: p.follow_up_draft,
        reply_probability: p.reply_probability,
        reply_reason: p.reply_reason,
      }))
      return (await api.post('/api/applications/send', { items, schedule: items.length > 1 })).data
    },
    onSuccess: (res) => {
      toast.success(`${res.queued} application${res.queued !== 1 ? 's' : ''} queued — ${res.pacing}`)
      qc.invalidateQueries({ queryKey: ['jobs'] })
      onClose()
    },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Send failed'),
  })

  const pkgs = data?.packages ?? []

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ background: 'rgba(0,0,0,0.78)', backdropFilter: 'blur(10px)' }}
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
          className="glass rounded-2xl border border-border w-full max-w-3xl max-h-[90vh] overflow-y-auto"
          onClick={e => e.stopPropagation()}
        >
          <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-4 border-b border-border bg-card/90 backdrop-blur-xl">
            <h3 className="text-foreground font-semibold text-sm flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-purple-400" />
              AI Application Review
              {data && (
                <span className="text-[10px] text-muted-foreground font-normal">
                  Quota today: {data.quota.sent_today}/{data.quota.daily_limit} · {data.quota.remaining} left
                </span>
              )}
            </h3>
            <button onClick={onClose} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-foreground/5">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-5 space-y-3">
            {isLoading && (
              <div className="py-14 text-center space-y-3">
                <RefreshCw className="w-6 h-6 text-purple-400 animate-spin mx-auto" />
                <p className="text-muted-foreground text-sm">AI Agent is preparing {jobIds.length} personalized application{jobIds.length !== 1 ? 's' : ''}…</p>
                <p className="text-muted-foreground/70 text-xs">Picking templates · selecting best resume · writing unique emails</p>
              </div>
            )}
            {!!error && (
              <p className="text-red-400 text-sm py-8 text-center">{(error as any).response?.data?.detail || 'Preparation failed'}</p>
            )}

            {(data?.skipped ?? []).map(s => (
              <div key={s.job_id} className="flex items-center gap-2 p-3 rounded-xl bg-amber-500/8 border border-amber-500/20 text-xs text-amber-300">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span className="flex-1">{s.title}: {s.reason}</span>
                {s.apply_link && (
                  <a href={s.apply_link} target="_blank" rel="noopener noreferrer"
                    className="shrink-0 px-2.5 py-1 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-200 hover:bg-amber-500/25 transition-colors">
                    Open link ↗
                  </a>
                )}
              </div>
            ))}

            {pkgs.map(p => {
              const e = edits[p.job_id] ?? { subject: p.subject, body: p.body }
              const open = expanded === p.job_id
              return (
                <div key={p.job_id} className="rounded-xl border border-border bg-foreground/[0.02] overflow-hidden">
                  <button onClick={() => setExpanded(open ? null : p.job_id)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-foreground/[0.03]">
                    <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-foreground/85 text-sm font-medium truncate">{p.job_title} · {p.company}</p>
                      <p className="text-muted-foreground text-[11px] truncate">
                        To {p.to_email} · Template: {p.template_name ?? 'auto'} · Resume: {p.resume_name ?? 'none'}
                        {p.generated_by === 'ai' && <span className="text-purple-400"> · AI personalized</span>}
                      </p>
                    </div>
                    {p.reply_probability != null && (
                      <div className="text-right shrink-0" title={p.reply_reason ?? ''}>
                        <p className={cn('text-sm font-bold', p.reply_probability >= 70 ? 'text-emerald-400' : p.reply_probability >= 45 ? 'text-yellow-400' : 'text-red-400')}>
                          {p.reply_probability}%
                        </p>
                        <p className="text-[9px] text-muted-foreground">reply chance</p>
                      </div>
                    )}
                  </button>
                  {open && (
                    <div className="px-4 pb-4 space-y-2 border-t border-border pt-3">
                      {p.reply_reason && <p className="text-[11px] text-muted-foreground italic">{p.reply_reason}</p>}
                      <input value={e.subject}
                        onChange={ev => setEdits({ ...edits, [p.job_id]: { ...e, subject: ev.target.value } })}
                        className="w-full glass rounded-lg px-3 py-2 text-xs text-foreground border border-border focus:border-indigo-500/40 focus:outline-none" />
                      <textarea value={e.body} rows={9}
                        onChange={ev => setEdits({ ...edits, [p.job_id]: { ...e, body: ev.target.value } })}
                        className="w-full glass rounded-lg px-3 py-2 text-xs text-foreground border border-border focus:border-indigo-500/40 focus:outline-none leading-relaxed resize-y" />
                      <p className="text-[10px] text-muted-foreground/70 flex items-center gap-1">
                        <FileText className="w-3 h-3" /> {p.resume_name ? `${p.resume_name} will be attached` : 'No resume on file — upload one in Resume Manager'}
                      </p>
                    </div>
                  )}
                </div>
              )
            })}

            {pkgs.length > 0 && (
              <button
                onClick={() => sendMutation.mutate()}
                disabled={sendMutation.isPending}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors disabled:opacity-50">
                {sendMutation.isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {sendMutation.isPending ? 'Queueing…'
                  : pkgs.length === 1 ? 'Send Application'
                  : `Send All ${pkgs.length} (staggered 2–4 min apart)`}
              </button>
            )}
            {!isLoading && pkgs.length === 0 && (data?.skipped?.length ?? 0) > 0 && (
              <p className="text-muted-foreground text-xs text-center flex items-center justify-center gap-1.5 py-2">
                <Mail className="w-3.5 h-3.5" /> Nothing sendable — all selected jobs were skipped
              </p>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
