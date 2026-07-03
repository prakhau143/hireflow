import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { FileText, Plus, Zap, CheckCircle, XCircle, AlertCircle, Upload, Trash2 } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { cn } from '@/lib/utils'
import { EmptyState, LoadingCards } from '@/components/ui/EmptyState'
import api from '@/lib/api'
import toast from 'react-hot-toast'
import type { Resume } from '@/types'

export default function ResumeManager() {
  const qc = useQueryClient()
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const { data: resumes, isLoading } = useQuery<Resume[]>({
    queryKey: ['resumes'],
    queryFn: async () => {
      const { data } = await api.get('/api/resumes/')
      return data
    },
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
              resumes.map((r) => (
                <motion.button
                  key={r.id}
                  onClick={() => setSelectedId(r.id)}
                  whileHover={{ x: 2 }}
                  className={cn(
                    'w-full text-left p-3 rounded-xl border transition-all',
                    (selectedId ?? resumes[0]?.id) === r.id
                      ? 'glass border-indigo-500/30 bg-indigo-500/10'
                      : 'glass border-white/10 hover:border-white/20'
                  )}
                >
                  <div className="flex items-center gap-2.5">
                    <FileText className={cn('w-4 h-4 shrink-0', (selectedId ?? resumes[0]?.id) === r.id ? 'text-indigo-400' : 'text-white/40')} />
                    <div className="min-w-0">
                      <p className={cn('text-sm font-medium truncate', (selectedId ?? resumes[0]?.id) === r.id ? 'text-indigo-300' : 'text-white/70')}>
                        {r.name}
                      </p>
                      <p className="text-xs text-white/30 mt-0.5">ATS: {r.ats_score ?? '—'}/100</p>
                    </div>
                  </div>
                </motion.button>
              ))
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
                key={resume.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="flex-1 min-w-0 space-y-4 overflow-hidden"
              >
                {/* ATS Score Card */}
                <div className="glass rounded-2xl border border-white/10 p-5">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="flex-1">
                      <h2 className="text-xl font-bold text-white">{resume.name}</h2>
                      <p className="text-white/40 text-sm mt-1">
                        Last updated: {new Date(resume.updated_at).toLocaleDateString()}
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
                            strokeDashoffset={`${2 * Math.PI * 42 * (1 - (resume.ats_score ?? 0) / 100)}`}
                            transform="rotate(-90 50 50)"
                            style={{ transition: 'stroke-dashoffset 1s ease' }}
                          />
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                          <span className="text-2xl font-bold" style={{ color: atsColor }}>{resume.ats_score ?? '—'}</span>
                          <span className="text-xs text-white/30">/ 100</span>
                          <span className="text-xs text-white/40 mt-0.5">ATS Score</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

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
                      {(resume as any).skill_gaps.map((gap: string) => (
                        <span key={gap} className="text-xs bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 px-2.5 py-1 rounded-full">{gap}</span>
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
              </motion.div>
            </AnimatePresence>
          )}
        </div>
      )}
    </div>
  )
}

function InsightCard({
  title,
  icon: Icon,
  color,
  items,
  emptyText,
}: {
  title: string
  icon: typeof CheckCircle
  color: 'emerald' | 'red' | 'yellow'
  items: string[]
  emptyText: string
}) {
  const colorMap = {
    emerald: { border: 'border-emerald-500/20', text: 'text-emerald-400', badge: 'bg-emerald-500/10 text-emerald-400' },
    red: { border: 'border-red-500/20', text: 'text-red-400', badge: 'bg-red-500/10 text-red-400' },
    yellow: { border: 'border-yellow-500/20', text: 'text-yellow-400', badge: 'bg-yellow-500/10 text-yellow-400' },
  }
  const c = colorMap[color]
  return (
    <div className={`glass rounded-2xl border p-4 ${c.border}`}>
      <h3 className={`text-sm font-medium flex items-center gap-2 mb-3 ${c.text}`}>
        <Icon className="w-4 h-4" /> {title}
      </h3>
      <div className="flex flex-wrap gap-1.5">
        {items.length > 0
          ? items.map((s) => (
              <span key={s} className={`text-xs px-2 py-0.5 rounded-md ${c.badge}`}>{s}</span>
            ))
          : <span className="text-xs text-white/30">{emptyText}</span>
        }
      </div>
    </div>
  )
}
