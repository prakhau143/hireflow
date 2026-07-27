import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useParams, Link } from 'react-router-dom'
import {
  ArrowLeft, MapPin, Briefcase, Mail, Phone, Clock, CheckCircle, XCircle,
  Zap, BookOpen, Target, Send, Star, AlertTriangle, Sparkles, Brain,
  FileText, MessageSquare, TrendingUp, ChevronDown, ChevronUp, Copy,
  Shield, GraduationCap, Building2, DollarSign, BarChart3, ExternalLink,
  GitCompare, Loader2, RefreshCw
} from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { cn, getMatchBg, getMatchRingColor, timeAgo } from '@/lib/utils'
import { EmptyState } from '@/components/ui/EmptyState'
import api from '@/lib/api'
import type { Job } from '@/types'
import toast from 'react-hot-toast'

// ── Helpers ────────────────────────────────────────────────────────────────────
function fitInfo(score: number) {
  if (score >= 85) return { label: 'Strong Match', desc: 'Highly recommended to apply', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/25' }
  if (score >= 70) return { label: 'Good Match',   desc: 'Apply with confidence',       color: 'text-blue-400',    bg: 'bg-blue-500/10 border-blue-500/25' }
  if (score >= 55) return { label: 'Partial Match', desc: 'Address skill gaps first',   color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/25' }
  return { label: 'Weak Match', desc: 'Consider similar roles',   color: 'text-red-400',    bg: 'bg-red-500/10 border-red-500/25' }
}

function Section({ title, icon: Icon, iconColor = 'text-accent', badge, children, defaultOpen = true }:
  { title: string; icon: any; iconColor?: string; badge?: React.ReactNode; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
      className="glass rounded-2xl border border-border overflow-hidden">
      <button onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-foreground/[0.02] transition-colors">
        <h2 className="text-foreground font-medium text-sm flex items-center gap-2">
          <Icon className={cn('w-4 h-4', iconColor)} />
          {title}
          {badge}
        </h2>
        {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }}
            className="overflow-hidden border-t border-border">
            <div className="px-5 py-4">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

function ATSBar({ label, score }: { label: string; score: number }) {
  const color = score >= 80 ? 'bg-emerald-500' : score >= 60 ? 'bg-yellow-500' : 'bg-red-500'
  const text  = score >= 80 ? 'text-emerald-400' : score >= 60 ? 'text-yellow-400' : 'text-red-400'
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className={cn('font-bold', text)}>{score}</span>
      </div>
      <div className="h-1.5 bg-foreground/5 rounded-full overflow-hidden">
        <motion.div initial={{ width: 0 }} animate={{ width: `${score}%` }} transition={{ duration: 0.6, ease: 'easeOut' }}
          className={cn('h-full rounded-full', color)} />
      </div>
    </div>
  )
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  function doCopy() {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <button onClick={doCopy}
      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground/80 transition-colors">
      {copied ? <CheckCircle className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

// ── AI Analysis hook ───────────────────────────────────────────────────────────
interface JobAI {
  summary: string
  career_advice: string
  cover_letter: string
  interview_questions: string[]
  resume_tips: string[]
  learning_path: (string | { skill: string; time: string; how: string })[]
  salary_guidance: string
  should_apply: boolean
  apply_reason: string
  // Career-coach fields (v2)
  why_match?: string[]
  why_not?: string[]
  experience_analysis?: string
  apply_recommendation?: 'Strong Fit' | 'Moderate Fit' | 'Weak Fit' | 'Avoid'
  probabilities?: { shortlist: number; interview: number; recruiter_reply: number; offer: number }
  recruiter_interest?: number
  competition_level?: { level: 'Low' | 'Medium' | 'High'; reason: string }
  company_overview?: string
  company_tech_stack?: string[]
  role_growth?: string
  future_opportunities?: string[]
  salary_analysis?: { market: string; offered: string; verdict: string }
  action_plan?: { step: number; title: string; detail: string; eta: string }[]
  cached?: boolean
  generated_at?: string
}

function useJobAI(jobId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['job-ai', jobId],
    queryFn: async () => {
      const { data } = await api.post(`/api/jobs/${jobId}/ai-analyze`)
      return data as JobAI
    },
    enabled,
    retry: false,
    staleTime: Infinity,
  })
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function JobDetail() {
  const { id } = useParams<{ id: string }>()
  const [aiEnabled, setAiEnabled] = useState(false)
  const [shortlisted, setShortlisted] = useState(false)

  const { data: job, isLoading, isError } = useQuery<Job>({
    queryKey: ['job', id],
    queryFn: async () => {
      const { data } = await api.get(`/api/jobs/${id}`)
      setShortlisted(data.status === 'shortlisted')
      return data
    },
    enabled: !!id,
  })

  const qc = useQueryClient()
  const { data: ai, isLoading: aiLoading } = useJobAI(id!, aiEnabled)
  const [regenerating, setRegenerating] = useState(false)

  async function regenerateAI() {
    setRegenerating(true)
    try {
      const { data } = await api.post(`/api/jobs/${id}/ai-analyze?refresh=true`)
      qc.setQueryData(['job-ai', id], data)
      toast.success('Fresh AI analysis generated')
    } catch (e: any) {
      toast.error(e.response?.data?.detail || 'Regeneration failed')
    } finally {
      setRegenerating(false)
    }
  }

  const shortlistMutation = useMutation({
    mutationFn: async () => {
      const next = shortlisted ? 'new' : 'shortlisted'
      await api.patch(`/api/jobs/${id}`, { status: next })
      return next
    },
    onSuccess: (s) => { setShortlisted(s === 'shortlisted'); toast.success(s === 'shortlisted' ? 'Shortlisted!' : 'Removed from shortlist') },
  })

  if (isLoading) return (
    <div className="max-w-5xl mx-auto space-y-6">
      <Link to="/jobs" className="flex items-center gap-2 text-muted-foreground hover:text-foreground/80 text-sm transition-colors w-fit">
        <ArrowLeft className="w-4 h-4" /> Back
      </Link>
      {[1,2,3,4].map(i => <div key={i} className="glass rounded-2xl border border-border shimmer" style={{ height: i === 1 ? 200 : 120 }} />)}
    </div>
  )

  if (isError || !job) return (
    <div className="max-w-5xl mx-auto space-y-6">
      <Link to="/jobs" className="flex items-center gap-2 text-muted-foreground hover:text-foreground/80 text-sm transition-colors w-fit">
        <ArrowLeft className="w-4 h-4" /> Back
      </Link>
      <EmptyState icon={Briefcase} title="Job not found" description="This job may have been deleted." />
    </div>
  )

  const score    = job.match_score ?? 0
  const ringColor = getMatchRingColor(score)
  const matchBg  = getMatchBg(score)
  const fit      = fitInfo(score)

  // Derived ATS scores (heuristic from job fields)
  const atsSkills  = Math.min(100, Math.round(((job.matched_skills?.length ?? 0) / Math.max((job.skills?.length ?? 1), 1)) * 100))
  const atsExp     = job.experience_min != null && job.experience_min <= 5 ? 88 : 70
  const atsKeywords = job.description ? Math.min(95, 60 + Math.round(score * 0.35)) : 60
  const atsFormat  = 94
  const atsOverall = Math.round((atsSkills * 0.35 + atsExp * 0.25 + atsKeywords * 0.25 + atsFormat * 0.15))

  return (
    <div className="w-full space-y-5">
      <Link to="/jobs" className="flex items-center gap-2 text-muted-foreground hover:text-foreground/80 text-sm transition-colors w-fit">
        <ArrowLeft className="w-4 h-4" /> Back to Jobs
      </Link>

      {/* ── Hero Card ── */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        className="glass rounded-2xl border border-border overflow-hidden">
        <div className="h-1 w-full" style={{ background: `linear-gradient(90deg, ${ringColor}, transparent 70%)` }} />

        <div className="p-6 flex items-start justify-between gap-6">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-3 mb-2">
              <h1 className="text-2xl font-bold text-foreground">{job.title}</h1>
              <span className={cn('text-xs px-2.5 py-1 rounded-full border font-medium', fit.bg, fit.color)}>
                {fit.label}
              </span>
              {job.employment_type && (
                <span className="text-xs px-2.5 py-1 rounded-full glass border border-border text-muted-foreground">
                  {job.employment_type}
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground mb-3">
              <span className="font-medium text-foreground/80 flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5" />{job.company}
              </span>
              {job.location && <span className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" />{job.location}</span>}
              {job.location_type && (
                <span className={cn('text-xs px-2 py-0.5 rounded border',
                  job.location_type === 'remote' ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                  : job.location_type === 'hybrid' ? 'text-orange-400 bg-orange-500/10 border-orange-500/20'
                  : 'text-muted-foreground border-border'
                )}>
                  {job.location_type.charAt(0).toUpperCase() + job.location_type.slice(1)}
                </span>
              )}
              {(job.experience_min != null || job.experience_max != null) && (
                <span className="flex items-center gap-1.5">
                  <Briefcase className="w-3.5 h-3.5" />
                  {job.experience_display ?? `${job.experience_min ?? 0}–${job.experience_max ?? '?'} yrs`}
                </span>
              )}
              {job.salary && (
                <span className="flex items-center gap-1.5 text-yellow-400">
                  <DollarSign className="w-3.5 h-3.5" />{job.salary}
                </span>
              )}
              {job.posted_date && (
                <span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" />{timeAgo(job.posted_date)}</span>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              {(job.smart_tags ?? []).map(tag => (
                <span key={tag} className="text-xs px-2 py-0.5 rounded-full glass border border-border text-muted-foreground">{tag}</span>
              ))}
            </div>
          </div>

          {/* Match Ring */}
          <div className="shrink-0 text-center">
            <div className="relative">
              <svg width="88" height="88" viewBox="0 0 88 88">
                <circle cx="44" cy="44" r="38" fill="none" stroke="var(--border)" strokeWidth="5" />
                <circle cx="44" cy="44" r="38" fill="none" stroke={ringColor} strokeWidth="5" strokeLinecap="round"
                  strokeDasharray={`${2 * Math.PI * 38}`}
                  strokeDashoffset={`${2 * Math.PI * 38 * (1 - score / 100)}`}
                  transform="rotate(-90 44 44)" style={{ transition: 'stroke-dashoffset 1s ease' }} />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-xl font-bold" style={{ color: ringColor }}>{score}%</span>
                <span className="text-[10px] text-muted-foreground">match</span>
              </div>
            </div>
            <p className={cn('text-xs mt-1 font-medium', fit.color)}>{fit.desc}</p>
            {job.apply_probability != null && (
              <p className="text-[10px] text-muted-foreground mt-1.5" title="Estimate derived from the match score — not a guarantee">
                Apply probability: <span className="text-foreground/80 font-semibold">{job.apply_probability}%</span>
              </p>
            )}
          </div>
        </div>

        {/* Action bar */}
        <div className="border-t border-border px-6 py-3.5 flex items-center gap-2 flex-wrap">
          {job.contact_email && (
            <motion.a href={`mailto:${job.contact_email}`} whileTap={{ scale: 0.97 }}
              className="flex items-center gap-2 px-5 py-2 rounded-xl bg-accent hover:bg-accent/90 text-accent-foreground text-sm font-medium transition-colors">
              <Send className="w-4 h-4" /> Apply via Email
            </motion.a>
          )}
          {job.apply_link && (
            <a href={job.apply_link} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-2 px-5 py-2 rounded-xl glass border border-border text-foreground/80 hover:text-foreground text-sm transition-all">
              <ExternalLink className="w-4 h-4" /> Apply Link
            </a>
          )}
          <motion.button whileTap={{ scale: 0.97 }} onClick={() => shortlistMutation.mutate()}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-xl border text-sm transition-all',
              shortlisted ? 'bg-yellow-500/20 border-yellow-500/30 text-yellow-400' : 'glass border-border text-muted-foreground hover:text-foreground'
            )}>
            <Star className={cn('w-4 h-4', shortlisted && 'fill-yellow-400')} />
            {shortlisted ? 'Shortlisted' : 'Shortlist'}
          </motion.button>
          <Link to="/jobs" className="flex items-center gap-2 px-4 py-2 rounded-xl glass border border-border text-muted-foreground hover:text-foreground text-sm transition-all">
            <GitCompare className="w-4 h-4" /> Compare
          </Link>

          {/* AI Analysis toggle */}
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => setAiEnabled(true)}
            disabled={aiEnabled}
            className={cn(
              'ml-auto flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all',
              aiEnabled
                ? 'glass border border-purple-500/30 text-purple-400'
                : 'bg-purple-600/80 hover:bg-purple-600 text-white border border-purple-500/50'
            )}
          >
            {aiLoading
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Analyzing…</>
              : aiEnabled && ai
              ? <><Sparkles className="w-4 h-4" /> AI Active</>
              : <><Sparkles className="w-4 h-4" /> Run AI Analysis</>
            }
          </motion.button>
        </div>
      </motion.div>

      {/* ── Content Grid ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left: main sections */}
        <div className="lg:col-span-2 space-y-4">

          {/* Job Overview */}
          {job.description && (
            <Section title="Job Overview" icon={BookOpen}>
              <p className="text-muted-foreground text-sm leading-relaxed">{job.description}</p>
            </Section>
          )}

          {/* AI Career Summary */}
          {(aiEnabled) && (
            <Section title="AI Career Summary" icon={Brain} iconColor="text-purple-400"
              badge={<span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-400 border border-purple-500/25">AI</span>}>
              {aiLoading ? (
                <div className="space-y-2">
                  {[1,2,3].map(i => <div key={i} className="h-3 bg-foreground/5 rounded animate-pulse" style={{ width: `${70 + i * 10}%` }} />)}
                </div>
              ) : ai?.summary ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                    {ai.cached && <span className="px-1.5 py-0.5 rounded bg-foreground/5 border border-border">⚡ Cached — instant, no AI quota used</span>}
                    <button onClick={regenerateAI} disabled={regenerating}
                      className="px-1.5 py-0.5 rounded border border-purple-500/25 text-purple-400/80 hover:bg-purple-500/10 disabled:opacity-40">
                      {regenerating ? 'Regenerating…' : '↻ Regenerate'}
                    </button>
                  </div>
                  <p className="text-foreground/80 text-sm leading-relaxed">{ai.summary}</p>
                  {ai.experience_analysis && (
                    <p className="text-xs text-muted-foreground leading-relaxed border-l-2 border-accent/30 pl-3">{ai.experience_analysis}</p>
                  )}
                  {ai.career_advice && (
                    <div className="p-3 rounded-xl bg-accent/8 border border-accent/15">
                      <p className="text-xs text-accent font-medium mb-1 flex items-center gap-1.5">
                        <Zap className="w-3 h-3" /> Career Advice
                      </p>
                      <p className="text-xs text-muted-foreground leading-relaxed">{ai.career_advice}</p>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Click "Run AI Analysis" to generate insights for this role.</p>
              )}
            </Section>
          )}

          {/* Why This Match / Why Not */}
          {aiEnabled && ((ai?.why_match?.length ?? 0) > 0 || (ai?.why_not?.length ?? 0) > 0) && (
            <Section title="Why This Match" icon={Target} iconColor="text-emerald-400">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {(ai!.why_match?.length ?? 0) > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs text-emerald-400/80 font-medium">Why it fits you</p>
                    {ai!.why_match!.map((r, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                        <CheckCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />{r}
                      </div>
                    ))}
                  </div>
                )}
                {(ai!.why_not?.length ?? 0) > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs text-red-400/80 font-medium">Honest concerns</p>
                    {ai!.why_not!.map((r, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                        <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />{r}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Section>
          )}

          {/* Company Intelligence */}
          {aiEnabled && ai?.company_overview && (
            <Section title="Company Intelligence" icon={Briefcase} iconColor="text-cyan-400" defaultOpen={false}>
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground leading-relaxed">{ai.company_overview}</p>
                {(ai.company_tech_stack?.length ?? 0) > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-2">Likely tech stack</p>
                    <div className="flex flex-wrap gap-1.5">
                      {ai.company_tech_stack!.map(t => (
                        <span key={t} className="text-xs px-2 py-1 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-300">{t}</span>
                      ))}
                    </div>
                  </div>
                )}
                {ai.role_growth && (
                  <div className="p-3 rounded-xl bg-foreground/[0.03] border border-border">
                    <p className="text-xs text-muted-foreground mb-1">Role growth (2–3 years)</p>
                    <p className="text-xs text-muted-foreground leading-relaxed">{ai.role_growth}</p>
                  </div>
                )}
                {(ai.future_opportunities?.length ?? 0) > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {ai.future_opportunities!.map(o => (
                      <span key={o} className="text-xs px-2 py-1 rounded-lg bg-purple-500/10 border border-purple-500/20 text-purple-300">↗ {o}</span>
                    ))}
                  </div>
                )}
                {ai.salary_analysis && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
                    <div className="p-2.5 rounded-lg bg-foreground/[0.03] border border-border">
                      <p className="text-muted-foreground">Market</p><p className="text-foreground/80 mt-0.5">{ai.salary_analysis.market}</p>
                    </div>
                    <div className="p-2.5 rounded-lg bg-foreground/[0.03] border border-border">
                      <p className="text-muted-foreground">Offered</p><p className="text-yellow-400/90 mt-0.5">{ai.salary_analysis.offered}</p>
                    </div>
                    <div className="p-2.5 rounded-lg bg-foreground/[0.03] border border-border">
                      <p className="text-muted-foreground">Verdict</p><p className="text-foreground/80 mt-0.5">{ai.salary_analysis.verdict}</p>
                    </div>
                  </div>
                )}
              </div>
            </Section>
          )}

          {/* AI Action Plan */}
          {aiEnabled && (ai?.action_plan?.length ?? 0) > 0 && (
            <Section title="AI Action Plan" icon={Zap} iconColor="text-purple-400">
              <div className="space-y-3">
                {ai!.action_plan!.map((s) => (
                  <div key={s.step} className="flex items-start gap-3">
                    <div className="w-7 h-7 rounded-full bg-purple-500/15 border border-purple-500/30 text-purple-300 text-xs font-bold flex items-center justify-center shrink-0">{s.step}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground/80 font-medium flex items-center gap-2">
                        {s.title}
                        {s.eta && <span className="text-[10px] px-1.5 py-0.5 rounded bg-foreground/5 border border-border text-muted-foreground font-normal">{s.eta}</span>}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{s.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Skills Analysis */}
          <Section title="Skill Match Analysis" icon={Target}>
            <div className="space-y-4">
              {(job.matched_skills ?? []).length > 0 && (
                <div>
                  <p className="text-xs text-emerald-400/70 mb-2 flex items-center gap-1.5">
                    <CheckCircle className="w-3.5 h-3.5" /> You have these ({job.matched_skills!.length} matched)
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {job.matched_skills!.map(s => (
                      <span key={s} className="text-sm px-3 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">{s}</span>
                    ))}
                  </div>
                </div>
              )}
              {(job.missing_skills ?? []).length > 0 && (
                <div>
                  <p className="text-xs text-red-400/70 mb-2 flex items-center gap-1.5">
                    <XCircle className="w-3.5 h-3.5" /> Missing skills ({job.missing_skills!.length} gaps)
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {job.missing_skills!.map(s => {
                      const detail = job.missing_skills_detail?.find(d => d.skill === s)
                      return (
                        <span key={s} className="text-sm px-3 py-1 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 flex items-center gap-1.5">
                          {s}
                          {detail && <span className="text-[10px] text-red-400/60">· {detail.learn_time}</span>}
                        </span>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* AI Resume tips */}
              {(ai?.resume_tips?.length ?? 0) > 0 && (
                <div className="p-3 rounded-xl bg-yellow-500/8 border border-yellow-500/15">
                  <p className="text-xs text-yellow-400 font-medium mb-2 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5" /> Add to your resume
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {ai!.resume_tips.map(t => (
                      <span key={t} className="text-xs px-2 py-0.5 rounded bg-yellow-500/10 text-yellow-300 border border-yellow-500/20">{t}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </Section>

          {/* 100-point Match Engine Breakdown */}
          {(job.match_breakdown?.length ?? 0) > 0 && (
            <Section title="Match Score Breakdown" icon={Target}>
              <div className="space-y-4">
                <p className="text-xs text-muted-foreground">
                  Weighted 100-point engine — components without data (e.g. no resume uploaded) are excluded and the score is normalized.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
                  {job.match_breakdown!.map(b => (
                    <div key={b.key} className={cn(!b.available && 'opacity-35')}>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-muted-foreground">{b.label}</span>
                        <span className="text-foreground/80 font-semibold tabular-nums">
                          {b.available ? `${b.score} / ${b.max}` : 'No data'}
                        </span>
                      </div>
                      <div className="h-1.5 bg-foreground/5 rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: b.available ? `${(b.score / b.max) * 100}%` : '0%' }}
                          transition={{ duration: 0.6, ease: 'easeOut' }}
                          className={cn(
                            'h-full rounded-full',
                            b.score / b.max >= 0.8 ? 'bg-emerald-500' : b.score / b.max >= 0.5 ? 'bg-yellow-500' : 'bg-red-500'
                          )}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                {(job.score_suggestions?.length ?? 0) > 0 && (
                  <div className="p-3 rounded-xl bg-purple-500/8 border border-purple-500/15">
                    <p className="text-xs text-purple-300 font-medium mb-2">How to raise this score</p>
                    <div className="flex flex-wrap gap-2">
                      {job.score_suggestions!.map(s => (
                        <span key={s.skill} className="text-xs px-2.5 py-1 rounded-lg bg-purple-500/10 border border-purple-500/20 text-purple-300">
                          Learn {s.skill} → {job.match_score ?? 0}%→{s.projected}%
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </Section>
          )}

          {/* ATS Breakdown */}
          <Section title="ATS Score Breakdown" icon={BarChart3}
            badge={<span className={cn('ml-2 text-sm font-bold', atsOverall >= 80 ? 'text-emerald-400' : atsOverall >= 60 ? 'text-yellow-400' : 'text-red-400')}>{atsOverall}/100</span>}>
            <div className="grid grid-cols-2 gap-x-6 gap-y-3">
              <ATSBar label="Skills Match" score={atsSkills} />
              <ATSBar label="Experience" score={atsExp} />
              <ATSBar label="Keywords" score={atsKeywords} />
              <ATSBar label="Formatting" score={atsFormat} />
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              Overall ATS score: <span className={cn('font-bold', atsOverall >= 80 ? 'text-emerald-400' : atsOverall >= 60 ? 'text-yellow-400' : 'text-red-400')}>{atsOverall}</span>
              {atsOverall >= 80 ? ' — Your resume is well optimised for this role.' : atsOverall >= 60 ? ' — Add missing keywords to improve your score.' : ' — Significant gaps. Consider skill building first.'}
            </p>
          </Section>

          {/* AI Cover Letter */}
          {aiEnabled && (
            <Section title="AI Cover Letter" icon={FileText} iconColor="text-cyan-400" defaultOpen={false}
              badge={<span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-400 border border-cyan-500/25">AI</span>}>
              {aiLoading ? (
                <div className="space-y-2">{[1,2,3,4,5].map(i => <div key={i} className="h-3 bg-foreground/5 rounded animate-pulse" />)}</div>
              ) : ai?.cover_letter ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">Personalised cover letter for {job.company}</p>
                    <CopyButton text={ai.cover_letter} />
                  </div>
                  <div className="bg-foreground/[0.03] rounded-xl border border-border p-4">
                    <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-line">{ai.cover_letter}</p>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Run AI Analysis to generate a personalised cover letter.</p>
              )}
            </Section>
          )}

          {/* Interview Questions */}
          {aiEnabled && (
            <Section title="Interview Prep" icon={MessageSquare} iconColor="text-orange-400" defaultOpen={false}
              badge={<span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-orange-500/15 text-orange-400 border border-orange-500/25">AI</span>}>
              {aiLoading ? (
                <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-8 bg-foreground/5 rounded animate-pulse" />)}</div>
              ) : (ai?.interview_questions?.length ?? 0) > 0 ? (
                <ul className="space-y-2">
                  {ai!.interview_questions.map((q, i) => (
                    <li key={i} className="flex items-start gap-3 p-3 rounded-xl bg-foreground/[0.03] border border-border text-sm text-foreground/80">
                      <span className="shrink-0 w-5 h-5 rounded-full bg-orange-500/20 text-orange-400 text-[10px] font-bold flex items-center justify-center">{i + 1}</span>
                      {q}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground">Run AI Analysis to generate role-specific interview questions.</p>
              )}
            </Section>
          )}

          {/* Learning Path */}
          {aiEnabled && (ai?.learning_path?.length ?? 0) > 0 && (
            <Section title="Learning Roadmap" icon={GraduationCap} iconColor="text-emerald-400" defaultOpen={false}
              badge={<span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">To reach 95%</span>}>
              <div className="space-y-2.5">
                {ai!.learning_path.map((step, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-emerald-500/15 border border-emerald-500/25 text-emerald-400 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">{i + 1}</div>
                    {typeof step === 'string' ? (
                      <p className="text-sm text-muted-foreground">{step}</p>
                    ) : (
                      <div className="min-w-0">
                        <p className="text-sm text-foreground/80 font-medium flex items-center gap-2">
                          {step.skill}
                          {step.time && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-normal">
                              ~{step.time}
                            </span>
                          )}
                        </p>
                        {step.how && <p className="text-xs text-muted-foreground mt-0.5">{step.how}</p>}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Contact */}
          {(job.contact_email || (job as any).contact_phone) && (
            <Section title="Contact Information" icon={Mail} defaultOpen={false}>
              <div className="space-y-3">
                {job.contact_email && (
                  <a href={`mailto:${job.contact_email}`}
                    className="flex items-center gap-3 text-sm text-muted-foreground hover:text-accent transition-colors">
                    <Mail className="w-4 h-4" />{job.contact_email}
                  </a>
                )}
                {(job as any).contact_phone && (
                  <span className="flex items-center gap-3 text-sm text-muted-foreground">
                    <Phone className="w-4 h-4" />{(job as any).contact_phone}
                  </span>
                )}
              </div>
            </Section>
          )}
        </div>

        {/* Right sidebar */}
        <div className="space-y-4">

          {/* Should You Apply card */}
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }}
            className={cn('rounded-2xl border p-5 space-y-4', fit.bg)}>
            <div className="flex items-center gap-2">
              <Shield className={cn('w-5 h-5', fit.color)} />
              <h3 className={cn('font-semibold text-sm', fit.color)}>Should You Apply?</h3>
            </div>

            <div className="text-center py-2">
              {ai?.apply_recommendation ? (
                <>
                  <p className={cn(
                    'text-2xl font-black',
                    ai.apply_recommendation === 'Strong Fit' ? 'text-emerald-400'
                      : ai.apply_recommendation === 'Moderate Fit' ? 'text-yellow-400'
                      : ai.apply_recommendation === 'Weak Fit' ? 'text-orange-400'
                      : 'text-red-400'
                  )}>
                    {ai.apply_recommendation.toUpperCase()}
                  </p>
                  <p className="text-[10px] text-purple-400/70 mt-1 flex items-center justify-center gap-1">
                    <Sparkles className="w-2.5 h-2.5" /> AI Recommendation
                  </p>
                </>
              ) : (
                <>
                  <p className={cn('text-3xl font-black', fit.color)}>{score >= 55 ? 'YES' : 'MAYBE'}</p>
                  <p className="text-xs text-muted-foreground mt-1">{fit.desc}</p>
                </>
              )}
            </div>

            {/* Checklist */}
            <div className="space-y-2">
              {[
                { label: 'Experience', ok: !job.experience_min || job.experience_min <= 5 },
                { label: 'Skills match', ok: (job.matched_skills?.length ?? 0) >= (job.skills?.length ?? 0) * 0.5 },
                { label: 'Has contact info', ok: !!(job.contact_email || (job as any).contact_phone) },
                { label: 'Location fits', ok: job.location_type === 'remote' || !!job.location },
              ].map(({ label, ok }) => (
                <div key={label} className="flex items-center gap-2 text-xs">
                  {ok
                    ? <CheckCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    : <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                  }
                  <span className={ok ? 'text-foreground/80' : 'text-muted-foreground'}>{label}</span>
                </div>
              ))}
            </div>

            {ai?.apply_reason && (
              <p className="text-xs text-muted-foreground leading-relaxed border-t border-border pt-3">{ai.apply_reason}</p>
            )}
          </motion.div>

          {/* Success Probability */}
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.15 }}
            className="glass rounded-2xl border border-border p-5 space-y-3">
            <h3 className="text-foreground font-medium text-sm flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-accent" /> Success Probability
              {ai?.probabilities && (
                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-purple-500/15 border border-purple-500/25 text-purple-400 font-medium">AI</span>
              )}
            </h3>
            {(ai?.probabilities ? [
              { label: 'Shortlist Chance', value: ai.probabilities.shortlist },
              { label: 'Interview Chance', value: ai.probabilities.interview },
              { label: 'Recruiter Reply', value: ai.probabilities.recruiter_reply },
              { label: 'Offer Chance', value: ai.probabilities.offer },
            ] : [
              { label: 'Interview Chance', value: Math.min(95, Math.round(score * 0.75 + 10)) },
              { label: 'Resume Selected', value: Math.min(95, Math.round(atsOverall * 0.9 + 5)) },
              { label: 'Recruiter Reply', value: Math.min(90, Math.round(score * 0.55 + 5)) },
            ]).map(({ label, value }) => (
              <div key={label} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{label}</span>
                  <span className="font-bold text-foreground/80">{value}%</span>
                </div>
                <div className="h-1.5 bg-foreground/5 rounded-full overflow-hidden">
                  <motion.div initial={{ width: 0 }} animate={{ width: `${value}%` }} transition={{ duration: 0.7, delay: 0.3 }}
                    className={cn('h-full rounded-full', value >= 70 ? 'bg-emerald-500' : value >= 50 ? 'bg-yellow-500' : 'bg-red-500')} />
                </div>
              </div>
            ))}

            {/* AI extras: recruiter interest + competition */}
            {ai?.recruiter_interest != null && (
              <div className="flex items-center justify-between text-xs border-t border-border pt-3">
                <span className="text-muted-foreground">Recruiter Interest</span>
                <span className={cn('font-bold',
                  ai.recruiter_interest >= 70 ? 'text-emerald-400' : ai.recruiter_interest >= 50 ? 'text-yellow-400' : 'text-red-400')}>
                  {ai.recruiter_interest}%
                </span>
              </div>
            )}
            {ai?.competition_level && (
              <div className="text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Competition</span>
                  <span className={cn('px-2 py-0.5 rounded-full border text-[10px] font-medium',
                    ai.competition_level.level === 'Low' ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/25'
                      : ai.competition_level.level === 'Medium' ? 'text-yellow-400 bg-yellow-500/10 border-yellow-500/25'
                      : 'text-red-400 bg-red-500/10 border-red-500/25')}>
                    {ai.competition_level.level}
                  </span>
                </div>
                <p className="text-muted-foreground mt-1.5 leading-relaxed">{ai.competition_level.reason}</p>
              </div>
            )}
          </motion.div>

          {/* Requirements */}
          {job.skills?.length > 0 && (
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 }}
              className="glass rounded-2xl border border-border p-5">
              <h3 className="text-foreground font-medium text-sm flex items-center gap-2 mb-3">
                <Target className="w-4 h-4 text-accent" /> Requirements
              </h3>
              <ul className="space-y-1.5">
                {job.experience_min != null && (
                  <li className="flex items-center gap-2 text-xs text-muted-foreground">
                    <div className="w-1.5 h-1.5 rounded-full bg-accent/50 shrink-0" />
                    {job.experience_display ?? `${job.experience_min}–${job.experience_max} years`} experience
                  </li>
                )}
                {job.skills.slice(0, 8).map(s => (
                  <li key={s} className="flex items-center gap-2 text-xs">
                    {(job.matched_skills ?? []).includes(s)
                      ? <CheckCircle className="w-3 h-3 text-emerald-400 shrink-0" />
                      : <XCircle className="w-3 h-3 text-red-400/60 shrink-0" />
                    }
                    <span className={(job.matched_skills ?? []).includes(s) ? 'text-foreground/80' : 'text-muted-foreground'}>{s}</span>
                  </li>
                ))}
              </ul>
            </motion.div>
          )}

          {/* Salary */}
          {(job.salary || ai?.salary_guidance) && (
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.25 }}
              className="glass rounded-2xl border border-yellow-500/20 p-5 space-y-3">
              <h3 className="text-yellow-400 font-medium text-sm flex items-center gap-2">
                <DollarSign className="w-4 h-4" /> Salary Insights
              </h3>
              {job.salary && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Posted Range:</span>
                  <span className="text-sm text-foreground/80 font-medium">{job.salary}</span>
                </div>
              )}
              {ai?.salary_guidance && (
                <p className="text-xs text-muted-foreground leading-relaxed">{ai.salary_guidance}</p>
              )}
            </motion.div>
          )}
        </div>
      </div>
    </div>
  )
}
