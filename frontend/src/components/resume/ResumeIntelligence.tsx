import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  Brain, TrendingUp, Flame, GitCompare, Lightbulb, Layers, Briefcase, Trophy,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts'
import ChartCard from '@/components/dashboard/ChartCard'
import { axisTick, gridStroke, ChartTooltip } from '@/components/dashboard/chartTheme'
import { cn } from '@/lib/utils'
import api from '@/lib/api'

interface Intelligence {
  versions: { id: string; name: string; ats_score: number; section_scores: Record<string, number> | null; strong_skills: string[]; has_sections: boolean }[]
  best_resume_id: string | null
  avg_ats: number
  trend: { date: string; score: number; resume: string }[]
  heatmap: { sections: string[]; rows: { resume: string; scores: (number | null)[] }[] } | null
  skill_gaps: { skill: string; importance: string; reason: string }[]
  role_recommendations: { role: string; match: number; reason: string }[]
  suggestions: string[]
  top_jobs: { id: string; title: string; company: string; match_score: number; match_tier: string | null }[]
}

interface Comparison {
  a: { id: string; name: string; ats_score: number }
  b: { id: string; name: string; ats_score: number }
  sections: { label: string; a: number | null; b: number | null }[]
  shared_skills: string[]
  only_a: string[]
  only_b: string[]
  verdict: string
}

function heatColor(v: number | null) {
  if (v == null) return 'color-mix(in srgb, var(--foreground) 3%, transparent)'
  const alpha = 0.12 + 0.7 * (v / 100)
  return v >= 75 ? `rgba(52,211,153,${alpha})` : v >= 50 ? `rgba(251,191,36,${alpha})` : `rgba(248,113,113,${alpha})`
}

