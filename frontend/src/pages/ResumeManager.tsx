import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { FileText, Plus, Zap, CheckCircle, XCircle, AlertCircle, Upload, Trash2, Briefcase, TrendingUp } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { cn } from '@/lib/utils'
import { EmptyState, LoadingCards } from '@/components/ui/EmptyState'
import api from '@/lib/api'
import toast from 'react-hot-toast'
import type { Resume } from '@/types'
import ResumeIntelligence from '@/components/resume/ResumeIntelligence'

function HealthWidget({ label, score, highlight = false }: { label: string; score: number; highlight?: boolean }) {
  const color = score >= 90 ? 'text-emerald-400' : score >= 75 ? 'text-yellow-400' : 'text-red-400'
  const bgColor = highlight ? 'bg-indigo-500/20 border-indigo-500/30' : 'bg-white/5 border-white/10'
  
  return (
    <div className={cn('glass rounded-xl border p-3 text-center', bgColor, highlight && 'ring-2 ring-indigo-500/20')}>
      <p className="text-xs text-white/50 mb-1">{label}</p>
      <p className={cn('text-xl font-bold', color)}>{score}</p>
    </div>
  )
}

function InsightCard({ title, icon: Icon, color, items, emptyText }: {
  title: string
  icon: any
  color: 'emerald' | 'red' | 'yellow' | 'purple' | 'indigo'
  items: string[]
  emptyText: string
}) {
  const colorMap = {
    emerald: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20',
    red: 'bg-red-500/10 text-red-300 border-red-500/20',
    yellow: 'bg-yellow-500/10 text-yellow-300 border-yellow-500/20',
    purple: 'bg-purple-500/10 text-purple-300 border-purple-500/20',
    indigo: 'bg-indigo-500/10 text-indigo-300 border-indigo-500/20',
  }
  const iconColorMap = {
    emerald: 'text-emerald-400',
    red: 'text-red-400',
    yellow: 'text-yellow-400',
    purple: 'text-purple-400',
    indigo: 'text-indigo-400',
  }

  return (
    <div className="glass rounded-2xl border border-white/10 p-5">
      <h3 className={cn('text-sm font-medium mb-3 flex items-center gap-2', iconColorMap[color])}>
        <Icon className="w-4 h-4" /> {title}
      </h3>
      {!items?.length ? (
        <p className="text-xs text-white/30">{emptyText}</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {items.map((item, i) => (
            <span key={i} className={cn('text-xs px-2.5 py-1 rounded-full', colorMap[color])}>{item}</span>
          ))}
        </div>
      )}
    </div>
  )
}

