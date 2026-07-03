import { motion } from 'framer-motion'
import { MapPin, Briefcase, Zap, CheckCircle, XCircle, ExternalLink, Clock, Star } from 'lucide-react'
import { cn, getMatchRingColor } from '@/lib/utils'
import type { Job } from '@/types'
import { Link } from 'react-router-dom'

interface JobCardProps {
  job: Job
  index?: number
}

const tagColors: Record<string, string> = {
  Remote: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
  'Urgent Hiring': 'bg-red-500/15 text-red-400 border-red-500/25',
  Startup: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/25',
  MNC: 'bg-blue-500/15 text-blue-400 border-blue-500/25',
  Internship: 'bg-purple-500/15 text-purple-400 border-purple-500/25',
  'Full Time': 'bg-cyan-500/15 text-cyan-400 border-cyan-500/25',
  Hybrid: 'bg-orange-500/15 text-orange-400 border-orange-500/25',
}

export default function JobCard({ job, index = 0 }: JobCardProps) {
  const ringColor = getMatchRingColor(job.match_score ?? 0)

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.04 }}
      whileHover={{ y: -3, transition: { duration: 0.15 } }}
      className="glass rounded-2xl border border-white/10 hover:border-white/20 transition-all group overflow-hidden"
    >
      {/* Top Color Accent */}
      <div
        className="h-0.5 w-full"
        style={{ background: `linear-gradient(90deg, ${ringColor}, transparent)` }}
      />

      <div className="p-5 space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h3 className="text-white font-semibold text-base truncate group-hover:text-blue-300 transition-colors">
              {job.title}
            </h3>
            <p className="text-white/50 text-sm mt-0.5">{job.company}</p>
          </div>

          {/* Match Score Ring */}
          <div className="shrink-0 flex items-center justify-center">
            <div className="relative">
              <svg width="52" height="52" viewBox="0 0 52 52">
                <circle cx="26" cy="26" r="22" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="3" />
                <circle
                  cx="26" cy="26" r="22" fill="none"
                  stroke={ringColor}
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeDasharray={`${2 * Math.PI * 22}`}
                  strokeDashoffset={`${2 * Math.PI * 22 * (1 - (job.match_score ?? 0) / 100)}`}
                  transform="rotate(-90 26 26)"
                  style={{ transition: 'stroke-dashoffset 0.8s ease' }}
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-xs font-bold" style={{ color: ringColor }}>
                  {job.match_score ?? 0}%
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Meta */}
        <div className="flex flex-wrap items-center gap-2 text-xs text-white/50">
          <span className="flex items-center gap-1">
            <MapPin className="w-3 h-3" />
            {job.location}
          </span>
          <span className="text-white/20">·</span>
          <span className="flex items-center gap-1">
            <Briefcase className="w-3 h-3" />
            {job.experience_min}-{job.experience_max} yrs
          </span>
          <span className="text-white/20">·</span>
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {job.freshness_score}d ago
          </span>
        </div>

        {/* Smart Tags */}
        {job.smart_tags?.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {job.smart_tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className={cn(
                  'text-xs px-2 py-0.5 rounded-full border',
                  tagColors[tag] ?? 'bg-white/5 text-white/50 border-white/10'
                )}
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* AI Match Insights */}
        <div className="space-y-2 pt-1">
          {(job.matched_skills ?? []).length > 0 && (
            <div className="flex items-start gap-2">
              <CheckCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
              <div className="flex flex-wrap gap-1">
                {(job.matched_skills ?? []).slice(0, 4).map((skill) => (
                  <span key={skill} className="text-xs bg-emerald-500/10 text-emerald-400 px-1.5 py-0.5 rounded">
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          )}
          {(job.missing_skills ?? []).length > 0 && (
            <div className="flex items-start gap-2">
              <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
              <div className="flex flex-wrap gap-1">
                {(job.missing_skills ?? []).slice(0, 3).map((skill) => (
                  <span key={skill} className="text-xs bg-red-500/10 text-red-400 px-1.5 py-0.5 rounded">
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* AI Summary snippet */}
        {job.ai_summary && (
          <p className="text-xs text-white/40 line-clamp-2 border-t border-white/5 pt-3">
            <Zap className="w-3 h-3 text-purple-400 inline mr-1" />
            {job.ai_summary}
          </p>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          <Link
            to={`/jobs/${job.id}`}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl glass border border-white/10 text-xs text-white/70 hover:text-white hover:border-white/20 transition-all"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            View Details
          </Link>
          <motion.button
            whileTap={{ scale: 0.95 }}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-blue-500/20 border border-blue-500/30 text-xs text-blue-400 hover:bg-blue-500/30 transition-all"
          >
            <Star className="w-3.5 h-3.5" />
            Quick Apply
          </motion.button>
        </div>
      </div>
    </motion.div>
  )
}
