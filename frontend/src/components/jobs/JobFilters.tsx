import { motion } from 'framer-motion'
import { SlidersHorizontal, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store/useAppStore'

const experienceOpts = ['Fresher', '1+', '2+', '3+', '5+']
const locationOpts = ['Remote', 'Hybrid', 'Onsite']
const skillOpts = ['Python', 'Java', 'React', 'Node', 'AWS', 'FastAPI', 'Docker', 'TypeScript']
const matchOpts = [70, 80, 90]

export default function JobFilters() {
  const { filters, setFilters, clearFilters } = useAppStore()
  const hasFilters = Object.keys(filters).some((k) => k !== 'search' && k !== 'search_by' && filters[k as keyof typeof filters])

  const toggle = (key: string, value: string | number) => {
    if (key === 'skills') {
      const current = (filters.skills ?? []) as string[]
      const next = current.includes(value as string)
        ? current.filter((s) => s !== value)
        : [...current, value as string]
      setFilters({ ...filters, skills: next })
    } else {
      setFilters({ ...filters, [key]: filters[key as keyof typeof filters] === value ? undefined : value })
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      className="glass rounded-2xl border border-white/10 p-4 space-y-5 sticky top-22"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-white font-medium text-sm">
          <SlidersHorizontal className="w-4 h-4 text-blue-400" />
          Filters
        </div>
        {hasFilters && (
          <button onClick={clearFilters} className="text-xs text-white/40 hover:text-red-400 transition-colors flex items-center gap-1">
            <X className="w-3 h-3" /> Clear
          </button>
        )}
      </div>

      <FilterSection label="Experience">
        {experienceOpts.map((opt) => (
          <FilterChip
            key={opt}
            label={opt}
            active={filters.experience === opt}
            onClick={() => toggle('experience', opt)}
          />
        ))}
      </FilterSection>

      <FilterSection label="Location Type">
        {locationOpts.map((opt) => (
          <FilterChip
            key={opt}
            label={opt}
            active={filters.location_type === opt}
            onClick={() => toggle('location_type', opt)}
          />
        ))}
      </FilterSection>

      <FilterSection label="Skills">
        {skillOpts.map((opt) => (
          <FilterChip
            key={opt}
            label={opt}
            active={(filters.skills ?? []).includes(opt)}
            onClick={() => toggle('skills', opt)}
          />
        ))}
      </FilterSection>

      <FilterSection label="Match Score">
        {matchOpts.map((opt) => (
          <FilterChip
            key={opt}
            label={`${opt}%+`}
            active={filters.match_score === opt}
            onClick={() => toggle('match_score', opt)}
          />
        ))}
      </FilterSection>
    </motion.div>
  )
}

function FilterSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-xs text-white/40 uppercase tracking-wider font-medium">{label}</p>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  )
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'text-xs px-2.5 py-1 rounded-lg border transition-all',
        active
          ? 'bg-blue-500/25 border-blue-500/50 text-blue-300'
          : 'bg-white/5 border-white/10 text-white/50 hover:border-white/25 hover:text-white/80'
      )}
    >
      {label}
    </button>
  )
}
