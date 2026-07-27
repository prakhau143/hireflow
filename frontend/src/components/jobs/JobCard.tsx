import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  MapPin, Briefcase, CheckCircle, XCircle, ExternalLink, Clock,
  Star, GitCompare, ChevronDown, Mail, Phone, Zap, Building2, DollarSign
} from 'lucide-react'
import { cn, getMatchRingColor } from '@/lib/utils'
import type { Job } from '@/types'
import { Link } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import toast from 'react-hot-toast'

interface JobCardProps {
  job: Job
  index?: number
  compareMode?: boolean
  isCompared?: boolean
  onCompareToggle?: () => void
}

const tagColors: Record<string, string> = {
  Remote:          'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
  'Urgent Hiring': 'bg-red-500/15 text-red-400 border-red-500/25',
  Startup:         'bg-yellow-500/15 text-yellow-400 border-yellow-500/25',
  MNC:             'bg-blue-500/15 text-blue-400 border-blue-500/25',
  Internship:      'bg-purple-500/15 text-purple-400 border-purple-500/25',
  'Full Time':     'bg-cyan-500/15 text-cyan-400 border-cyan-500/25',
  Hybrid:          'bg-orange-500/15 text-orange-400 border-orange-500/25',
  Contract:        'bg-pink-500/15 text-pink-400 border-pink-500/25',
}

function fitLabel(score: number) {
  if (score >= 85) return { label: 'Strong Fit', color: 'text-emerald-400 bg-emerald-500/15 border-emerald-500/25' }
  if (score >= 70) return { label: 'Good Fit',   color: 'text-blue-400 bg-blue-500/15 border-blue-500/25' }
  if (score >= 55) return { label: 'Partial Fit', color: 'text-yellow-400 bg-yellow-500/15 border-yellow-500/25' }
  return { label: 'Weak Fit', color: 'text-red-400 bg-red-500/15 border-red-500/25' }
}

