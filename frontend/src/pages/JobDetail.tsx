import { motion } from 'framer-motion'
import { useParams, Link } from 'react-router-dom'
import {
  ArrowLeft, MapPin, Briefcase, Mail, Phone, Clock,
  CheckCircle, XCircle, Zap, BookOpen, Target, Send, Star, AlertTriangle
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { cn, getMatchBg, getMatchRingColor, timeAgo } from '@/lib/utils'
import { EmptyState } from '@/components/ui/EmptyState'
import api from '@/lib/api'
import type { Job } from '@/types'

export default function JobDetail() {
  const { id } = useParams<{ id: string }>()

  const { data: job, isLoading, isError } = useQuery<Job>({
    queryKey: ['job', id],
    queryFn: async () => {
      const { data } = await api.get(`/api/jobs/${id}`)
      return data
    },
    enabled: !!id,
  })

  if (isLoading) {
    return (
      <div className="max-w-5xl mx-auto space-y-6">
        <Link to="/jobs" className="flex items-center gap-2 text-white/40 hover:text-white/70 text-sm transition-colors w-fit">
          <ArrowLeft className="w-4 h-4" /> Back to Jobs
        </Link>
        <div className="glass rounded-2xl border border-white/10 h-48 shimmer" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            {[1,2,3].map(i => <div key={i} className="glass rounded-2xl border border-white/10 h-32 shimmer" />)}
          </div>
          <div className="glass rounded-2xl border border-white/10 h-64 shimmer" />
        </div>
      </div>
    )
  }

  if (isError || !job) {
    return (
      <div className="max-w-5xl mx-auto space-y-6">
        <Link to="/jobs" className="flex items-center gap-2 text-white/40 hover:text-white/70 text-sm transition-colors w-fit">
          <ArrowLeft className="w-4 h-4" /> Back to Jobs
        </Link>
        <EmptyState icon={Briefcase} title="Job not found" description="This job may have been deleted or doesn't exist." />
      </div>
    )
  }

  const ringColor = getMatchRingColor(job.match_score ?? 0)
  const matchBg = getMatchBg(job.match_score ?? 0)

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <Link to="/jobs" className="flex items-center gap-2 text-white/40 hover:text-white/70 text-sm transition-colors w-fit">
        <ArrowLeft className="w-4 h-4" />
        Back to Jobs
      </Link>

      {/* Hero Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass rounded-2xl border border-white/10 overflow-hidden"
      >
        <div className="h-1 w-full" style={{ background: `linear-gradient(90deg, ${ringColor}, transparent 70%)` }} />

        <div className="p-6 flex items-start justify-between gap-6">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-3 mb-3">
              <h1 className="text-2xl font-bold text-white">{job.title}</h1>
              {job.match_score != null && (
                <span className={cn('text-sm px-3 py-1 rounded-full border', matchBg)}>
                  {job.match_score}% Match
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-4 text-sm text-white/50">
              <span className="font-medium text-white/80">{job.company}</span>
              {job.location && <span className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" />{job.location}</span>}
              {(job.experience_min != null || job.experience_max != null) && (
                <span className="flex items-center gap-1.5">
                  <Briefcase className="w-3.5 h-3.5" />
                  {job.experience_min ?? 0}–{job.experience_max ?? '?'} yrs
                </span>
              )}
              {job.posted_date && (
                <span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" />{timeAgo(job.posted_date)}</span>
              )}
            </div>

            <div className="flex flex-wrap gap-2 mt-3">
              {(job.smart_tags ?? []).map((tag) => (
                <span key={tag} className="text-xs px-2.5 py-0.5 rounded-full glass border border-white/10 text-white/60">{tag}</span>
              ))}
            </div>
          </div>

          {/* Match Ring */}
          {job.match_score != null && (
            <div className="shrink-0">
              <div className="relative">
                <svg width="80" height="80" viewBox="0 0 80 80">
                  <circle cx="40" cy="40" r="34" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="4" />
                  <circle
                    cx="40" cy="40" r="34" fill="none"
                    stroke={ringColor} strokeWidth="4" strokeLinecap="round"
                    strokeDasharray={`${2 * Math.PI * 34}`}
                    strokeDashoffset={`${2 * Math.PI * 34 * (1 - job.match_score / 100)}`}
                    transform="rotate(-90 40 40)"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-lg font-bold" style={{ color: ringColor }}>{job.match_score}%</span>
                  <span className="text-xs text-white/40">match</span>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-white/5 px-6 py-4 flex gap-3">
          <motion.button
            whileTap={{ scale: 0.97 }}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors"
          >
            <Send className="w-4 h-4" />
            Prepare Application
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.97 }}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl glass border border-white/10 text-white/70 hover:text-white text-sm transition-all"
          >
            <Star className="w-4 h-4" />
            Shortlist
          </motion.button>
        </div>
      </motion.div>

      {/* Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          {job.description && (
            <Section title="Overview" icon={BookOpen}>
              <p className="text-white/60 text-sm leading-relaxed">{job.description}</p>
            </Section>
          )}

          {job.skills?.length > 0 && (
            <Section title="Requirements" icon={Target}>
              <ul className="space-y-2">
                {job.experience_min != null && (
                  <li className="flex items-start gap-2 text-sm text-white/60">
                    <div className="w-1.5 h-1.5 rounded-full bg-indigo-400/50 mt-1.5 shrink-0" />
                    {job.experience_min}–{job.experience_max} years of experience
                  </li>
                )}
                {job.skills.slice(0, 5).map((skill) => (
                  <li key={skill} className="flex items-start gap-2 text-sm text-white/60">
                    <div className="w-1.5 h-1.5 rounded-full bg-indigo-400/50 mt-1.5 shrink-0" />
                    Proficiency in {skill}
                  </li>
                ))}
              </ul>
            </Section>
          )}

          <Section title="Skills" icon={Zap}>
            <div className="space-y-3">
              {(job.matched_skills ?? []).length > 0 && (
                <div>
                  <p className="text-xs text-emerald-400/70 mb-2 flex items-center gap-1.5">
                    <CheckCircle className="w-3.5 h-3.5" /> You have these
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {job.matched_skills!.map((s) => (
                      <span key={s} className="text-sm px-3 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">{s}</span>
                    ))}
                  </div>
                </div>
              )}
              {(job.missing_skills ?? []).length > 0 && (
                <div>
                  <p className="text-xs text-red-400/70 mb-2 flex items-center gap-1.5">
                    <XCircle className="w-3.5 h-3.5" /> Missing skills
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {job.missing_skills!.map((s) => (
                      <span key={s} className="text-sm px-3 py-1 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400">{s}</span>
                    ))}
                  </div>
                </div>
              )}
              {!(job.matched_skills?.length) && !(job.missing_skills?.length) && (
                <p className="text-xs text-white/30">No skill analysis yet — complete your profile to enable AI matching.</p>
              )}
            </div>
          </Section>

          {(job.contact_email || (job as any).contact_phone || (job as any).contact_linkedin) && (
            <Section title="Contact Information" icon={Mail}>
              <div className="space-y-3">
                {job.contact_email && (
                  <a href={`mailto:${job.contact_email}`} className="flex items-center gap-3 text-sm text-white/60 hover:text-indigo-400 transition-colors">
                    <Mail className="w-4 h-4" />{job.contact_email}
                  </a>
                )}
                {(job as any).contact_phone && (
                  <span className="flex items-center gap-3 text-sm text-white/60">
                    <Phone className="w-4 h-4" />{(job as any).contact_phone}
                  </span>
                )}
              </div>
            </Section>
          )}
        </div>

        {/* Right: AI Analysis */}
        <div className="space-y-4">
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
            className="glass rounded-2xl border border-purple-500/20 p-5 space-y-4"
          >
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-purple-500/20 flex items-center justify-center">
                <Zap className="w-4 h-4 text-purple-400" />
              </div>
              <div>
                <h3 className="text-white font-medium text-sm">AI Analysis</h3>
                <p className="text-xs text-white/30">Powered by Groq Llama</p>
              </div>
            </div>

            {job.ai_analysis ? (
              <div className="space-y-3">
                <div className="p-3 rounded-xl bg-emerald-500/8 border border-emerald-500/15">
                  <p className="text-xs text-emerald-400 font-medium mb-1">Why this suits you</p>
                  <p className="text-xs text-white/60 leading-relaxed">{job.ai_analysis}</p>
                </div>

                {(job.missing_skills ?? []).length > 0 && (
                  <div className="p-3 rounded-xl bg-yellow-500/8 border border-yellow-500/15">
                    <p className="text-xs text-yellow-400 font-medium mb-2 flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5" /> Skill Gaps
                    </p>
                    {job.missing_skills!.map((s) => (
                      <p key={s} className="text-xs text-white/50">• {s}</p>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-white/30">AI analysis will appear here after Groq processes this job.</p>
            )}
          </motion.div>
        </div>
      </div>
    </div>
  )
}

function Section({ title, icon: Icon, children }: { title: string; icon: any; children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass rounded-2xl border border-white/10 p-5"
    >
      <h2 className="text-white font-medium text-sm flex items-center gap-2 mb-4">
        <Icon className="w-4 h-4 text-indigo-400" />
        {title}
      </h2>
      {children}
    </motion.div>
  )
}
