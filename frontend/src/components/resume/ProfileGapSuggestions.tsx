import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles, Plus, Check } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import toast from 'react-hot-toast'
import type { User } from '@/types'

interface GapSuggestion {
  type: 'skill' | 'social' | 'project' | 'certification'
  field: 'skills' | 'github_url' | 'portfolio_url' | 'projects' | 'certifications'
  label: string
  value: any
}
interface GapResponse {
  suggestions: GapSuggestion[]
  health_reason: string
}

/** "Resume says Docker, profile doesn't" — one-click sync from resume to profile. */
export default function ProfileGapSuggestions({ resumeId }: { resumeId: string }) {
  const qc = useQueryClient()

  const { data: user } = useQuery<User>({
    queryKey: ['me-full'],
    queryFn: async () => (await api.get('/api/users/me')).data,
  })

  const { data, isLoading } = useQuery<GapResponse>({
    queryKey: ['profile-gap', resumeId],
    queryFn: async () => (await api.get(`/api/resumes/${resumeId}/profile-gap`)).data,
    enabled: !!resumeId,
  })

  const apply = useMutation({
    mutationFn: async (s: GapSuggestion) => {
      if (!user) throw new Error('Profile not loaded yet')
      let patch: Record<string, unknown>
      if (s.field === 'skills') {
        patch = { skills: [...(user.skills ?? []), s.value] }
      } else if (s.field === 'projects') {
        patch = { projects: [...(user.projects ?? []), s.value] }
      } else if (s.field === 'certifications') {
        patch = { certifications: [...(user.certifications ?? []), s.value] }
      } else {
        patch = { [s.field]: s.value }
      }
      return (await api.patch('/api/users/profile', patch)).data
    },
    onSuccess: (updated) => {
      qc.setQueryData(['me-full'], updated)
      qc.invalidateQueries({ queryKey: ['profile-health'] })
      qc.invalidateQueries({ queryKey: ['profile-gap', resumeId] })
      toast.success(`Added to your profile`)
    },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Failed to update profile'),
  })

  if (isLoading || !data?.suggestions?.length) return null

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      className="glass rounded-2xl border border-purple-500/20 p-5">
      <h3 className="text-purple-300 font-semibold text-sm flex items-center gap-2 mb-1">
        <Sparkles className="w-4 h-4" /> Complete Your Profile
      </h3>
      <p className="text-muted-foreground text-xs mb-3">Your resume has data your profile is missing — add it in one click</p>
      <div className="space-y-2">
        <AnimatePresence initial={false}>
          {data.suggestions.map((s) => {
            const key = `${s.field}-${s.label}`
            const pending = apply.isPending && apply.variables === s
            return (
              <motion.div key={key} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 8 }}
                className="flex items-center justify-between gap-3 p-2.5 rounded-xl bg-foreground/[0.02] border border-border">
                <span className="text-xs text-foreground/80">{s.label}</span>
                <button onClick={() => apply.mutate(s)} disabled={apply.isPending}
                  className="shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-lg bg-purple-500/15 border border-purple-500/25 text-purple-300 text-[11px] font-medium hover:bg-purple-500/25 disabled:opacity-40">
                  {pending ? <Check className="w-3 h-3" /> : <Plus className="w-3 h-3" />} Add
                </button>
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}
