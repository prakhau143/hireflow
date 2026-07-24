import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Mail, ArrowLeft, Save, RotateCcw, Send, Eye, Sparkles, KeyRound, BadgeCheck,
  CheckCircle2, AlertTriangle, CalendarClock, Trophy, CreditCard, Loader2,
} from 'lucide-react'
import api from '@/lib/api'
import toast from 'react-hot-toast'
import { cn } from '@/lib/utils'

interface TemplateSummary {
  id: string; type: string; name: string; subject: string; is_active: boolean; updated_at: string
}
interface TemplateDetail extends TemplateSummary {
  html_body: string
}
interface Draft {
  subject: string
  html_body: string
  is_active: boolean
}

const TYPE_META: Record<string, { icon: typeof Mail; accent: string }> = {
  welcome: { icon: Sparkles, accent: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/25' },
  password_reset_otp: { icon: KeyRound, accent: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/25' },
  email_verification: { icon: BadgeCheck, accent: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/25' },
  application_sent: { icon: CheckCircle2, accent: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/25' },
  application_failed: { icon: AlertTriangle, accent: 'text-amber-400 bg-amber-500/10 border-amber-500/25' },
  interview_reminder: { icon: CalendarClock, accent: 'text-sky-400 bg-sky-500/10 border-sky-500/25' },
  offer_received: { icon: Trophy, accent: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/25' },
  subscription: { icon: CreditCard, accent: 'text-violet-400 bg-violet-500/10 border-violet-500/25' },
}

// Types with a real trigger already wired in the app (see backend/app/services/system_email_service.py callers).
// The rest are fully editable/test-sendable but have no underlying feature yet (no interview/offer
// tracking, no billing system) — shown honestly rather than implying they fire automatically.
const LIVE_TYPES = new Set(['welcome', 'password_reset_otp', 'application_sent', 'application_failed'])

export default function SystemEmailTemplates() {
  const qc = useQueryClient()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [previewHtml, setPreviewHtml] = useState<string | null>(null)
  const [previewing, setPreviewing] = useState(false)

  const { data: templates, isLoading } = useQuery<TemplateSummary[]>({
    queryKey: ['system-email-templates'],
    queryFn: async () => (await api.get('/api/admin/system-email-templates')).data,
  })

  const { data: detail } = useQuery<TemplateDetail>({
    queryKey: ['system-email-template', selectedId],
    queryFn: async () => (await api.get(`/api/admin/system-email-templates/${selectedId}`)).data,
    enabled: !!selectedId,
  })

  useEffect(() => {
    if (detail) {
      setDraft({ subject: detail.subject, html_body: detail.html_body, is_active: detail.is_active })
      setPreviewHtml(null)
    }
  }, [detail])

  const saveMutation = useMutation({
    mutationFn: async () => (await api.put(`/api/admin/system-email-templates/${selectedId}`, draft)).data,
    onSuccess: () => {
      toast.success('Template saved')
      qc.invalidateQueries({ queryKey: ['system-email-templates'] })
      qc.invalidateQueries({ queryKey: ['system-email-template', selectedId] })
    },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Failed to save template'),
  })

  const resetMutation = useMutation({
    mutationFn: async () => (await api.post(`/api/admin/system-email-templates/${selectedId}/reset`)).data,
    onSuccess: (data: TemplateDetail) => {
      toast.success('Reset to default')
      setDraft({ subject: data.subject, html_body: data.html_body, is_active: data.is_active })
      setPreviewHtml(null)
      qc.invalidateQueries({ queryKey: ['system-email-templates'] })
    },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Failed to reset template'),
  })

  const sendTestMutation = useMutation({
    mutationFn: async () => (await api.post(`/api/admin/system-email-templates/${selectedId}/send-test`, {
      subject: draft!.subject, html_body: draft!.html_body,
    })).data,
    onSuccess: (data: { message: string }) => toast.success(data.message),
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Failed to send test email'),
  })

  const handlePreview = async () => {
    if (!selectedId || !draft) return
    setPreviewing(true)
    try {
      const { data } = await api.post(`/api/admin/system-email-templates/${selectedId}/preview`, {
        subject: draft.subject, html_body: draft.html_body,
      })
      setPreviewHtml(data.html)
    } catch (e: any) {
      toast.error(e.response?.data?.detail || 'Failed to render preview')
    } finally {
      setPreviewing(false)
    }
  }

  const selected = templates?.find(t => t.id === selectedId)

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <AnimatePresence mode="wait">
        {!selectedId ? (
          <motion.div key="list" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="flex items-center gap-3 mb-1">
              <div className="w-10 h-10 rounded-xl bg-accent/15 flex items-center justify-center">
                <Mail className="w-5 h-5 text-accent" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-foreground">System Email Templates</h1>
                <p className="text-sm text-muted-foreground">
                  Platform notification emails — welcome, password reset, application status, and more.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mt-6">
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="glass rounded-2xl border border-border h-36 shimmer" />
                ))
              ) : (
                templates?.map((t, i) => {
                  const meta = TYPE_META[t.type] ?? { icon: Mail, accent: 'text-accent bg-accent/10 border-accent/25' }
                  const Icon = meta.icon
                  const isLive = LIVE_TYPES.has(t.type)
                  return (
                    <motion.button
                      key={t.id}
                      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
                      onClick={() => setSelectedId(t.id)}
                      className="glass rounded-2xl border border-border p-5 text-left hover:border-accent/40 transition-colors"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center border', meta.accent)}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <span className={cn(
                            'text-[10px] px-2 py-0.5 rounded-full border font-medium',
                            t.is_active
                              ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/25'
                              : 'text-muted-foreground bg-muted-foreground/10 border-border'
                          )}>
                            {t.is_active ? 'Active' : 'Disabled'}
                          </span>
                          <span className={cn(
                            'text-[10px] px-2 py-0.5 rounded-full border',
                            isLive
                              ? 'text-sky-400 bg-sky-500/10 border-sky-500/25'
                              : 'text-muted-foreground bg-muted-foreground/5 border-border'
                          )}>
                            {isLive ? 'Live trigger' : 'Template only'}
                          </span>
                        </div>
                      </div>
                      <p className="text-foreground font-semibold text-sm mb-1">{t.name}</p>
                      <p className="text-muted-foreground text-xs line-clamp-2">{t.subject}</p>
                    </motion.button>
                  )
                })
              )}
            </div>
          </motion.div>
        ) : (
          <motion.div key="editor" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="flex items-center gap-3 mb-6">
              <button
                onClick={() => { setSelectedId(null); setDraft(null) }}
                className="w-9 h-9 rounded-lg glass border border-border flex items-center justify-center hover:border-accent/40 transition-colors"
              >
                <ArrowLeft className="w-4 h-4 text-foreground" />
              </button>
              <div>
                <h1 className="text-lg font-bold text-foreground">{selected?.name}</h1>
                <p className="text-xs text-muted-foreground">
                  {selected && !LIVE_TYPES.has(selected.type)
                    ? 'Not auto-triggered yet — editable and test-sendable only.'
                    : 'Sent automatically by the platform.'}
                </p>
              </div>
            </div>

            {!draft ? (
              <div className="glass rounded-2xl border border-border p-10 text-center text-muted-foreground text-sm">
                Loading template…
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Editor */}
                <div className="glass rounded-2xl border border-border p-5 space-y-4">
                  <div>
                    <label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block">Subject</label>
                    <input
                      value={draft.subject}
                      onChange={e => setDraft({ ...draft, subject: e.target.value })}
                      className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-accent/50"
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs text-muted-foreground uppercase tracking-wider">HTML Body</label>
                      <span className="text-[10px] text-muted-foreground">Use {'{{variable}}'} placeholders</span>
                    </div>
                    <textarea
                      value={draft.html_body}
                      onChange={e => setDraft({ ...draft, html_body: e.target.value })}
                      rows={16}
                      spellCheck={false}
                      className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs font-mono text-foreground focus:outline-none focus:border-accent/50 resize-y"
                    />
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={draft.is_active}
                      onChange={e => setDraft({ ...draft, is_active: e.target.checked })}
                      className="accent-indigo-500 w-4 h-4"
                    />
                    <span className="text-sm text-foreground">Active</span>
                    <span className="text-xs text-muted-foreground">— disabled templates are skipped silently</span>
                  </label>

                  <div className="flex flex-wrap gap-2 pt-2">
                    <button
                      onClick={() => saveMutation.mutate()}
                      disabled={saveMutation.isPending}
                      className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-accent text-accent-foreground text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
                    >
                      {saveMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                      Save
                    </button>
                    <button
                      onClick={handlePreview}
                      disabled={previewing}
                      className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg glass border border-border text-foreground text-sm font-medium hover:border-accent/40 transition-colors disabled:opacity-50"
                    >
                      {previewing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Eye className="w-3.5 h-3.5" />}
                      Preview
                    </button>
                    <button
                      onClick={() => sendTestMutation.mutate()}
                      disabled={sendTestMutation.isPending}
                      className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg glass border border-border text-foreground text-sm font-medium hover:border-accent/40 transition-colors disabled:opacity-50"
                    >
                      {sendTestMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                      Send Test
                    </button>
                    <button
                      onClick={() => resetMutation.mutate()}
                      disabled={resetMutation.isPending}
                      className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-muted-foreground text-sm font-medium hover:text-danger transition-colors ml-auto"
                    >
                      {resetMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                      Reset to Default
                    </button>
                  </div>
                </div>

                {/* Live preview */}
                <div className="glass rounded-2xl border border-border overflow-hidden flex flex-col">
                  <div className="px-4 py-2.5 border-b border-border text-[11px] text-muted-foreground uppercase tracking-wider">
                    Preview {previewHtml === null && '— click Preview to render'}
                  </div>
                  <div className="flex-1 bg-[#0b1120] min-h-[500px]">
                    {previewHtml !== null ? (
                      <iframe title="Email preview" srcDoc={previewHtml} className="w-full h-full min-h-[500px] border-0" sandbox="" />
                    ) : (
                      <div className="flex items-center justify-center h-full min-h-[500px] text-muted-foreground text-sm">
                        No preview rendered yet
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