export default function ResumeManager() {
  const qc = useQueryClient()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedJob, setSelectedJob] = useState<string | null>(null)

  const { data: resumes, isLoading, error } = useQuery<Resume[]>({
    queryKey: ['resumes'],
    queryFn: async () => {
      const { data } = await api.get('/api/resumes/')
      return data
    },
    retry: 1,
  })

  const latestResume = resumes?.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())[0]

  const { data: recommendations } = useQuery({
    queryKey: ['resume-recommendations', latestResume?.id],
    queryFn: async () => {
      if (!latestResume?.id) return []
      const { data } = await api.get(`/api/resumes/${latestResume.id}/recommendations`)
      return data.recommendations || []
    },
    enabled: !!latestResume?.id,
  })

  const { data: jobAnalysis, isLoading: analyzingJob } = useQuery({
    queryKey: ['job-analysis', latestResume?.id, selectedJob],
    queryFn: async () => {
      if (!latestResume?.id || !selectedJob) return null
      const formData = new FormData()
      formData.append('job_title', selectedJob)
      const { data } = await api.post(`/api/resumes/${latestResume.id}/analyze-for-job`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      return data
    },
    enabled: !!latestResume?.id && !!selectedJob,
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/resumes/${id}`),
    onSuccess: () => {
      toast.success('Resume deleted')
      qc.invalidateQueries({ queryKey: ['resumes'] })
      setSelectedId(null)
    },
  })

  const analyzeMutation = useMutation({
    mutationFn: (id: string) => api.post(`/api/resumes/${id}/analyze`),
    onSuccess: () => {
      toast.success('Analysis complete!')
      qc.invalidateQueries({ queryKey: ['resumes'] })
    },
    onError: () => toast.error('Analysis failed'),
  })

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const fd = new FormData()
    fd.append('file', file)
    try {
      await api.post('/api/resumes/upload', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      toast.success('Resume uploaded and analyzed!')
      qc.invalidateQueries({ queryKey: ['resumes'] })
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Upload failed')
    }
  }

  const resume = resumes?.find((r) => r.id === selectedId) ?? resumes?.[0]
  const atsColor = !resume ? '#6b7280' : resume.ats_score >= 90 ? '#10b981' : resume.ats_score >= 75 ? '#3b82f6' : '#f59e0b'

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Resume Manager</h1>
        <p className="text-white/40 text-sm mt-0.5">Manage, analyze, and improve your resumes</p>
      </div>

      {isLoading ? (
        <LoadingCards count={2} />
      ) : error ? (
        <div className="flex-1">
          <EmptyState
            icon={AlertCircle}
            title="Failed to load resumes"
            description="There was an error loading your resumes. Please try again."
            action={
              <button
                onClick={() => qc.invalidateQueries({ queryKey: ['resumes'] })}
                className="mt-4 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors"
              >
                Retry
              </button>
            }
          />
        </div>
      ) : (
        <div className="flex gap-6 min-w-0">
          {/* Resume List */}
          <div className="w-52 shrink-0 space-y-3">
            <label className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl glass border border-dashed border-white/20 text-sm text-white/50 hover:text-white/70 hover:border-white/30 transition-all cursor-pointer">
              <Plus className="w-4 h-4" />
              Add Resume
              <input type="file" accept=".pdf" className="hidden" onChange={handleUpload} />
            </label>

            {!resumes?.length ? (
              <p className="text-xs text-white/30 text-center pt-4">No resumes yet</p>
            ) : (
              <>
                {/* Show only the most recent resume */}
                {(() => {
                  const latestResume = resumes.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())[0]
                  return (
                    <motion.button
                      key={latestResume.id}
                      onClick={() => setSelectedId(latestResume.id)}
                      whileHover={{ x: 2 }}
                      className={cn(
                        'w-full text-left p-3 rounded-xl border transition-all',
                        selectedId === latestResume.id
                          ? 'glass border-indigo-500/30 bg-indigo-500/10'
                          : 'glass border-white/10 hover:border-white/20'
                      )}
                    >
                      <div className="flex items-center gap-2.5">
                        <FileText className={cn('w-4 h-4 shrink-0', selectedId === latestResume.id ? 'text-indigo-400' : 'text-white/40')} />
                        <div className="min-w-0">
                          <p className={cn('text-sm font-medium truncate', selectedId === latestResume.id ? 'text-indigo-300' : 'text-white/70')}>
                            {latestResume.name}
                          </p>
                          <p className="text-xs text-white/30 mt-0.5">ATS: {latestResume.ats_score ?? '—'}/100</p>
                        </div>
                      </div>
                    </motion.button>
                  )
                })()}
              </>
            )}

            {/* AI Recommended Jobs */}
            {recommendations && recommendations.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 px-2">
                  <Briefcase className="w-4 h-4 text-purple-400" />
                  <span className="text-xs font-medium text-white/60">Recommended Jobs</span>
                </div>
                {recommendations.slice(0, 6).map((rec: any) => (
                  <motion.button
                    key={rec.title}
                    onClick={() => setSelectedJob(rec.title)}
                    whileHover={{ x: 2 }}
                    className={cn(
                      'w-full text-left p-2.5 rounded-xl border transition-all',
                      selectedJob === rec.title
                        ? 'glass border-purple-500/30 bg-purple-500/10'
                        : 'glass border-white/10 hover:border-white/20'
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <div className="min-w-0 flex-1">
                        <p className={cn('text-xs font-medium truncate', selectedJob === rec.title ? 'text-purple-300' : 'text-white/70')}>
                          {rec.title}
                        </p>
                      </div>
                      <span className={cn(
                        'text-xs font-bold ml-2 shrink-0',
                        rec.match_score >= 90 ? 'text-emerald-400' : rec.match_score >= 75 ? 'text-yellow-400' : 'text-red-400'
                      )}>
                        {rec.match_score}%
                      </span>
                    </div>
                  </motion.button>
                ))}
              </div>
            )}
          </div>

          {/* Resume Detail */}
          {!resume ? (
            <div className="flex-1">
              <EmptyState
                icon={FileText}
                title="No resume selected"
                description="Upload a PDF resume — AI will analyze it for ATS score, missing keywords, and skill gaps."
              />
            </div>
          ) : (
            <AnimatePresence mode="wait">
              <motion.div
                key={selectedJob || resume.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="flex-1 min-w-0 space-y-4 overflow-hidden"
              >
                {/* Header */}
                <div className="glass rounded-2xl border border-white/10 p-5">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="flex-1">
                      <h2 className="text-xl font-bold text-white">
                        {selectedJob ? `Analysis for: ${selectedJob}` : resume.name}
                      </h2>
                      <p className="text-white/40 text-sm mt-1">
                        {selectedJob ? `Resume: ${resume.name}` : `Last updated: ${new Date(resume.updated_at).toLocaleDateString()}`}
                      </p>

                      <div className="flex gap-3 mt-4 flex-wrap">
                        <label className="flex items-center gap-2 px-4 py-2 rounded-xl glass border border-white/15 text-sm text-white/70 hover:text-white transition-all cursor-pointer">
                          <Upload className="w-4 h-4" />
                          Upload New
                          <input type="file" accept=".pdf" className="hidden" onChange={handleUpload} />
                        </label>
                        <motion.button
                          whileTap={{ scale: 0.97 }}
                          onClick={() => analyzeMutation.mutate(resume.id)}
                          disabled={analyzeMutation.isPending}
                          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-purple-500/20 border border-purple-500/30 text-sm text-purple-400 hover:bg-purple-500/30 transition-all disabled:opacity-60"
                        >
                          <Zap className={cn('w-4 h-4', analyzeMutation.isPending && 'animate-pulse')} />
                          {analyzeMutation.isPending ? 'Analyzing...' : 'Re-Analyze'}
                        </motion.button>
                        <motion.button
                          whileTap={{ scale: 0.97 }}
                          onClick={() => deleteMutation.mutate(resume.id)}
                          disabled={deleteMutation.isPending}
                          className="p-2 rounded-xl glass border border-white/10 text-white/30 hover:text-red-400 hover:border-red-500/20 transition-all disabled:opacity-60"
                        >
                          <Trash2 className="w-4 h-4" />
                        </motion.button>
                      </div>
                    </div>

                    {/* ATS Ring */}
                    <div className="shrink-0">
                      <div className="relative">
                        <svg width="100" height="100" viewBox="0 0 100 100">
                          <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="5" />
                          <circle
                            cx="50" cy="50" r="42" fill="none"
                            stroke={atsColor} strokeWidth="5" strokeLinecap="round"
                            strokeDasharray={`${2 * Math.PI * 42}`}
                            strokeDashoffset={`${2 * Math.PI * 42 * (1 - (jobAnalysis?.ats_score ?? resume.ats_score ?? 0) / 100)}`}
                            transform="rotate(-90 50 50)"
                            style={{ transition: 'stroke-dashoffset 1s ease' }}
                          />
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                          <span className="text-2xl font-bold" style={{ color: atsColor }}>{jobAnalysis?.ats_score ?? resume.ats_score ?? '—'}</span>
                          <span className="text-xs text-white/30">/ 100</span>
                          <span className="text-xs text-white/40 mt-0.5">ATS Score</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {analyzingJob ? (
                  <div className="glass rounded-2xl border border-white/10 p-8 text-center">
                    <div className="w-12 h-12 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin mx-auto mb-4" />
                    <p className="text-white/60">Analyzing resume for {selectedJob}...</p>
                  </div>
                ) : jobAnalysis ? (
                  /* Job-specific analysis */
                  <div className="space-y-4">
                    {/* Resume Health Widgets */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <HealthWidget label="ATS" score={jobAnalysis.ats_score} />
                      <HealthWidget label="Keyword" score={jobAnalysis.keyword_score} />
                      <HealthWidget label="Project" score={jobAnalysis.project_score} />
                      <HealthWidget label="Format" score={jobAnalysis.formatting_score} />
                      <HealthWidget label="Readability" score={jobAnalysis.readability_score} />
                      <HealthWidget label="Impact" score={jobAnalysis.impact_score} />
                      <HealthWidget label="Grammar" score={jobAnalysis.grammar_score} />
                      <HealthWidget label="Overall" score={jobAnalysis.overall_health} highlight />
                    </div>

                    {/* Matched vs Missing Skills */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <InsightCard
                        title="Matched Skills"
                        icon={CheckCircle}
                        color="emerald"
                        items={jobAnalysis.matched_skills ?? []}
                        emptyText="No matched skills"
                      />
                      <InsightCard
                        title="Missing Skills"
                        icon={XCircle}
                        color="red"
                        items={jobAnalysis.missing_skills ?? []}
                        emptyText="None — great job!"
                      />
                    </div>

                    {/* Project Relevance */}
                    {jobAnalysis.project_relevance && (
                      <div className="glass rounded-2xl border border-white/10 p-5">
                        <h3 className="text-white text-sm font-medium mb-3">Project Analysis</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <p className="text-xs text-emerald-400 mb-2">Relevant Projects</p>
                            <div className="flex flex-wrap gap-2">
                              {(jobAnalysis.project_relevance.relevant || []).map((proj: string) => (
                                <span key={proj} className="text-xs bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 px-2 py-1 rounded-full">{proj}</span>
                              ))}
                            </div>
                          </div>
                          <div>
                            <p className="text-xs text-yellow-400 mb-2">Suggested Projects</p>
                            <div className="flex flex-wrap gap-2">
                              {(jobAnalysis.project_relevance.suggested || []).map((proj: string) => (
                                <span key={proj} className="text-xs bg-yellow-500/10 text-yellow-300 border border-yellow-500/20 px-2 py-1 rounded-full">{proj}</span>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Experience & Education Match */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="glass rounded-2xl border border-white/10 p-4">
                        <h3 className="text-white text-sm font-medium mb-2">Experience Match</h3>
                        <p className="text-xs text-white/60">{jobAnalysis.experience_match}</p>
                      </div>
                      <div className="glass rounded-2xl border border-white/10 p-4">
                        <h3 className="text-white text-sm font-medium mb-2">Education Match</h3>
                        <p className="text-xs text-white/60">{jobAnalysis.education_match}</p>
                      </div>
                    </div>

                    {/* Prioritized Suggestions */}
                    {jobAnalysis.suggestions && jobAnalysis.suggestions.length > 0 && (
                      <div className="glass rounded-2xl border border-white/10 p-5">
                        <h3 className="text-white text-sm font-medium mb-3">AI Suggestions</h3>
                        <div className="space-y-2">
                          {jobAnalysis.suggestions.map((s: any, i: number) => (
                            <div key={i} className="flex items-start gap-2">
                              <span className={cn(
                                'text-xs px-2 py-0.5 rounded-full shrink-0',
                                s.priority === 'high' ? 'bg-red-500/20 text-red-400' : 
                                s.priority === 'medium' ? 'bg-yellow-500/20 text-yellow-400' : 
                                'bg-blue-500/20 text-blue-400'
                              )}>
                                {s.priority}
                              </span>
                              <p className="text-xs text-white/60">{s.text}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  /* Generic resume analysis */
                  <>
                    {/* Insights */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <InsightCard
                        title="Strong Skills"
                        icon={CheckCircle}
                        color="emerald"
                        items={resume.strong_skills ?? []}
                        emptyText="No data yet"
                      />
                      <InsightCard
                        title="Missing Keywords"
                        icon={XCircle}
                        color="red"
                        items={resume.missing_keywords ?? []}
                        emptyText="None — great job!"
                      />
                      <InsightCard
                        title="Weak Sections"
                        icon={AlertCircle}
                        color="yellow"
                        items={resume.weak_sections ?? []}
                        emptyText="All sections strong!"
                      />
                    </div>

                    {/* Skill Gaps */}
                    {(resume as any).skill_gaps?.length > 0 && (
                      <div className="glass rounded-2xl border border-indigo-500/20 p-5">
                        <h3 className="text-indigo-400 text-sm font-medium mb-3">Skill Gap Analysis</h3>
                        <div className="flex flex-wrap gap-2">
                          {(resume as any).skill_gaps.map((gap: { skill: string; importance?: string; reason?: string }) => (
                            <span key={gap.skill} className="text-xs bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 px-2.5 py-1 rounded-full">{gap.skill}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* AI Suggestions */}
                    {(resume as any).suggestions?.length > 0 && (
                      <div className="glass rounded-2xl border border-purple-500/20 p-5">
                        <h3 className="text-purple-400 text-sm font-medium mb-3 flex items-center gap-2">
                          <Zap className="w-4 h-4" /> AI Suggestions
                        </h3>
                        <ul className="space-y-2">
                          {(resume as any).suggestions.map((s: string, i: number) => (
                            <li key={i} className="flex items-start gap-2 text-xs text-white/60">
                              <div className="w-1.5 h-1.5 rounded-full bg-purple-400/60 mt-1.5 shrink-0" />
                              {s}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </>
                )}
              </motion.div>
            </AnimatePresence>
          )}
        </div>
      )}

      {/* Resume Intelligence V2: trends, heatmap, gaps, roles, compare */}
      <ResumeIntelligence />
    </div>
  )
}
