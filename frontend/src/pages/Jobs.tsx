import { useState } from 'react'
import { motion } from 'framer-motion'
import { LayoutGrid, List, Import, Briefcase } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import JobCard from '@/components/jobs/JobCard'
import JobFilters from '@/components/jobs/JobFilters'
import { useAppStore } from '@/store/useAppStore'
import { cn } from '@/lib/utils'
import { LoadingCards, EmptyState } from '@/components/ui/EmptyState'
import api from '@/lib/api'
import type { Job } from '@/types'

export default function Jobs() {
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const { filters } = useAppStore()

  const { data: jobs, isLoading, isError } = useQuery<Job[]>({
    queryKey: ['jobs', filters],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (filters.match_score) params.set('min_match', String(filters.match_score))
      if (filters.location_type) params.set('location_type', filters.location_type)
      if (filters.skills?.length) params.set('skills', filters.skills.join(','))
      const { data } = await api.get(`/api/jobs/?${params}`)
      return data
    },
  })

  const filtered = jobs ?? []

  return (
    <div className="flex gap-6">
      <div className="w-52 shrink-0">
        <JobFilters />
      </div>

      <div className="flex-1 min-w-0 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Jobs</h1>
            <p className="text-white/40 text-sm mt-0.5">
              {isLoading ? 'Loading...' : `${filtered.length} jobs found`}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center glass rounded-xl p-1 border border-white/10">
              {([['grid', LayoutGrid], ['list', List]] as const).map(([v, Icon]) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={cn(
                    'p-1.5 rounded-lg transition-all',
                    view === v ? 'bg-indigo-500/30 text-indigo-400' : 'text-white/40 hover:text-white/70'
                  )}
                >
                  <Icon className="w-4 h-4" />
                </button>
              ))}
            </div>

            <Link to="/import">
              <motion.span
                whileTap={{ scale: 0.96 }}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors cursor-pointer"
              >
                <Import className="w-4 h-4" />
                Import Jobs
              </motion.span>
            </Link>
          </div>
        </div>

        {/* Active Filters */}
        {Object.keys(filters).some((k) => k !== 'search' && k !== 'search_by' && filters[k as keyof typeof filters]) && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="flex flex-wrap gap-2">
            {filters.experience && <FilterTag label={`Exp: ${filters.experience}`} />}
            {filters.location_type && <FilterTag label={filters.location_type} />}
            {filters.match_score && <FilterTag label={`Match: ${filters.match_score}%+`} />}
            {filters.skills?.map((s) => <FilterTag key={s} label={s} />)}
          </motion.div>
        )}

        {/* Content */}
        {isLoading ? (
          <LoadingCards count={6} />
        ) : isError ? (
          <EmptyState icon={Briefcase} title="Failed to load jobs" description="Could not connect to the server. Make sure the backend is running." />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Briefcase}
            title="No jobs yet"
            description="Import LinkedIn posts or job descriptions to start building your job board."
            action={
              <Link to="/import" className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-500 transition-colors">
                <Import className="w-4 h-4" /> Import Jobs
              </Link>
            }
          />
        ) : (
          <motion.div
            layout
            className={cn(
              view === 'grid'
                ? 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4'
                : 'space-y-3'
            )}
          >
            {filtered.map((job, i) => (
              <JobCard key={job.id} job={job} index={i} />
            ))}
          </motion.div>
        )}
      </div>
    </div>
  )
}

function FilterTag({ label }: { label: string }) {
  return (
    <span className="text-xs px-2.5 py-1 rounded-full glass border border-indigo-500/30 text-indigo-400">
      {label}
    </span>
  )
}
