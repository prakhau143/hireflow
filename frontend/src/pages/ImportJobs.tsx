import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ClipboardPaste, Sparkles, Save, Trash2, Building2, MapPin, Mail, Phone,
  CheckCircle2, AlertCircle, XCircle, ChevronDown, ChevronUp, ExternalLink,
  MessageSquare, Link2, FileText, Zap, Archive,
} from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { cn } from '@/lib/utils'
import api from '@/lib/api'
import toast from 'react-hot-toast'

// ─── Types ───────────────────────────────────────────────────────────────────

interface ParsedJob {
  role: string | null
  company: string | null
  experience: string | null
  location: string | null
  work_mode: string | null
  skills: string[]
  salary: string | null
  email: string | null
  phone: string | null
  apply_link: string | null
  description: string | null
  requirements: string[]
  employment_type: string | null
  match_score: number
  matched_skills: string[]
  missing_skills: string[]
  confidence_score: number
  is_valid: boolean
  validation_reason: string | null
  _source: string
  _raw: string
}

interface ParseStats {
  blocks_found: number
  valid: number
  invalid: number
  source: string
}

interface SaveResult {
  saved: number
  archived: number
  duplicates: number
  failed: number
}

// ─── Pipeline stages ─────────────────────────────────────────────────────────

const STAGES = [
  { id: 'cleaning',   label: 'Removing noise',       hint: 'Timestamps · Group events · System messages' },
  { id: 'detecting',  label: 'Finding job blocks',    hint: 'Keyword + email boundary detection' },
  { id: 'extracting', label: 'AI extraction',         hint: 'Groq LLM converts each block to JSON' },
  { id: 'matching',   label: 'Matching with resume',  hint: 'Calculating skill match scores' },
  { id: 'done',       label: 'Complete',              hint: '' },
] as const

type StageId = typeof STAGES[number]['id']

const STAGE_DELAYS_MS = [700, 600, 0, 400] // duration for stages 0-3; stage 3 resolves after API

// ─── Main component ───────────────────────────────────────────────────────────

