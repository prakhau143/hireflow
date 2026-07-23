import { motion } from 'framer-motion'
import { CheckCircle, XCircle, RefreshCw, Ban, Loader2, Sparkles } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { cn } from '@/lib/utils'
import api from '@/lib/api'
import toast from 'react-hot-toast'

export const IMPORT_LS_KEY = 'hireflow-active-import'

interface ImportStatus {
  id: string
  status: string
  stage_label: string
  stages: string[]
  percent: number
  total_blocks: number
  processed_blocks: number
  stats: Record<string, number | string>
  error: string | null
}

const STAGE_LABELS: Record<string, string> = {
  queued: 'Queued', preprocessing: 'Preprocessing text', noise_removal: 'Removing noise',
  block_detection: 'Finding job blocks', ai_extraction: 'AI extraction & validation',
  deduplication: 'Duplicate check', saving: 'Saving jobs', completed: 'Completed',
}

/** Live progress card for a background import. Polls every 2s; survives refresh via localStorage. */
export default function ImportProgress({ sessionId, onDone }: { sessionId: string; onDone: () => void }) {
  const qc = useQueryClient()

  const { data: s } = useQuery<ImportStatus>({
    queryKey: ['import-status', sessionId],
    queryFn: async () => (await api.get(`/api/imports/${sessionId}/status`)).data,
    refetchInterval: (q) => {
      const st = q.state.data?.status
      return st && ['completed', 'failed', 'cancelled'].includes(st) ? false : 2000
    },
  })

  const cancelMutation = useMutation({
    mutationFn: async () => api.post(`/api/imports/${sessionId}/cancel`),
    onSuccess: () => toast('Cancelling after current block…'),
  })
  const retryMutation = useMutation({
    mutationFn: async () => api.post(`/api/imports/${sessionId}/retry`),
    onSuccess: () => { toast.success('Import requeued'); qc.invalidateQueries({ queryKey: ['import-status', sessionId] }) },
  })
  const reviewMutation = useMutation({
    mutationFn: async (decision: 'approved' | 'rejected') =>
      (await api.post(`/api/imports/${sessionId}/review`, { decision })).data,
    onSuccess: (res) => {
      toast.success(`${res.updated} jobs ${res.decision === 'approved' ? 'published' : 'rejected'}`)
      qc.invalidateQueries({ queryKey: ['jobs'] })
      localStorage.removeItem(IMPORT_LS_KEY)
      onDone()
    },
  })

  if (!s) return <div className="glass rounded-2xl border border-white/10 p-5 h-32 shimmer" />

  const done = s.status === 'completed'
  const dead = s.status === 'failed' || s.status === 'cancelled'
  const activeIdx = s.stages.indexOf(s.status)
  const stats = s.stats || {}

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
      className="glass rounded-2xl border border-indigo-500/25 p-5 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          {done ? <CheckCircle className="w-5 h-5 text-emerald-400" />
            : dead ? <XCircle className="w-5 h-5 text-red-400" />
            : <Loader2 className="w-5 h-5 text-indigo-400 animate-spin" />}
          <div>
            <p className="text-white text-sm font-semibold">
              {done ? 'Import completed' : dead ? `Import ${s.status}` : 'Import running in background'}
            </p>
            <p className="text-white/40 text-xs">
              {s.stage_label}
              {s.status === 'ai_extraction' && s.total_blocks > 0 && ` — block ${s.processed_blocks}/${s.total_blocks}`}
              {' '}· you can navigate anywhere, this keeps running
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!done && !dead && (
            <button onClick={() => cancelMutation.mutate()}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-red-500/25 text-xs text-red-400/80 hover:bg-red-500/10">
              <Ban className="w-3 h-3" /> Cancel
            </button>
          )}
          {dead && (
            <button onClick={() => retryMutation.mutate()}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-indigo-500/30 text-xs text-indigo-400 hover:bg-indigo-500/10">
              <RefreshCw className="w-3 h-3" /> Retry
            </button>
          )}
          <span className="text-lg font-bold text-white tabular-nums">{s.percent}%</span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-2 bg-white/5 rounded-full overflow-hidden">
        <motion.div animate={{ width: `${s.percent}%` }} transition={{ ease: 'easeOut' }}
          className={cn('h-full rounded-full',
            dead ? 'bg-red-500' : done ? 'bg-emerald-500' : 'bg-gradient-to-r from-indigo-500 to-purple-500')} />
      </div>

      {/* Stage checklist */}
      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        {s.stages.filter(st => st !== 'queued').map((st) => {
          const idx = s.stages.indexOf(st)
          const past = done || (activeIdx >= 0 && idx < activeIdx)
          const active = st === s.status
          return (
            <span key={st} className={cn('flex items-center gap-1.5 text-[11px]',
              past ? 'text-emerald-400' : active ? 'text-indigo-300' : 'text-white/25')}>
              {past ? <CheckCircle className="w-3 h-3" />
                : active ? <Loader2 className="w-3 h-3 animate-spin" />
                : <span className="w-3 h-3 rounded-full border border-white/15 inline-block" />}
              {STAGE_LABELS[st] ?? st}
            </span>
          )
        })}
      </div>

      {/* Live stats */}
      {Object.keys(stats).length > 0 && (
        <div className="flex flex-wrap gap-2 text-[11px]">
          {[['noise_removed', 'noise lines removed'], ['blocks_found', 'job blocks'], ['validated', 'valid'],
            ['needs_review', 'flagged'], ['rejected', 'rejected'], ['duplicates', 'duplicates'], ['saved', 'saved']]
            .filter(([k]) => stats[k] !== undefined)
            .map(([k, label]) => (
              <span key={k} className="px-2 py-1 rounded-lg bg-white/5 border border-white/10 text-white/60">
                <span className="text-white font-semibold">{stats[k]}</span> {label}
              </span>
            ))}
        </div>
      )}

      {s.error && <p className="text-xs text-red-400 bg-red-500/8 border border-red-500/20 rounded-lg p-2.5">{s.error}</p>}

      {/* Review gate actions */}
      {done && Number(stats.saved || 0) > 0 && (
        <div className="flex items-center gap-2 pt-1 border-t border-white/5">
          <Sparkles className="w-3.5 h-3.5 text-purple-400" />
          <p className="text-xs text-white/50 flex-1">{stats.saved} jobs are in <b className="text-white/80">Pending Review</b> — publish to make them visible</p>
          <button onClick={() => reviewMutation.mutate('rejected')}
            className="px-3 py-1.5 rounded-lg border border-white/10 text-xs text-white/50 hover:text-red-400 hover:border-red-500/25">
            Reject All
          </button>
          <button onClick={() => reviewMutation.mutate('approved')}
            className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium">
            Approve & Publish All
          </button>
        </div>
      )}
      {(done && Number(stats.saved || 0) === 0) || dead ? (
        <button onClick={() => { localStorage.removeItem(IMPORT_LS_KEY); onDone() }}
          className="text-xs text-white/40 hover:text-white/70">Dismiss</button>
      ) : null}
    </motion.div>
  )
}