export default function JobCard({ job, index = 0, compareMode, isCompared, onCompareToggle }: JobCardProps) {
  const [expanded, setExpanded]     = useState(false)
  const [shortlisted, setShortlisted] = useState(job.status === 'shortlisted')
  const qc = useQueryClient()
  const ring   = getMatchRingColor(job.match_score ?? 0)
  const score  = job.match_score ?? 0
  const fit    = fitLabel(score)
  const isUrgent = (job.smart_tags ?? []).includes('Urgent Hiring')

  const shortlistMutation = useMutation({
    mutationFn: async () => {
      const newStatus = shortlisted ? 'new' : 'shortlisted'
      await api.patch(`/api/jobs/${job.id}`, { status: newStatus })
      return newStatus
    },
    onSuccess: (newStatus) => {
      setShortlisted(newStatus === 'shortlisted')
      qc.invalidateQueries({ queryKey: ['jobs'] })
      toast.success(newStatus === 'shortlisted' ? 'Added to shortlist' : 'Removed from shortlist')
    },
  })

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.03 }}
      className={cn(
        'glass rounded-2xl border transition-all overflow-hidden group relative',
        isCompared
          ? 'border-indigo-500/50 ring-1 ring-indigo-500/25'
          : 'border-border hover:border-accent/30 hover:shadow-lg hover:shadow-black/20'
      )}
    >
      {/* Top color accent */}
      <div className="h-0.5 w-full" style={{ background: `linear-gradient(90deg, ${ring}, transparent)` }} />

      {/* Urgent badge */}
      {isUrgent && (
        <div className="absolute top-3 right-3 z-10">
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 border border-red-500/30 font-medium animate-pulse">
            Urgent
          </span>
        </div>
      )}

      {/* Compare checkbox */}
      <button
        onClick={e => { e.preventDefault(); onCompareToggle?.() }}
        className={cn(
          'absolute top-3 left-3 z-10 w-5 h-5 rounded border transition-all flex items-center justify-center',
          compareMode || isCompared ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
          isCompared ? 'bg-indigo-500 border-indigo-500' : 'bg-foreground/5 border-border hover:border-foreground/30'
        )}
      >
        {isCompared && <CheckCircle className="w-3 h-3 text-white" />}
      </button>

      <div className="p-4 space-y-3">
        {/* Header: title + score ring */}
        <div className="flex items-start justify-between gap-2 pt-1">
          <div className="flex-1 min-w-0">
            <h3 className="text-foreground font-semibold text-sm leading-tight truncate group-hover:text-indigo-300 transition-colors pr-1">
              {job.title}
            </h3>
            <div className="flex items-center gap-1.5 mt-1">
              <Building2 className="w-3 h-3 text-muted-foreground shrink-0" />
              <span className="text-muted-foreground text-xs truncate">{job.company}</span>
              {(job.confidence_score ?? 0) >= 70 && (
                <span className="shrink-0 text-[9px] px-1 py-0.5 rounded bg-blue-500/15 text-blue-400 border border-blue-500/20">
                  ✓ Verified
                </span>
              )}
            </div>
          </div>

          {/* Match ring */}
          <div className="shrink-0">
            <div className="relative">
              <svg width="48" height="48" viewBox="0 0 48 48">
                <circle cx="24" cy="24" r="20" fill="none" stroke="var(--border)" strokeWidth="3" />
                <circle
                  cx="24" cy="24" r="20" fill="none"
                  stroke={ring} strokeWidth="3" strokeLinecap="round"
                  strokeDasharray={`${2 * Math.PI * 20}`}
                  strokeDashoffset={`${2 * Math.PI * 20 * (1 - score / 100)}`}
                  transform="rotate(-90 24 24)"
                  style={{ transition: 'stroke-dashoffset 0.8s ease' }}
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-[11px] font-bold" style={{ color: ring }}>{score}%</span>
              </div>
            </div>
          </div>
        </div>

        {/* Fit label — prefer the 100-pt engine tier when present */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={cn('text-[10px] px-2 py-0.5 rounded-full border font-medium', fit.color)}>
            {job.match_tier || fit.label}
          </span>
          {job.experience_badge && (
            <span className={cn(
              'text-[10px] px-2 py-0.5 rounded-full border font-medium',
              job.experience_badge === 'Perfect Experience Match'
                ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                : job.experience_badge.startsWith('Needs')
                ? 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20'
                : 'text-amber-400 bg-amber-500/10 border-amber-500/20'
            )}>
              {job.experience_badge}
            </span>
          )}
          {job.apply_probability != null && (
            <span className="text-[10px] px-2 py-0.5 rounded-full border font-medium text-muted-foreground border-border"
              title="Estimate derived from the match score — not a guarantee">
              Apply: {job.apply_probability}%
            </span>
          )}
          {job.application_type && job.application_type !== 'email' && (
            <span className={cn(
              'text-[10px] px-2 py-0.5 rounded-full border font-medium',
              job.application_type === 'google_form' ? 'text-purple-400 bg-purple-500/10 border-purple-500/25'
              : job.application_type === 'linkedin' ? 'text-cyan-400 bg-cyan-500/10 border-cyan-500/25'
              : job.application_type === 'portal' ? 'text-blue-400 bg-blue-500/10 border-blue-500/25'
              : job.application_type === 'phone' ? 'text-amber-400 bg-amber-500/10 border-amber-500/25'
              : 'text-red-400 bg-red-500/10 border-red-500/25'
            )}>
              {job.application_type === 'google_form' ? 'Google Form'
                : job.application_type === 'linkedin' ? 'LinkedIn Apply'
                : job.application_type === 'portal' ? 'Company Portal'
                : job.application_type === 'phone' ? 'Phone Apply'
                : 'No Contact'}
            </span>
          )}
        </div>

        {/* Why this match — quick checklist from the engine's own breakdown */}
        {(job.match_breakdown?.length ?? 0) > 0 && (
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            {job.match_breakdown!.filter(b => b.available).slice(0, 4).map(b => {
              const strong = b.score / b.max >= 0.7
              return (
                <span key={b.key} className={cn('flex items-center gap-1 text-[10px]', strong ? 'text-emerald-400/80' : 'text-muted-foreground/60')}>
                  {strong ? <CheckCircle className="w-2.5 h-2.5" /> : <XCircle className="w-2.5 h-2.5" />}
                  {b.label}
                </span>
              )
            })}
          </div>
        )}

        <div className="flex items-center gap-1.5 flex-wrap">
          {(job.score_suggestions?.length ?? 0) > 0 && (
            <span
              className="text-[9px] text-purple-400/80"
              title={`Learn ${job.score_suggestions![0].skill} to raise your match to ${job.score_suggestions![0].projected}%`}
            >
              ↗ Learn {job.score_suggestions![0].skill}: {score}→{job.score_suggestions![0].projected}
            </span>
          )}
        </div>

        {/* Meta row */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          {job.location && (
            <span className="flex items-center gap-1">
              <MapPin className="w-3 h-3" />{job.location}
            </span>
          )}
          {job.location_type && (
            <span className={cn(
              'px-1.5 py-0.5 rounded text-[10px] border',
              job.location_type === 'remote' ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
              : job.location_type === 'hybrid' ? 'text-orange-400 bg-orange-500/10 border-orange-500/20'
              : 'text-muted-foreground bg-foreground/5 border-border'
            )}>
              {job.location_type.charAt(0).toUpperCase() + job.location_type.slice(1)}
            </span>
          )}
          {(job.experience_min != null || job.experience_max != null) && (
            <span className="flex items-center gap-1">
              <Briefcase className="w-3 h-3" />{job.experience_display ?? `${job.experience_min ?? 0}–${job.experience_max ?? '?'} yrs`}
            </span>
          )}
          {job.salary && (
            <span className="flex items-center gap-1 text-yellow-400/80">
              <DollarSign className="w-3 h-3" />{job.salary}
            </span>
          )}
          {job.freshness_score != null && (
            <span className="flex items-center gap-1 ml-auto">
              <Clock className="w-3 h-3" />{job.freshness_score}d ago
            </span>
          )}
        </div>

        {/* Tags */}
        {(job.smart_tags ?? []).length > 0 && (
          <div className="flex flex-wrap gap-1">
            {job.smart_tags.slice(0, 3).map(tag => (
              <span key={tag} className={cn('text-[10px] px-1.5 py-0.5 rounded-full border', tagColors[tag] ?? 'bg-foreground/5 text-muted-foreground border-border')}>
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Match breakdown */}
        <div className="space-y-1.5 border-t border-border pt-2">
          {(job.matched_skills ?? []).length > 0 && (
            <div className="flex items-start gap-1.5">
              <CheckCircle className="w-3 h-3 text-emerald-400 shrink-0 mt-0.5" />
              <div className="flex flex-wrap gap-1">
                {(job.matched_skills ?? []).slice(0, 4).map(s => (
                  <span key={s} className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.5 rounded">
                    {s}
                  </span>
                ))}
                {(job.matched_skills ?? []).length > 4 && (
                  <span className="text-[10px] text-emerald-400/60">+{(job.matched_skills ?? []).length - 4}</span>
                )}
              </div>
            </div>
          )}
          {(job.missing_skills ?? []).length > 0 && (
            <div className="flex items-start gap-1.5">
              <XCircle className="w-3 h-3 text-red-400 shrink-0 mt-0.5" />
              <div className="flex flex-wrap gap-1">
                {(job.missing_skills ?? []).slice(0, 3).map(s => (
                  <span key={s} className="text-[10px] bg-red-500/10 text-red-400 border border-red-500/20 px-1.5 py-0.5 rounded">
                    {s}
                  </span>
                ))}
                {(job.missing_skills ?? []).length > 3 && (
                  <span className="text-[10px] text-red-400/60">+{(job.missing_skills ?? []).length - 3} missing</span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* AI summary snippet */}
        {job.ai_summary && !expanded && (
          <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">
            <Zap className="w-2.5 h-2.5 text-purple-400 inline mr-1" />
            {job.ai_summary}
          </p>
        )}

        {/* Hover expand: extra info */}
        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="border-t border-border pt-2 space-y-1.5 overflow-hidden"
            >
              {job.contact_email && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Mail className="w-3 h-3" />{job.contact_email}
                </div>
              )}
              {(job as any).contact_phone && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Phone className="w-3 h-3" />{(job as any).contact_phone}
                </div>
              )}
              {job.description && (
                <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">{job.description}</p>
              )}
              {job.employment_type && (
                <span className="text-xs text-muted-foreground">Type: {job.employment_type}</span>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Expand toggle */}
        {(job.contact_email || job.description) && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="w-full flex items-center justify-center gap-1 text-[10px] text-muted-foreground/60 hover:text-muted-foreground transition-colors"
          >
            <ChevronDown className={cn('w-3 h-3 transition-transform', expanded && 'rotate-180')} />
            {expanded ? 'Less' : 'More details'}
          </button>
        )}

        {/* Action buttons */}
        <div className="grid grid-cols-2 gap-1.5 pt-1">
          <Link
            to={`/jobs/${job.id}`}
            className="flex items-center justify-center gap-1 py-2 rounded-xl glass border border-border text-xs text-muted-foreground hover:text-foreground hover:border-accent/30 transition-all"
          >
            <ExternalLink className="w-3 h-3" /> Details
          </Link>
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={() => shortlistMutation.mutate()}
            className={cn(
              'flex items-center justify-center gap-1 py-2 rounded-xl border text-xs transition-all',
              shortlisted
                ? 'bg-yellow-500/20 border-yellow-500/30 text-yellow-400'
                : 'bg-foreground/5 border-border text-muted-foreground hover:border-accent/30 hover:text-foreground'
            )}
          >
            <Star className={cn('w-3 h-3', shortlisted && 'fill-yellow-400')} />
            {shortlisted ? 'Saved' : 'Save'}
          </motion.button>
        </div>

        {/* Compare btn */}
        <button
          onClick={() => onCompareToggle?.()}
          className={cn(
            'w-full flex items-center justify-center gap-1.5 py-1.5 rounded-xl text-xs transition-all border',
            isCompared
              ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-400'
              : 'border-border text-muted-foreground/70 hover:text-muted-foreground hover:border-accent/20'
          )}
        >
          <GitCompare className="w-3 h-3" />
          {isCompared ? 'Remove from compare' : 'Add to compare'}
        </button>
      </div>
    </motion.div>
  )
}
