import { motion } from 'framer-motion'
import {
  GraduationCap, Briefcase, FolderGit2, Award, Layers, Mail, Phone, MapPin,
  User as UserIcon, ExternalLink, Clock,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Resume } from '@/types'

const CATEGORY_COLORS: Record<string, string> = {
  Programming: 'bg-indigo-500/10 text-indigo-300 border-indigo-500/20',
  Framework: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/20',
  Cloud: 'bg-amber-500/10 text-amber-300 border-amber-500/20',
  'AI/ML': 'bg-purple-500/10 text-purple-300 border-purple-500/20',
  Tool: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20',
  'Soft Skill': 'bg-pink-500/10 text-pink-300 border-pink-500/20',
}

const CATEGORY_ORDER = ['Programming', 'Framework', 'Cloud', 'AI/ML', 'Tool', 'Soft Skill']

/** Resume Intelligence Engine breakdown: everything the AI extracted, structured. */
export default function ResumeDeepDive({ resume }: { resume: Resume }) {
  const hasAnyDeepData = !!(
    resume.education?.length || resume.experience_entries?.length ||
    resume.projects_extracted?.length || resume.certificates_extracted?.length ||
    resume.skill_intelligence?.length
  )
  if (!hasAnyDeepData) return null

  const skillsByCategory: Record<string, typeof resume.skill_intelligence> = {}
  for (const s of resume.skill_intelligence ?? []) {
    if (!skillsByCategory[s.category]) skillsByCategory[s.category] = []
    skillsByCategory[s.category]!.push(s)
  }

  return (
    <div className="space-y-4">
      {/* Contact + total experience */}
      {(resume.contact_info || resume.total_experience_computed) && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className="glass rounded-2xl border border-border p-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
          {resume.contact_info?.name && <span className="flex items-center gap-1.5"><UserIcon className="w-3.5 h-3.5" />{resume.contact_info.name}</span>}
          {resume.contact_info?.phone && <span className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" />{resume.contact_info.phone}</span>}
          {resume.contact_info?.email && <span className="flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" />{resume.contact_info.email}</span>}
          {resume.contact_info?.location && <span className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" />{resume.contact_info.location}</span>}
          {resume.total_experience_computed && (
            <span className="ml-auto flex items-center gap-1.5 text-emerald-400 font-medium">
              <Clock className="w-3.5 h-3.5" /> {resume.total_experience_computed} total experience
              <span className="text-muted-foreground font-normal">(auto-computed)</span>
            </span>
          )}
        </motion.div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Education */}
        {(resume.education?.length ?? 0) > 0 && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
            className="glass rounded-2xl border border-border p-5">
            <h3 className="text-foreground font-semibold text-sm flex items-center gap-2 mb-3">
              <GraduationCap className="w-4 h-4 text-indigo-400" /> Education
            </h3>
            <div className="space-y-3">
              {resume.education!.map((e, i) => (
                <div key={i} className="text-sm">
                  <p className="text-foreground/85 font-medium">{e.degree}</p>
                  <p className="text-muted-foreground text-xs mt-0.5">
                    {e.college}
                    {e.cgpa != null && <span> · CGPA {e.cgpa}</span>}
                    {e.year != null && <span> · {e.year}</span>}
                  </p>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Certificates */}
        {(resume.certificates_extracted?.length ?? 0) > 0 && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
            className="glass rounded-2xl border border-border p-5">
            <h3 className="text-foreground font-semibold text-sm flex items-center gap-2 mb-3">
              <Award className="w-4 h-4 text-emerald-400" /> Certificates
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {resume.certificates_extracted!.map((c, i) => (
                <div key={i} className="rounded-xl border border-border bg-foreground/[0.02] p-2.5 text-xs">
                  <p className="text-foreground/85 font-medium truncate">{c.name}</p>
                  {c.issuer && <p className="text-muted-foreground mt-0.5">{c.issuer}</p>}
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </div>

      {/* Experience timeline */}
      {(resume.experience_entries?.length ?? 0) > 0 && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
          className="glass rounded-2xl border border-border p-5">
          <h3 className="text-foreground font-semibold text-sm flex items-center gap-2 mb-4">
            <Briefcase className="w-4 h-4 text-cyan-400" /> Experience Timeline
          </h3>
          <div className="space-y-0">
            {resume.experience_entries!.map((e, i, arr) => (
              <div key={i} className={cn('relative pl-5 pb-4', i < arr.length - 1 && 'border-l border-border')}>
                <div className="absolute -left-[5px] top-0.5 w-2.5 h-2.5 rounded-full bg-cyan-500 border-2 border-card" />
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div>
                    <p className="text-sm text-foreground/85 font-medium">{e.role}</p>
                    <p className="text-xs text-muted-foreground">{e.company} · {e.start} – {e.current ? 'Present' : e.end}</p>
                  </div>
                  {e.duration && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/25 text-cyan-300 font-medium shrink-0">
                      {e.duration}
                    </span>
                  )}
                </div>
                {(e.responsibilities?.length ?? 0) > 0 && (
                  <ul className="mt-1.5 space-y-0.5">
                    {e.responsibilities.map((r, ri) => (
                      <li key={ri} className="text-xs text-muted-foreground flex items-start gap-1.5">
                        <span className="text-muted-foreground/60 mt-0.5">–</span>{r}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Skill Intelligence — grouped by category */}
      {(resume.skill_intelligence?.length ?? 0) > 0 && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
          className="glass rounded-2xl border border-border p-5">
          <h3 className="text-foreground font-semibold text-sm flex items-center gap-2 mb-4">
            <Layers className="w-4 h-4 text-purple-400" /> Skill Intelligence
          </h3>
          <div className="space-y-3">
            {CATEGORY_ORDER.filter(cat => skillsByCategory[cat]?.length).map(cat => (
              <div key={cat}>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5">{cat}</p>
                <div className="flex flex-wrap gap-1.5">
                  {skillsByCategory[cat]!.map(s => (
                    <span key={s.skill}
                      title={[
                        s.years != null ? `${s.years} yr${s.years !== 1 ? 's' : ''}` : null,
                        s.confidence != null ? `${s.confidence}% confidence` : null,
                        s.last_used ? `last used ${s.last_used}` : null,
                      ].filter(Boolean).join(' · ')}
                      className={cn('text-xs px-2.5 py-1 rounded-full border flex items-center gap-1.5', CATEGORY_COLORS[cat])}>
                      {s.skill}
                      {s.years != null && <span className="opacity-60 text-[10px]">{s.years}y</span>}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Projects */}
      {(resume.projects_extracted?.length ?? 0) > 0 && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}
          className="glass rounded-2xl border border-border p-5">
          <h3 className="text-foreground font-semibold text-sm flex items-center gap-2 mb-3">
            <FolderGit2 className="w-4 h-4 text-yellow-400" /> Projects
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {resume.projects_extracted!.map((p, i) => (
              <div key={i} className="rounded-xl border border-border bg-foreground/[0.02] p-3 space-y-1.5">
                <p className="text-sm text-foreground/85 font-medium">{p.name}</p>
                {p.description && <p className="text-xs text-muted-foreground leading-relaxed">{p.description}</p>}
                {(p.tech?.length ?? 0) > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {p.tech!.map(t => <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-foreground/5 border border-border text-muted-foreground">{t}</span>)}
                  </div>
                )}
                {(p.github || p.live) && (
                  <div className="flex gap-3 pt-0.5">
                    {p.github && <a href={p.github.startsWith('http') ? p.github : `https://${p.github}`} target="_blank" rel="noopener noreferrer" className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1"><FolderGit2 className="w-3 h-3" /> GitHub</a>}
                    {p.live && <a href={p.live.startsWith('http') ? p.live : `https://${p.live}`} target="_blank" rel="noopener noreferrer" className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1"><ExternalLink className="w-3 h-3" /> Live</a>}
                  </div>
                )}
              </div>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  )
}