export default function ResumeIntelligence() {
  const [cmpA, setCmpA] = useState('')
  const [cmpB, setCmpB] = useState('')

  const { data, isLoading } = useQuery<Intelligence>({
    queryKey: ['resume-intelligence'],
    queryFn: async () => (await api.get('/api/resumes/intelligence')).data,
  })

  const { data: cmp } = useQuery<Comparison>({
    queryKey: ['resume-compare', cmpA, cmpB],
    queryFn: async () => (await api.get(`/api/resumes/compare?a=${cmpA}&b=${cmpB}`)).data,
    enabled: !!cmpA && !!cmpB && cmpA !== cmpB,
  })

  if (!isLoading && (data?.versions.length ?? 0) === 0) return null
  const versions = data?.versions ?? []

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2.5 pt-2">
        <div className="w-8 h-8 rounded-lg bg-purple-500/15 border border-purple-500/25 flex items-center justify-center">
          <Brain className="w-4 h-4 text-purple-400" />
        </div>
        <div>
          <h2 className="text-foreground font-semibold">Resume Intelligence</h2>
          <p className="text-muted-foreground text-xs">AI section scores, trends and version comparison across your {versions.length} resume{versions.length !== 1 ? 's' : ''}</p>
        </div>
        {data && <span className="ml-auto text-xs text-muted-foreground">Avg ATS <span className="text-foreground font-bold">{data.avg_ats}</span></span>}
      </div>

      {/* Row: trend + heatmap */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <ChartCard title="ATS Trend" subtitle="Score across every analysis — your improvement timeline"
          icon={TrendingUp} loading={isLoading} empty={(data?.trend.length ?? 0) < 2}
          emptyLabel="Re-analyze a resume to start the trend" height={220}>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={data?.trend ?? []}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
              <XAxis dataKey="date" tick={{ ...axisTick, fontSize: 9 }} axisLine={false} tickLine={false} />
              <YAxis domain={[0, 100]} tick={axisTick} axisLine={false} tickLine={false} width={28} />
              <Tooltip content={<ChartTooltip />} />
              <Line type="monotone" dataKey="score" name="ATS" stroke="#c084fc" strokeWidth={2} dot={{ r: 3, fill: '#c084fc' }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Section Score Heatmap" subtitle="Where each version is strong or weak"
          icon={Flame} loading={isLoading} empty={!data?.heatmap}
          emptyLabel="Re-analyze resumes to generate section scores" height={220}>
          {data?.heatmap && (
            <div className="pt-1 overflow-x-auto">
              <div className="grid gap-1 min-w-[520px]"
                style={{ gridTemplateColumns: `110px repeat(${data.heatmap.sections.length}, 1fr)` }}>
                <span />
                {data.heatmap.sections.map(s => (
                  <span key={s} className="text-[8px] text-muted-foreground text-center leading-tight">{s}</span>
                ))}
                {data.heatmap.rows.map((row, ri) => (
                  [
                    <span key={`n${ri}`} className="text-[10px] text-muted-foreground truncate leading-7 pr-1">{row.resume}</span>,
                    ...row.scores.map((v, ci) => (
                      <div key={`${ri}-${ci}`} title={`${row.resume} · ${data.heatmap!.sections[ci]}: ${v ?? 'not analyzed'}`}
                        className="h-7 rounded-md border border-border flex items-center justify-center text-[9px] font-semibold text-foreground/80"
                        style={{ background: heatColor(v) }}>
                        {v ?? ''}
                      </div>
                    )),
                  ]
                ))}
              </div>
            </div>
          )}
        </ChartCard>
      </div>

      {/* Row: skill gaps + roles + top jobs */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        <ChartCard title="Skill Gaps" subtitle="Missing skills that matter, by priority"
          icon={Layers} loading={isLoading} empty={!data?.skill_gaps?.length} height={200}>
          <div className="space-y-2 pt-1">
            {(data?.skill_gaps ?? []).slice(0, 6).map(g => (
              <div key={g.skill} className="flex items-start gap-2">
                <span className={cn('shrink-0 text-[9px] px-1.5 py-0.5 rounded-full border font-medium mt-0.5',
                  g.importance === 'high'
                    ? 'text-red-400 bg-red-500/10 border-red-500/25'
                    : 'text-yellow-400 bg-yellow-500/10 border-yellow-500/25')}>
                  {g.importance}
                </span>
                <div className="min-w-0">
                  <p className="text-xs text-foreground/80 font-medium">{g.skill}</p>
                  {g.reason && <p className="text-[10px] text-muted-foreground leading-snug">{g.reason}</p>}
                </div>
              </div>
            ))}
          </div>
        </ChartCard>

        <ChartCard title="Role Recommendations" subtitle="Where this resume competes best"
          icon={Trophy} loading={isLoading} empty={!data?.role_recommendations?.length}
          emptyLabel="Re-analyze your resume to get role fits" height={200}>
          <div className="space-y-2.5 pt-1">
            {(data?.role_recommendations ?? []).slice(0, 4).map(r => (
              <div key={r.role}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-foreground/80 font-medium">{r.role}</span>
                  <span className={cn('font-bold', r.match >= 80 ? 'text-emerald-400' : r.match >= 60 ? 'text-yellow-400' : 'text-muted-foreground')}>{r.match}%</span>
                </div>
                <div className="h-1.5 bg-foreground/5 rounded-full overflow-hidden">
                  <motion.div initial={{ width: 0 }} animate={{ width: `${r.match}%` }} transition={{ duration: 0.5 }}
                    className="h-full rounded-full bg-gradient-to-r from-purple-500 to-indigo-500" />
                </div>
              </div>
            ))}
          </div>
        </ChartCard>

        <ChartCard title="Top Matching Jobs" subtitle="Best openings for your profile right now"
          icon={Briefcase} loading={isLoading} empty={!data?.top_jobs?.length} height={200}>
          <div className="space-y-1.5 pt-1">
            {(data?.top_jobs ?? []).map(j => (
              <Link key={j.id} to={`/jobs/${j.id}`}
                className="flex items-center justify-between gap-2 p-2 rounded-lg hover:bg-foreground/[0.04] transition-colors group">
                <div className="min-w-0">
                  <p className="text-xs text-foreground/80 truncate group-hover:text-indigo-300">{j.title}</p>
                  <p className="text-[10px] text-muted-foreground truncate">{j.company}{j.match_tier ? ` · ${j.match_tier}` : ''}</p>
                </div>
                <span className={cn('shrink-0 text-xs font-bold', j.match_score >= 80 ? 'text-emerald-400' : j.match_score >= 60 ? 'text-yellow-400' : 'text-muted-foreground')}>
                  {j.match_score}%
                </span>
              </Link>
            ))}
          </div>
        </ChartCard>
      </div>

      {/* Compare */}
      {versions.length >= 2 && (
        <div className="glass rounded-2xl border border-border p-5 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="text-foreground font-semibold text-sm flex items-center gap-2">
              <GitCompare className="w-4 h-4 text-indigo-400" /> Compare Versions
            </h3>
            {[['A', cmpA, setCmpA], ['B', cmpB, setCmpB]].map(([label, val, set]: any) => (
              <select key={label} value={val} onChange={e => set(e.target.value)}
                className="glass rounded-lg px-2.5 py-1.5 text-xs text-muted-foreground border border-border focus:border-indigo-500/40 focus:outline-none">
                <option value="" className="bg-card">Resume {label}…</option>
                {versions.map(v => (
                  <option key={v.id} value={v.id} className="bg-card">{v.name} (ATS {v.ats_score})</option>
                ))}
              </select>
            ))}
          </div>

          {cmp && (
            <div className="space-y-3">
              <p className="text-xs text-emerald-300 bg-emerald-500/8 border border-emerald-500/20 rounded-lg p-2.5">🏆 {cmp.verdict}</p>
              <div className="grid grid-cols-[1fr_60px_60px] gap-x-3 gap-y-1.5 text-xs max-w-md">
                <span className="text-muted-foreground" /><span className="text-muted-foreground text-center truncate">{cmp.a.name.slice(0, 10)}</span><span className="text-muted-foreground text-center truncate">{cmp.b.name.slice(0, 10)}</span>
                <span className="text-muted-foreground font-medium">Overall ATS</span>
                <span className={cn('text-center font-bold', cmp.a.ats_score >= cmp.b.ats_score ? 'text-emerald-400' : 'text-muted-foreground')}>{cmp.a.ats_score}</span>
                <span className={cn('text-center font-bold', cmp.b.ats_score >= cmp.a.ats_score ? 'text-emerald-400' : 'text-muted-foreground')}>{cmp.b.ats_score}</span>
                {cmp.sections.map(s => (
                  [
                    <span key={s.label} className="text-muted-foreground">{s.label}</span>,
                    <span key={s.label + 'a'} className={cn('text-center', s.a != null && s.b != null && s.a >= s.b ? 'text-emerald-400' : 'text-muted-foreground')}>{s.a ?? '—'}</span>,
                    <span key={s.label + 'b'} className={cn('text-center', s.a != null && s.b != null && s.b >= s.a ? 'text-emerald-400' : 'text-muted-foreground')}>{s.b ?? '—'}</span>,
                  ]
                ))}
              </div>
              {(cmp.only_a.length > 0 || cmp.only_b.length > 0) && (
                <div className="flex flex-wrap gap-x-6 gap-y-2 text-[10px]">
                  {cmp.only_a.length > 0 && (
                    <span className="text-muted-foreground">Only in A: {cmp.only_a.map(s => (
                      <span key={s} className="ml-1 px-1.5 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/20 text-cyan-300">{s}</span>
                    ))}</span>
                  )}
                  {cmp.only_b.length > 0 && (
                    <span className="text-muted-foreground">Only in B: {cmp.only_b.map(s => (
                      <span key={s} className="ml-1 px-1.5 py-0.5 rounded bg-purple-500/10 border border-purple-500/20 text-purple-300">{s}</span>
                    ))}</span>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* AI suggestions strip */}
      {(data?.suggestions?.length ?? 0) > 0 && (
        <div className="glass rounded-2xl border border-border p-5">
          <h3 className="text-foreground font-semibold text-sm flex items-center gap-2 mb-3">
            <Lightbulb className="w-4 h-4 text-yellow-400" /> AI Improvement Suggestions
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {data!.suggestions.slice(0, 6).map((s, i) => (
              <div key={i} className="flex items-start gap-2 text-xs text-muted-foreground p-2 rounded-lg bg-foreground/[0.02] border border-border">
                <span className="text-yellow-400/80 shrink-0">{i + 1}.</span>{s}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
