import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Target, Plus, Trash2, CheckCircle2, X } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { cn } from '@/lib/utils'
import api from '@/lib/api'
import toast from 'react-hot-toast'

interface Goal {
  id: string; goal_type: string; label: string; target: number | null; skill: string | null
  completed: boolean; current: number; percent: number; done: boolean
}
interface GoalsResponse { week_start: string; goals: Goal[] }

export default function WeeklyGoalsCard() {
  const qc = useQueryClient()
  const [adding, setAdding] = useState(false)
  const [label, setLabel] = useState('')
  const [skill, setSkill] = useState('')
  const [goalType, setGoalType] = useState<'learn_skill' | 'custom'>('learn_skill')

  const { data, isLoading } = useQuery<GoalsResponse>({
    queryKey: ['weekly-goals'],
    queryFn: async () => (await api.get('/api/users/me/weekly-goals')).data,
  })

  const create = useMutation({
    mutationFn: async () => (await api.post('/api/users/me/weekly-goals', {
      goal_type: goalType,
      label: goalType === 'learn_skill' ? `Learn ${skill}` : label,
      skill: goalType === 'learn_skill' ? skill : undefined,
    })).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['weekly-goals'] })
      setAdding(false); setLabel(''); setSkill('')
      toast.success('Goal added')
    },
  })

  const toggle = useMutation({
    mutationFn: async ({ id, completed }: { id: string; completed: boolean }) =>
      (await api.patch(`/api/users/me/weekly-goals/${id}`, { completed })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['weekly-goals'] }),
  })

  const remove = useMutation({
    mutationFn: async (id: string) => api.delete(`/api/users/me/weekly-goals/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['weekly-goals'] }); toast.success('Goal removed') },
  })

  if (isLoading || !data) return <div className="glass rounded-2xl border border-border p-5 h-40 shimmer" />

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
      className="glass rounded-2xl border border-border p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-foreground font-semibold text-sm flex items-center gap-2">
          <Target className="w-4 h-4 text-emerald-400" /> Weekly Goals
        </h3>
        <button onClick={() => setAdding(!adding)} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground/85 hover:bg-foreground/5">
          {adding ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
        </button>
      </div>

      <AnimatePresence>
        {adding && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
            className="space-y-2 overflow-hidden">
            <div className="flex gap-1.5">
              <button onClick={() => setGoalType('learn_skill')}
                className={cn('flex-1 py-1.5 rounded-lg text-[11px] border', goalType === 'learn_skill' ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-300' : 'border-border text-muted-foreground')}>
                Learn a skill
              </button>
              <button onClick={() => setGoalType('custom')}
                className={cn('flex-1 py-1.5 rounded-lg text-[11px] border', goalType === 'custom' ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-300' : 'border-border text-muted-foreground')}>
                Custom goal
              </button>
            </div>
            {goalType === 'learn_skill' ? (
              <input value={skill} onChange={e => setSkill(e.target.value)} placeholder="e.g. Redis, AWS, Kubernetes"
                className="w-full glass rounded-lg px-2.5 py-2 text-xs text-foreground/85 placeholder:text-muted-foreground/60 border border-border focus:border-emerald-500/40 focus:outline-none" />
            ) : (
              <input value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. Update LinkedIn headline"
                className="w-full glass rounded-lg px-2.5 py-2 text-xs text-foreground/85 placeholder:text-muted-foreground/60 border border-border focus:border-emerald-500/40 focus:outline-none" />
            )}
            <button onClick={() => create.mutate()} disabled={create.isPending || (goalType === 'learn_skill' ? !skill.trim() : !label.trim())}
              className="w-full py-1.5 rounded-lg bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-xs font-medium disabled:opacity-40">
              Add Goal
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="space-y-2.5">
        {data.goals.map(g => (
          <div key={g.id} className="group">
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="flex items-center gap-1.5 text-foreground/80">
                {g.goal_type === 'custom' && (
                  <button onClick={() => toggle.mutate({ id: g.id, completed: !g.completed })}>
                    <CheckCircle2 className={cn('w-3.5 h-3.5', g.done ? 'text-emerald-400' : 'text-muted-foreground/60')} />
                  </button>
                )}
                {g.label}
              </span>
              <span className="flex items-center gap-2">
                <span className={cn('font-semibold', g.done ? 'text-emerald-400' : 'text-muted-foreground')}>
                  {g.goal_type === 'apply_jobs' || g.goal_type === 'improve_ats' ? `${g.current}/${g.target}` : g.done ? 'Done' : ''}
                </span>
                <button onClick={() => remove.mutate(g.id)} className="opacity-0 group-hover:opacity-100 text-muted-foreground/60 hover:text-red-400 transition-opacity">
                  <Trash2 className="w-3 h-3" />
                </button>
              </span>
            </div>
            <div className="h-1.5 bg-foreground/5 rounded-full overflow-hidden">
              <motion.div initial={{ width: 0 }} animate={{ width: `${g.percent}%` }} transition={{ duration: 0.5 }}
                className={cn('h-full rounded-full', g.done ? 'bg-emerald-500' : 'bg-gradient-to-r from-emerald-500/60 to-emerald-500/30')} />
            </div>
          </div>
        ))}
        {data.goals.length === 0 && <p className="text-muted-foreground text-xs text-center py-3">No goals yet this week</p>}
      </div>
    </motion.div>
  )
}