export default function ImportJobs() {
  const qc = useQueryClient()
  const [text, setText] = useState('')
  const [parsed, setParsed] = useState<ParsedJob[]>([])
  const [invalid, setInvalid] = useState<ParsedJob[]>([])
  const [stats, setStats] = useState<ParseStats | null>(null)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [phase, setPhase] = useState<'input' | 'parsing' | 'review' | 'saved'>('input')
  const [currentStage, setCurrentStage] = useState<StageId>('cleaning')
  const [stageProgress, setStageProgress] = useState(0)
  const [saveResult, setSaveResult] = useState<SaveResult | null>(null)
  const [showInvalid, setShowInvalid] = useState(false)
  const stageRef = useRef<StageId>('cleaning')

  // Advance pipeline stages while API is running
  useEffect(() => {
    if (phase !== 'parsing') return
    let cancelled = false
    stageRef.current = 'cleaning'
    setCurrentStage('cleaning')
    setStageProgress(0)

    async function runStages() {
      for (let i = 0; i < STAGE_DELAYS_MS.length; i++) {
        const delay = STAGE_DELAYS_MS[i]
        if (delay === 0) {
          // Stage 2 (extracting) — hold until API returns (phase changes)
          while (!cancelled && stageRef.current === STAGES[i].id) {
            await new Promise(r => setTimeout(r, 100))
          }
          break
        }
        // Animate progress within the stage
        const steps = 20
        for (let s = 0; s <= steps; s++) {
          if (cancelled) return
          setStageProgress(Math.round((s / steps) * 100))
          await new Promise(r => setTimeout(r, delay / steps))
        }
        if (!cancelled) {
          setCurrentStage(STAGES[i + 1].id)
          setStageProgress(0)
        }
      }
    }
    runStages()
    return () => { cancelled = true }
  }, [phase])

  const parseMutation = useMutation({
    mutationFn: async (rawText: string) => {
      setPhase('parsing')
      setCurrentStage('cleaning')
      // Stages 0+1 are simulated (see useEffect above)
      // Stage 2 is held until API returns
      setCurrentStage('extracting')
      stageRef.current = 'extracting'

      const { data } = await api.post('/api/jobs/import/parse', { text: rawText })
      return data as { jobs: ParsedJob[]; invalid: ParsedJob[]; stats: ParseStats }
    },
    onSuccess: (data) => {
      setCurrentStage('matching')
      stageRef.current = 'matching'
      setTimeout(() => {
        setCurrentStage('done')
        setParsed(data.jobs)
        setInvalid(data.invalid || [])
        setStats(data.stats)
        setSelected(new Set(data.jobs.map((_, i) => i)))
        setPhase('review')
      }, 500)
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.detail || 'Pipeline failed. Check your Groq API key.')
      setPhase('input')
    },
  })

  const saveMutation = useMutation({
    mutationFn: async (jobs: ParsedJob[]) => {
      const { data } = await api.post('/api/jobs/import/save', { jobs })
      return data as SaveResult
    },
    onSuccess: (result) => {
      setSaveResult(result)
      setPhase('saved')
      qc.invalidateQueries({ queryKey: ['jobs'] })
      qc.invalidateQueries({ queryKey: ['dashboard-stats'] })
      qc.invalidateQueries({ queryKey: ['logs'] })
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.detail || 'Failed to save jobs')
    },
  })

  function handleAnalyze() {
    if (!text.trim()) { toast.error('Paste some job posts first'); return }
    parseMutation.mutate(text.trim())
  }

  function handleSave() {
    const toSave = parsed.filter((_, i) => selected.has(i))
    if (!toSave.length) { toast.error('Select at least one job'); return }
    saveMutation.mutate(toSave)
  }

  function reset() {
    setText(''); setParsed([]); setInvalid([]); setStats(null)
    setSelected(new Set()); setPhase('input'); setSaveResult(null)
  }

  // ── Source badge ──────────────────────────────────────────────────────────
  const sourceLabel = stats?.source === 'whatsapp' ? 'WhatsApp'
    : stats?.source === 'linkedin' ? 'LinkedIn'
    : stats?.source === 'telegram' ? 'Telegram'
    : 'Text'
  const SourceIcon = stats?.source === 'whatsapp' ? MessageSquare
    : stats?.source === 'linkedin' ? Link2
    : FileText

  return (
    <div className="w-full space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Import Jobs</h1>
          <p className="text-white/40 text-sm mt-0.5">
            Paste WhatsApp, LinkedIn, or any job text — AI hybrid pipeline extracts and matches jobs
          </p>
        </div>
        {phase === 'review' && (
          <div className="flex gap-2">
            <button onClick={reset} className="flex items-center gap-2 px-4 py-2 rounded-xl glass border border-white/10 text-sm text-white/60 hover:text-white transition-colors">
              <Trash2 className="w-4 h-4" /> Reset
            </button>
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={handleSave}
              disabled={saveMutation.isPending || selected.size === 0}
              className="flex items-center gap-2 px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors disabled:opacity-60"
            >
              {saveMutation.isPending
                ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Saving...</>
                : <><Save className="w-4 h-4" /> Save {selected.size} Job{selected.size !== 1 ? 's' : ''}</>}
            </motion.button>
          </div>
        )}
      </div>

      <AnimatePresence mode="wait">

        {/* ── Input phase ──────────────────────────────────────────────────── */}
        {phase === 'input' && (
          <motion.div key="input" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-4">
            <div className="glass rounded-2xl border border-white/10 p-1">
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={`Paste WhatsApp group chat, LinkedIn posts, or any job text here…

Example (WhatsApp group export):
─────────────────────────────────
Hiring Frontend Developer
Company: TechCorp Pvt Ltd
Experience: 2-4 years
Skills: React, TypeScript, Node.js
Location: Bangalore / Remote
Apply: career@techcorp.com
─────────────────────────────────
We're Hiring React Native Developer
hr@startupco.in | +91 98765 43210
─────────────────────────────────

Paste hundreds of mixed messages — the pipeline filters noise automatically.`}
                className="w-full h-80 bg-transparent rounded-xl px-5 py-4 text-sm text-white/80 placeholder:text-white/20 resize-none outline-none leading-relaxed font-mono"
              />
            </div>

            <div className="flex items-center justify-between">
              <p className="text-xs text-white/30">
                {text.length > 0
                  ? `${text.length.toLocaleString()} chars · Rule Engine + Groq Llama 3.3`
                  : 'Supports WhatsApp exports · LinkedIn · Telegram · plain text'}
              </p>
              <div className="flex gap-2">
                {text && (
                  <button onClick={() => setText('')} className="px-4 py-2 rounded-xl glass border border-white/10 text-sm text-white/50 hover:text-white transition-colors">
                    Clear
                  </button>
                )}
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={handleAnalyze}
                  disabled={!text.trim()}
                  className="flex items-center gap-2 px-6 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors disabled:opacity-60"
                >
                  <Sparkles className="w-4 h-4" /> Run Pipeline
                </motion.button>
              </div>
            </div>

            {/* Pipeline explainer */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-2">
              {[
                { icon: ClipboardPaste, label: '1. Paste', desc: 'WhatsApp / LinkedIn / any text' },
                { icon: Zap,            label: '2. Rule Engine', desc: 'Removes noise, finds boundaries' },
                { icon: Sparkles,       label: '3. AI Extract', desc: 'Per-block JSON extraction' },
                { icon: Save,           label: '4. Save & Track', desc: 'Matched jobs to your board' },
              ].map(({ icon: Icon, label, desc }) => (
                <div key={label} className="glass rounded-xl border border-white/10 p-4 flex gap-3">
                  <div className="w-8 h-8 rounded-lg bg-indigo-600/20 flex items-center justify-center shrink-0">
                    <Icon className="w-4 h-4 text-indigo-400" />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-white">{label}</p>
                    <p className="text-xs text-white/40 mt-0.5">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* ── Parsing phase ─────────────────────────────────────────────────── */}
        {phase === 'parsing' && (
          <motion.div key="parsing" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
            <div className="glass rounded-2xl border border-white/10 p-8 max-w-lg mx-auto space-y-6">
              <div className="text-center space-y-1">
                <h2 className="text-white font-semibold text-lg">Running Import Pipeline</h2>
                <p className="text-white/40 text-sm">{text.length.toLocaleString()} chars · please wait…</p>
              </div>

              <div className="space-y-3">
                {STAGES.filter(s => s.id !== 'done').map((stage, idx) => {
                  const stageIdx = STAGES.findIndex(s => s.id === currentStage)
                  const isDone = idx < stageIdx
                  const isActive = STAGES[stageIdx]?.id === stage.id
                  return (
                    <div key={stage.id} className={cn('space-y-1 transition-opacity', !isDone && !isActive && 'opacity-30')}>
                      <div className="flex items-center justify-between text-xs">
                        <span className={cn('font-medium', isDone ? 'text-emerald-400' : isActive ? 'text-white' : 'text-white/50')}>
                          {isDone ? '✓ ' : isActive ? '⟳ ' : `${idx + 1}. `}{stage.label}
                        </span>
                        {isActive && <span className="text-white/30">{stageProgress}%</span>}
                        {isDone && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
                      </div>
                      <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                        <motion.div
                          className={cn('h-full rounded-full', isDone ? 'bg-emerald-500' : 'bg-indigo-500')}
                          animate={{ width: isDone ? '100%' : isActive ? `${stageProgress}%` : '0%' }}
                          transition={{ duration: 0.3 }}
                        />
                      </div>
                      {isActive && stage.hint && (
                        <p className="text-white/25 text-xs">{stage.hint}</p>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </motion.div>
        )}

        {/* ── Review phase ──────────────────────────────────────────────────── */}
        {phase === 'review' && (
          <motion.div key="review" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-4">

            {/* Parse summary bar */}
            {stats && (
              <div className="glass rounded-xl border border-white/10 px-5 py-3 flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-4 text-sm">
                  <div className="flex items-center gap-1.5">
                    <SourceIcon className="w-4 h-4 text-indigo-400" />
                    <span className="text-white/60">{sourceLabel}</span>
                  </div>
                  <span className="text-white/20">·</span>
                  <span className="text-white/60">{stats.blocks_found} blocks detected</span>
                  <span className="text-white/20">·</span>
                  <span className="text-emerald-400 font-medium">{stats.valid} valid</span>
                  {stats.invalid > 0 && (
                    <><span className="text-white/20">·</span>
                    <span className="text-red-400">{stats.invalid} invalid</span></>
                  )}
                </div>
                <div className="flex gap-3 text-xs text-white/40">
                  <button onClick={() => setSelected(new Set(parsed.map((_, i) => i)))} className="hover:text-white transition-colors">Select all</button>
                  <button onClick={() => setSelected(new Set())} className="hover:text-white transition-colors">None</button>
                </div>
              </div>
            )}

            {parsed.length === 0 ? (
              <div className="glass rounded-2xl border border-white/10 p-12 text-center space-y-3">
                <AlertCircle className="w-12 h-12 text-white/20 mx-auto" />
                <p className="text-white/60 font-medium">No valid jobs found</p>
                <p className="text-white/30 text-sm">The pipeline couldn't extract any job postings. Try pasting text that includes job titles and contact emails.</p>
                <button onClick={reset} className="mt-2 px-4 py-2 rounded-xl glass border border-white/10 text-sm text-white/70 hover:text-white transition-colors">
                  Try Again
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {parsed.map((job, i) => (
                  <ParsedJobCard key={i} job={job} selected={selected.has(i)} onToggle={() => {
                    setSelected(prev => {
                      const next = new Set(prev)
                      next.has(i) ? next.delete(i) : next.add(i)
                      return next
                    })
                  }} />
                ))}
              </div>
            )}

            {/* Invalid / failed blocks */}
            {invalid.length > 0 && (
              <div className="glass rounded-xl border border-red-500/20 overflow-hidden">
                <button
                  onClick={() => setShowInvalid(!showInvalid)}
                  className="w-full flex items-center justify-between px-5 py-3 text-sm text-red-400 hover:text-red-300 transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <XCircle className="w-4 h-4" />
                    {invalid.length} block{invalid.length !== 1 ? 's' : ''} skipped (no valid job found)
                  </span>
                  {showInvalid ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
                {showInvalid && (
                  <div className="border-t border-red-500/10 px-5 py-4 space-y-3">
                    {invalid.map((block, i) => (
                      <div key={i} className="text-xs space-y-1">
                        <p className="text-red-400/80">{block.validation_reason || 'Not a job post'}</p>
                        {block._raw && <p className="text-white/25 font-mono truncate">{block._raw.substring(0, 120)}…</p>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </motion.div>
        )}

        {/* ── Saved phase ───────────────────────────────────────────────────── */}
        {phase === 'saved' && saveResult && (
          <motion.div key="saved" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
            <div className="glass rounded-2xl border border-white/10 p-8 max-w-lg mx-auto space-y-6 text-center">
              <CheckCircle2 className="w-14 h-14 text-emerald-400 mx-auto" />
              <div>
                <h2 className="text-white font-semibold text-xl">Import Complete</h2>
                <p className="text-white/40 text-sm mt-1">Jobs have been saved to your board</p>
              </div>

              {/* Stats grid */}
              <div className="grid grid-cols-2 gap-3">
                <StatPill label="Saved" value={saveResult.saved} color="emerald" />
                <StatPill label="Archived" value={saveResult.archived} color="yellow" hint="Low match (<40%)" />
                <StatPill label="Duplicates" value={saveResult.duplicates} color="indigo" hint="Already exist" />
                <StatPill label="Failed" value={saveResult.failed} color="red" />
              </div>

              {saveResult.archived > 0 && (
                <div className="glass rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-3 text-xs text-yellow-300/80 flex items-start gap-2">
                  <Archive className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{saveResult.archived} job{saveResult.archived !== 1 ? 's' : ''} archived due to low resume match score — find them in the Archives tab.</span>
                </div>
              )}

              <button onClick={reset} className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors">
                Import More Jobs
              </button>
            </div>
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  )
}

// ─── Job Card ─────────────────────────────────────────────────────────────────

function ParsedJobCard({ job, selected, onToggle }: { job: ParsedJob; selected: boolean; onToggle: () => void }) {
  const score = job.match_score
  const matchColor = score >= 80 ? 'text-emerald-400' : score >= 60 ? 'text-yellow-400' : 'text-red-400'
  const matchBg = score >= 80 ? 'bg-emerald-500' : score >= 60 ? 'bg-yellow-500' : 'bg-red-500'

  const sourceLabel = job._source === 'whatsapp' ? 'WhatsApp'
    : job._source === 'linkedin' ? 'LinkedIn'
    : job._source === 'telegram' ? 'Telegram'
    : 'Text'

  return (
    <motion.div
      layout
      onClick={onToggle}
      className={cn(
        'glass rounded-2xl border cursor-pointer transition-all p-5 space-y-3',
        selected ? 'border-indigo-500/40 bg-indigo-500/5 ring-1 ring-indigo-500/20' : 'border-white/10 hover:border-white/20',
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-white text-sm">{job.role || 'Unknown Role'}</h3>
            {job.employment_type && (
              <span className="px-1.5 py-0.5 rounded text-xs bg-white/5 text-white/40 border border-white/10">{job.employment_type}</span>
            )}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5 text-white/50 text-xs flex-wrap">
            <Building2 className="w-3 h-3 shrink-0" />
            <span>{job.company || '—'}</span>
            {job.location && <><span className="text-white/20">·</span><MapPin className="w-3 h-3 shrink-0" /><span>{job.location}</span></>}
            {job.work_mode && <><span className="text-white/20">·</span><span className={cn(job.work_mode === 'Remote' ? 'text-emerald-400' : job.work_mode === 'Hybrid' ? 'text-yellow-400' : '')}>{job.work_mode}</span></>}
          </div>
        </div>
        <div className={cn('w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all', selected ? 'border-indigo-500 bg-indigo-500' : 'border-white/20')}>
          {selected && <CheckCircle2 className="w-3 h-3 text-white" />}
        </div>
      </div>

      {/* Match score bar */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs">
          <span className="text-white/40">Resume match</span>
          <span className={cn('font-bold', matchColor)}>{score}%</span>
        </div>
        <div className="h-1 bg-white/5 rounded-full overflow-hidden">
          <motion.div initial={{ width: 0 }} animate={{ width: `${score}%` }} transition={{ duration: 0.5 }} className={cn('h-full rounded-full', matchBg)} />
        </div>
      </div>

      {/* Description */}
      {job.description && <p className="text-xs text-white/55 line-clamp-2">{job.description}</p>}

      {/* Skills */}
      {job.skills?.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {job.skills.slice(0, 6).map((s) => (
            <span key={s} className={cn('px-2 py-0.5 rounded-full text-xs border', job.matched_skills?.includes(s) ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20' : 'bg-white/5 text-white/50 border-white/10')}>
              {s}
            </span>
          ))}
          {job.skills.length > 6 && <span className="px-2 py-0.5 rounded-full text-xs bg-white/5 text-white/30 border border-white/10">+{job.skills.length - 6}</span>}
        </div>
      )}

      {/* Contact + meta row */}
      <div className="flex items-center justify-between text-xs text-white/35 flex-wrap gap-2">
        <div className="flex items-center gap-3">
          {job.email && <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{job.email}</span>}
          {job.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{job.phone}</span>}
          {!job.email && !job.phone && <span className="text-white/20">No contact info</span>}
        </div>
        <div className="flex items-center gap-2">
          {job.salary && <span className="text-white/50">{job.salary}</span>}
          {job.experience && <span>{job.experience}</span>}
        </div>
      </div>

      {/* Footer: source + apply link */}
      <div className="flex items-center justify-between pt-1 border-t border-white/5">
        <span className="text-xs text-white/25 flex items-center gap-1">
          {job._source === 'whatsapp' ? <MessageSquare className="w-3 h-3" /> : job._source === 'linkedin' ? <Link2 className="w-3 h-3" /> : <FileText className="w-3 h-3" />}
          {sourceLabel}
        </span>
        {job.apply_link && (
          <a href={job.apply_link} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 transition-colors">
            Apply <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>
    </motion.div>
  )
}

// ─── Stat Pill ────────────────────────────────────────────────────────────────

function StatPill({ label, value, color, hint }: { label: string; value: number; color: 'emerald' | 'yellow' | 'indigo' | 'red'; hint?: string }) {
  const colors = {
    emerald: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    yellow:  'text-yellow-400 bg-yellow-500/10 border-yellow-500/20',
    indigo:  'text-indigo-400 bg-indigo-500/10 border-indigo-500/20',
    red:     'text-red-400 bg-red-500/10 border-red-500/20',
  }
  return (
    <div className={cn('glass rounded-xl border p-4 text-center', colors[color])}>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs font-medium mt-0.5">{label}</p>
      {hint && <p className="text-xs opacity-60 mt-0.5">{hint}</p>}
    </div>
  )
}
