import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ClipboardPaste, Sparkles, Save, Trash2, Building2, MapPin, Mail, Phone, CheckCircle2, AlertCircle } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import { EmptyState } from '@/components/ui/EmptyState'
import toast from 'react-hot-toast'

interface ParsedJob {
  company: string
  role: string
  location: string
  description: string
  required_skills: string[]
  email: string | null
  phone: string | null
  hiring_manager: string | null
  experience_required: string | null
  raw_text: string
}

export default function ImportJobs() {
  const qc = useQueryClient()
  const [text, setText] = useState('')
  const [parsed, setParsed] = useState<ParsedJob[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [phase, setPhase] = useState<'input' | 'review'>('input')

  const parseMutation = useMutation({
    mutationFn: async (rawText: string) => {
      const { data } = await api.post('/api/jobs/import/parse', { text: rawText })
      return data as ParsedJob[]
    },
    onSuccess: (jobs) => {
      setParsed(jobs)
      setSelected(new Set(jobs.map((_, i) => i)))
      setPhase('review')
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.detail || 'Parsing failed. Check your Groq API key.')
    },
  })

  const saveMutation = useMutation({
    mutationFn: async (jobs: ParsedJob[]) => {
      const { data } = await api.post('/api/jobs/import/save', { jobs })
      return data
    },
    onSuccess: (data) => {
      toast.success(`Saved ${data.count} job(s) successfully!`)
      qc.invalidateQueries({ queryKey: ['jobs'] })
      qc.invalidateQueries({ queryKey: ['dashboard-stats'] })
      setText('')
      setParsed([])
      setSelected(new Set())
      setPhase('input')
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.detail || 'Failed to save jobs')
    },
  })

  function handleAnalyze() {
    const trimmed = text.trim()
    if (!trimmed) { toast.error('Paste some job posts first'); return }
    parseMutation.mutate(trimmed)
  }

  function toggleSelect(i: number) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })
  }

  function handleSave() {
    const toSave = parsed.filter((_, i) => selected.has(i))
    if (!toSave.length) { toast.error('Select at least one job'); return }
    saveMutation.mutate(toSave)
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Import Jobs</h1>
          <p className="text-white/40 text-sm mt-1">
            Paste LinkedIn or any hiring posts — AI extracts company, role, skills, and contact info
          </p>
        </div>
        {phase === 'review' && (
          <div className="flex gap-2">
            <button
              onClick={() => { setPhase('input'); setParsed([]); setSelected(new Set()) }}
              className="flex items-center gap-2 px-4 py-2 rounded-xl glass border border-white/10 text-sm text-white/60 hover:text-white transition-colors"
            >
              <Trash2 className="w-4 h-4" /> Clear
            </button>
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={handleSave}
              disabled={saveMutation.isPending || selected.size === 0}
              className="flex items-center gap-2 px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors disabled:opacity-60"
            >
              {saveMutation.isPending ? (
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <><Save className="w-4 h-4" /> Save {selected.size} Job{selected.size !== 1 ? 's' : ''}</>
              )}
            </motion.button>
          </div>
        )}
      </div>

      <AnimatePresence mode="wait">
        {phase === 'input' && (
          <motion.div
            key="input"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-4"
          >
            {/* Paste area */}
            <div className="glass rounded-2xl border border-white/10 p-1">
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={`Paste one or multiple LinkedIn hiring posts here...

Example:
🚀 We're hiring a Senior React Developer at TechCorp!
📍 Remote | 💰 ₹20-30 LPA
Skills: React, TypeScript, Node.js, AWS
Send your resume to careers@techcorp.com

You can paste multiple posts — separate them with blank lines.`}
                className="w-full h-72 bg-transparent rounded-xl px-5 py-4 text-sm text-white placeholder:text-white/20 resize-none outline-none leading-relaxed"
              />
            </div>

            <div className="flex items-center justify-between">
              <p className="text-xs text-white/30">
                {text.length > 0 ? `${text.length} characters • Powered by Groq Llama 3.3` : 'Supports LinkedIn posts, job descriptions, plain text'}
              </p>
              <div className="flex gap-2">
                {text && (
                  <button
                    onClick={() => setText('')}
                    className="px-4 py-2 rounded-xl glass border border-white/10 text-sm text-white/50 hover:text-white transition-colors"
                  >
                    Clear
                  </button>
                )}
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={handleAnalyze}
                  disabled={parseMutation.isPending || !text.trim()}
                  className="flex items-center gap-2 px-6 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors disabled:opacity-60"
                >
                  {parseMutation.isPending ? (
                    <>
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Analyzing...
                    </>
                  ) : (
                    <><Sparkles className="w-4 h-4" /> Analyze Jobs</>
                  )}
                </motion.button>
              </div>
            </div>

            {/* How it works */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-2">
              {[
                { icon: ClipboardPaste, title: 'Paste Posts', desc: 'Paste raw text from LinkedIn, job boards, or anywhere' },
                { icon: Sparkles, title: 'AI Extracts', desc: 'Groq LLM identifies company, role, skills, email, phone' },
                { icon: Save, title: 'Save & Track', desc: 'Saved jobs appear in your Jobs board ready for applications' },
              ].map(({ icon: Icon, title, desc }) => (
                <div key={title} className="glass rounded-xl border border-white/10 p-4 flex gap-3">
                  <div className="w-8 h-8 rounded-lg bg-indigo-600/20 flex items-center justify-center shrink-0">
                    <Icon className="w-4 h-4 text-indigo-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">{title}</p>
                    <p className="text-xs text-white/40 mt-0.5">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {phase === 'review' && (
          <motion.div
            key="review"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-4"
          >
            {/* Summary bar */}
            <div className="glass rounded-xl border border-white/10 px-5 py-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                <p className="text-sm text-white">
                  Found <span className="font-semibold text-white">{parsed.length}</span> job{parsed.length !== 1 ? 's' : ''} — select which to save
                </p>
              </div>
              <div className="flex gap-3 text-xs text-white/40">
                <button onClick={() => setSelected(new Set(parsed.map((_, i) => i)))} className="hover:text-white transition-colors">Select all</button>
                <button onClick={() => setSelected(new Set())} className="hover:text-white transition-colors">Deselect all</button>
              </div>
            </div>

            {parsed.length === 0 ? (
              <EmptyState
                icon={AlertCircle}
                title="No jobs found"
                description="The AI couldn't extract any job postings. Try pasting clearer text with job titles and company names."
                action={
                  <button onClick={() => setPhase('input')} className="px-4 py-2 rounded-xl glass border border-white/10 text-sm text-white/70 hover:text-white transition-colors">
                    Try Again
                  </button>
                }
              />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {parsed.map((job, i) => (
                  <ParsedJobCard
                    key={i}
                    job={job}
                    selected={selected.has(i)}
                    onToggle={() => toggleSelect(i)}
                  />
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function ParsedJobCard({
  job,
  selected,
  onToggle,
}: {
  job: ParsedJob
  selected: boolean
  onToggle: () => void
}) {
  return (
    <motion.div
      layout
      onClick={onToggle}
      className={`glass rounded-2xl border cursor-pointer transition-all p-5 space-y-3 ${
        selected ? 'border-indigo-500/40 bg-indigo-500/5' : 'border-white/10 hover:border-white/20'
      }`}
    >
      {/* Check indicator */}
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-white text-sm truncate">{job.role || 'Unknown Role'}</h3>
          <div className="flex items-center gap-1.5 mt-0.5 text-white/50 text-xs">
            <Building2 className="w-3 h-3 shrink-0" />
            <span className="truncate">{job.company || 'Unknown Company'}</span>
            {job.location && (
              <>
                <span>·</span>
                <MapPin className="w-3 h-3 shrink-0" />
                <span className="truncate">{job.location}</span>
              </>
            )}
          </div>
        </div>
        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ml-3 transition-all ${
          selected ? 'border-indigo-500 bg-indigo-500' : 'border-white/20'
        }`}>
          {selected && <CheckCircle2 className="w-3 h-3 text-white" />}
        </div>
      </div>

      {/* Skills */}
      {job.required_skills?.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {job.required_skills.slice(0, 6).map((skill) => (
            <span key={skill} className="px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-xs text-white/60">
              {skill}
            </span>
          ))}
          {job.required_skills.length > 6 && (
            <span className="px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-xs text-white/30">
              +{job.required_skills.length - 6}
            </span>
          )}
        </div>
      )}

      {/* Contact info */}
      {(job.email || job.phone) && (
        <div className="flex gap-3 text-xs text-white/40">
          {job.email && (
            <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{job.email}</span>
          )}
          {job.phone && (
            <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{job.phone}</span>
          )}
        </div>
      )}

      {/* Experience */}
      {job.experience_required && (
        <p className="text-xs text-white/30">Experience: {job.experience_required}</p>
      )}
    </motion.div>
  )
}
