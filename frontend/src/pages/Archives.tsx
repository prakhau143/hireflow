import { motion } from 'framer-motion'
import { TrendingDown, Clock, BookOpen, Star, Archive } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { cn, getMatchBg } from '@/lib/utils'
import { LoadingCards, EmptyState } from '@/components/ui/EmptyState'
import api from '@/lib/api'

const categories = [
  { key: 'low_match', label: 'Low Match', icon: TrendingDown, color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20' },
  { key: 'missing_experience', label: 'Missing Experience', icon: Star, color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/20' },
  { key: 'missing_skills', label: 'Missing Skills', icon: BookOpen, color: 'text-orange-400', bg: 'bg-orange-500/10 border-orange-500/20' },
  { key: 'expired', label: 'Expired Jobs', icon: Clock, color: 'text-gray-400', bg: 'bg-gray-500/10 border-gray-500/20' },
]

export default function Archives() {
  const { data: jobs, isLoading, isError } = useQuery<any[]>({
    queryKey: ['archived-jobs'],
    queryFn: async () => {
      const { data } = await api.get('/api/jobs/?status=archived')
      return data
    },
  })

  const archivedJobs = jobs ?? []

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Archives</h1>
        <p className="text-muted-foreground text-sm mt-0.5">Jobs sorted by reason — understand why they didn't match</p>
      </div>

      {isLoading ? (
        <LoadingCards count={4} />
      ) : isError ? (
        <EmptyState icon={Archive} title="Failed to load archives" description="Could not connect to the server." />
      ) : archivedJobs.length === 0 ? (
        <EmptyState
          icon={Archive}
          title="No archived jobs"
          description="Jobs that don't meet your criteria will be automatically archived here."
        />
      ) : (
        <>
          {/* Category Summary */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {categories.map((cat, i) => {
              const count = archivedJobs.filter((j) => j.archive_reason === cat.key).length
              return (
                <motion.div
                  key={cat.key}
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.06 }}
                  className={cn('glass rounded-2xl border p-4', cat.bg)}
                >
                  <cat.icon className={cn('w-5 h-5 mb-2', cat.color)} />
                  <p className="text-2xl font-bold text-foreground">{count}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{cat.label}</p>
                </motion.div>
              )
            })}
          </div>

          {/* Job List by Category */}
          <div className="space-y-6">
            {categories.map((cat) => {
              const catJobs = archivedJobs.filter((j) => j.archive_reason === cat.key)
              if (!catJobs.length) return null
              return (
                <motion.div
                  key={cat.key}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="glass rounded-2xl border border-border overflow-hidden"
                >
                  <div className="px-5 py-4 border-b border-border flex items-center gap-2.5">
                    <cat.icon className={cn('w-4 h-4', cat.color)} />
                    <h2 className="text-foreground font-medium text-sm">{cat.label}</h2>
                    <span className="text-xs text-muted-foreground ml-auto">{catJobs.length} jobs</span>
                  </div>

                  <div className="divide-y divide-border">
                    {catJobs.map((job, i) => (
                      <motion.div
                        key={job.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.05 }}
                        className="px-5 py-4 flex items-center gap-4 hover:bg-foreground/[0.03] transition-colors"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-foreground/85 font-medium text-sm truncate">{job.title}</p>
                          <p className="text-muted-foreground text-xs mt-0.5">{job.company} · {job.location}</p>
                        </div>
                        <span className={cn('text-xs px-2.5 py-1 rounded-full border', getMatchBg(job.match_score ?? 0))}>
                          {job.match_score ?? 0}%
                        </span>
                        <div className="flex flex-wrap gap-1 max-w-[200px]">
                          {(cat.key === 'missing_skills' ? (job.missing_skills ?? []) : (job.skills ?? [])).slice(0, 3).map((s: string) => (
                            <span key={s} className="text-xs bg-foreground/5 text-muted-foreground px-1.5 py-0.5 rounded">{s}</span>
                          ))}
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </motion.div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
