import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Search, LayoutGrid, List, Briefcase, X, ChevronDown,
  Sparkles, Import, TrendingUp, Clock, Star, GitCompare,
  Zap, CheckCircle2, Wifi, GraduationCap, Hourglass
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import JobCard from '@/components/jobs/JobCard'
import BulkApplyModal from '@/components/apply/BulkApplyModal'
import { useAppStore } from '@/store/useAppStore'
import { cn } from '@/lib/utils'
import { LoadingCards, EmptyState } from '@/components/ui/EmptyState'
import api from '@/lib/api'
import type { Job, FilterState } from '@/types'

// ── AI search parser ───────────────────────────────────────────────────────────
const SKILL_ALIASES: [string[], string][] = [
  [['python'], 'Python'],
  [['react', 'reactjs', 'react.js'], 'React'],
  [['java'], 'Java'],
  [['node', 'node.js', 'nodejs'], 'Node.js'],
  [['aws'], 'AWS'],
  [['fastapi'], 'FastAPI'],
  [['docker'], 'Docker'],
  [['typescript', 'ts '], 'TypeScript'],
  [['javascript', 'js '], 'JavaScript'],
  [['golang', 'go lang', ' go '], 'Golang'],
  [['rust'], 'Rust'],
  [['kotlin'], 'Kotlin'],
  [['flutter'], 'Flutter'],
  [['django'], 'Django'],
  [['flask'], 'Flask'],
  [['redis'], 'Redis'],
  [['kafka'], 'Kafka'],
  [['kubernetes', 'k8s'], 'Kubernetes'],
  [['terraform'], 'Terraform'],
  [['angular'], 'Angular'],
  [['vue'], 'Vue'],
  [['mongodb', 'mongo'], 'MongoDB'],
  [['postgresql', 'postgres'], 'PostgreSQL'],
  [['graphql'], 'GraphQL'],
  [['nextjs', 'next.js', 'next js'], 'Next.js'],
  [['machine learning', ' ml '], 'Machine Learning'],
  [['data science'], 'Data Science'],
  [['devops'], 'DevOps'],
]

function parseAIQuery(q: string): Partial<FilterState> {
  const lower = ' ' + q.toLowerCase() + ' '
  const out: Partial<FilterState> = {}

  if (lower.includes('remote')) out.locations = ['remote']
  else if (lower.includes('hybrid')) out.locations = ['hybrid']
  else if (lower.includes('onsite') || lower.includes(' office ')) out.locations = ['onsite']

  const underM = lower.match(/under\s+(\d+)|less than\s+(\d+)|<\s*(\d+)/)
  const plusM = lower.match(/(\d+)\+\s*(?:year|yr)/)
  if (underM) { out.experience_min = 0; out.experience_max = Number(underM[1] || underM[2] || underM[3]) }
  else if (plusM) out.experience_min = Number(plusM[1])
  else if (/fresher|entry\s+level|0\s*-\s*1/.test(lower)) { out.experience_min = 0; out.experience_max = 1 }

  const found: string[] = []
  for (const [aliases, canonical] of SKILL_ALIASES) {
    if (aliases.some(a => lower.includes(a))) found.push(canonical)
  }
  if (found.length) out.skills = found

  return out
}

// ── Filter Dropdown ────────────────────────────────────────────────────────────
interface DropdownProps {
  label: string
  active?: boolean
  activeCount?: number
  children: React.ReactNode
  onClear?: () => void
  width?: string
}

function FilterDropdown({ label, active, activeCount, children, onClear, width }: DropdownProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all whitespace-nowrap',
          active
            ? 'bg-accent/20 border-accent/50 text-accent'
            : 'glass border-border text-muted-foreground hover:text-foreground hover:border-accent/30'
        )}
      >
        {label}
        {activeCount && activeCount > 0 ? (
          <span className="w-4 h-4 rounded-full bg-accent text-white text-[10px] flex items-center justify-center font-bold">
            {activeCount}
          </span>
        ) : (
          <ChevronDown className={cn('w-3 h-3 transition-transform', open && 'rotate-180')} />
        )}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.97 }}
            transition={{ duration: 0.12 }}
            className={cn('absolute top-full left-0 mt-1.5 z-50 glass rounded-xl border border-border shadow-2xl shadow-black/40 p-3', width ?? 'min-w-[180px]')}
          >
            {children}
            {onClear && active && (
              <button
                onClick={() => { onClear(); setOpen(false) }}
                className="mt-2 w-full text-xs text-red-400/80 hover:text-red-400 text-center transition-colors"
              >
                Clear
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function FilterOption({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 w-full text-left text-xs px-2 py-1.5 rounded-lg transition-all',
        active ? 'bg-accent/20 text-accent' : 'text-muted-foreground hover:bg-foreground/5 hover:text-foreground'
      )}
    >
      <span className={cn('w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 transition-all',
        active ? 'bg-accent border-accent' : 'border-border'
      )}>
        {active && <CheckCircle2 className="w-2.5 h-2.5 text-white" />}
      </span>
      {label}
    </button>
  )
}

// ── Experience dual-range slider ────────────────────────────────────────────────
const EXP_MIN = 0
const EXP_MAX = 15 // "15+" — years beyond this are treated as unbounded

function ExperienceRangeSlider({ lo, hi, onChange, jobs }: {
  lo: number; hi: number; onChange: (lo: number, hi: number) => void; jobs: Job[]
}) {
  const count = jobs.filter(j => (j.experience_max ?? 99) >= lo && (j.experience_min ?? 0) <= hi).length
  const pctLo = ((lo - EXP_MIN) / (EXP_MAX - EXP_MIN)) * 100
  const pctHi = ((hi - EXP_MIN) / (EXP_MAX - EXP_MIN)) * 100

  return (
    <div className="w-60 space-y-3 px-1 py-1">
      <div className="flex items-center justify-between text-xs text-foreground/80 font-semibold">
        <span>{lo} yr{lo !== 1 ? 's' : ''}</span>
        <span>{hi >= EXP_MAX ? `${EXP_MAX}+ yrs` : `${hi} yrs`}</span>
      </div>
      <div className="relative h-4 flex items-center">
        <div className="absolute inset-x-0 h-1 bg-foreground/10 rounded-full" />
        <div className="absolute h-1 bg-accent rounded-full" style={{ left: `${pctLo}%`, right: `${100 - pctHi}%` }} />
        <input type="range" min={EXP_MIN} max={EXP_MAX} value={lo}
          onChange={e => onChange(Math.min(Number(e.target.value), hi), hi)}
          className="range-thumb absolute w-full h-4" />
        <input type="range" min={EXP_MIN} max={EXP_MAX} value={hi}
          onChange={e => onChange(lo, Math.max(Number(e.target.value), lo))}
          className="range-thumb absolute w-full h-4" />
      </div>
      <p className="text-[11px] text-muted-foreground text-center">{count} job{count !== 1 ? 's' : ''} in this range</p>
    </div>
  )
}

// ── Location searchable multi-select ────────────────────────────────────────────
const LOC_TYPE_OPTS = [{ v: 'remote', l: 'Remote' }, { v: 'hybrid', l: 'Hybrid' }, { v: 'onsite', l: 'Onsite' }]

function LocationMultiSelect({ selected, onToggle, cities, preferredCities }: {
  selected: string[]; onToggle: (v: string) => void; cities: string[]; preferredCities: string[]
}) {
  const [q, setQ] = useState('')
  const filteredCities = cities.filter(c => c.toLowerCase().includes(q.toLowerCase()))

  return (
    <div className="w-64 space-y-2">
      <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-foreground/5 border border-border">
        <Search className="w-3 h-3 text-muted-foreground shrink-0" />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search cities…"
          className="flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground/60 outline-none min-w-0" />
      </div>

      <div className="flex flex-wrap gap-1">
        {LOC_TYPE_OPTS.map(o => (
          <button key={o.v} onClick={() => onToggle(o.v)}
            className={cn('text-[11px] px-2 py-1 rounded-lg border transition-all',
              selected.includes(o.v) ? 'bg-accent/20 border-accent/50 text-accent' : 'border-border text-muted-foreground hover:text-foreground')}>
            {o.l}
          </button>
        ))}
      </div>

      {!q && preferredCities.length > 0 && (
        <div>
          <p className="text-[10px] text-muted-foreground/70 uppercase tracking-wide px-1 mb-1">Your preferred cities</p>
          <div className="max-h-24 overflow-y-auto space-y-0.5">
            {preferredCities.map(c => (
              <FilterOption key={c} label={c} active={selected.includes(c)} onClick={() => onToggle(c)} />
            ))}
          </div>
        </div>
      )}

      <div>
        {!q && preferredCities.length > 0 && <p className="text-[10px] text-muted-foreground/70 uppercase tracking-wide px-1 mb-1">All cities</p>}
        <div className="max-h-40 overflow-y-auto space-y-0.5 pr-1">
          {filteredCities.length === 0 ? (
            <p className="text-xs text-muted-foreground/60 px-2 py-1.5">No cities match "{q}"</p>
          ) : filteredCities.filter(c => !preferredCities.includes(c) || q).map(c => (
            <FilterOption key={c} label={c} active={selected.includes(c)} onClick={() => onToggle(c)} />
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Tabs ───────────────────────────────────────────────────────────────────────
// Regular users never see an undifferentiated "All Jobs" list — every job is bucketed
// by experience-fit + skill-fit first. Admins keep "All Jobs" to audit the raw pool.
const USER_TABS = [
  { id: 'recommended',   label: 'Recommended',   icon: Star },
  { id: 'need_learning', label: 'Need Learning', icon: GraduationCap },
  { id: 'future_fit',    label: 'Future Fit',    icon: Hourglass },
  { id: 'remote',        label: 'Remote',        icon: Wifi },
  { id: 'trending',      label: 'Trending',      icon: TrendingUp },
  { id: 'recent',        label: 'Recent',        icon: Clock },
]
const ADMIN_TABS = [{ id: 'all', label: 'All Jobs', icon: Briefcase }, ...USER_TABS]

// A job's experience fit is "compatible" once it clears the matching engine's own
// hard-cap threshold (matching_service._experience_score: exp_frac >= 0.85). Below
// that, the engine already caps the overall score and sets a descriptive
// experience_badge ("Needs N more years experience") — Future Fit surfaces that
// instead of hiding the job or saying "Don't Apply".
function experienceCompatible(j: Job): boolean {
  const exp = j.match_breakdown?.find(b => b.key === 'experience')
  // No experience data (e.g. profile incomplete) → don't penalize, matching the
  // engine's own rule that components without data never count against the candidate.
  if (!exp || !exp.available) return true
  return exp.pct >= 85
}
function skillFitPct(j: Job): number {
  return j.match_breakdown?.find(b => b.key === 'skills')?.pct ?? 0
}
function expFitPct(j: Job): number {
  return j.match_breakdown?.find(b => b.key === 'experience')?.pct ?? 0
}
function hasTag(j: Job, tag: string): boolean {
  return (j.smart_tags ?? []).some(t => t.toLowerCase().includes(tag))
}
function parseSalaryLpa(s?: string | null): number {
  if (!s) return 0
  const m = s.match(/(\d+(?:\.\d+)?)/)
  return m ? parseFloat(m[1]) : 0
}

const MATCH_OPTS = [60, 70, 80, 90]
const SORT_GROUPS: [string, string[]][] = [
  ['Match', ['Best Match', 'AI Recommended', 'Best Experience Fit', 'Least Missing Skills']],
  ['Freshness & Pay', ['Newest', 'Highest Salary']],
  ['Location', ['Closest Location', 'Remote First']],
  ['Company', ['Startup', 'MNC']],
  ['Apply Method', ['Fast Apply', 'Google Form', 'Company Portal']],
]
const SORT_OPTS = SORT_GROUPS.flatMap(([, opts]) => opts)

function sortJobs(jobs: Job[], sortBy: string, user: ReturnType<typeof useAppStore.getState>['user']): Job[] {
  const arr = [...jobs]
  const byScore = (a: Job, b: Job) => (b.match_score ?? 0) - (a.match_score ?? 0)
  const userCities = new Set([...(user?.preferred_locations ?? []), user?.current_location].filter(Boolean).map(c => (c as string).toLowerCase()))

  switch (sortBy) {
    case 'AI Recommended':
      return arr.sort((a, b) => Number(b.is_recommended) - Number(a.is_recommended) || byScore(a, b))
    case 'Best Experience Fit':
      return arr.sort((a, b) => expFitPct(b) - expFitPct(a) || byScore(a, b))
    case 'Least Missing Skills':
      return arr.sort((a, b) => (a.missing_skills?.length ?? 0) - (b.missing_skills?.length ?? 0) || byScore(a, b))
    case 'Newest':
      return arr.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    case 'Highest Salary':
      return arr.sort((a, b) => parseSalaryLpa(b.salary) - parseSalaryLpa(a.salary) || byScore(a, b))
    case 'Closest Location':
      return arr.sort((a, b) => {
        const near = (j: Job) => (j.location && userCities.has(j.location.toLowerCase())) ? 0 : 1
        return near(a) - near(b) || byScore(a, b)
      })
    case 'Remote First':
      return arr.sort((a, b) => Number(a.location_type !== 'remote') - Number(b.location_type !== 'remote') || byScore(a, b))
    case 'Startup':
      return arr.sort((a, b) => Number(!hasTag(a, 'startup')) - Number(!hasTag(b, 'startup')) || byScore(a, b))
    case 'MNC':
      return arr.sort((a, b) => Number(!hasTag(a, 'mnc')) - Number(!hasTag(b, 'mnc')) || byScore(a, b))
    case 'Fast Apply': {
      const rank = (j: Job) => j.application_type === 'email' ? 0 : (j.application_type && j.application_type !== 'none') ? 1 : 2
      return arr.sort((a, b) => rank(a) - rank(b) || byScore(a, b))
    }
    case 'Google Form':
      return arr.sort((a, b) => Number(a.application_type !== 'google_form') - Number(b.application_type !== 'google_form') || byScore(a, b))
    case 'Company Portal':
      return arr.sort((a, b) => Number(a.application_type !== 'portal') - Number(b.application_type !== 'portal') || byScore(a, b))
    case 'Best Match':
    default:
      return arr.sort(byScore)
  }
}

const AI_SUGGESTIONS = [
  'Remote Python jobs',
  'React jobs under 3 years',
  'FastAPI startup jobs',
  'AWS DevOps senior roles',
  'Full stack hybrid 5+ years',
]

// ── Compare Modal ──────────────────────────────────────────────────────────────
function CompareModal({ jobs, onClose }: { jobs: Job[]; onClose: () => void }) {
  const fields = [
    { label: 'Salary', key: 'salary' as keyof Job },
    { label: 'Experience', fn: (j: Job) => `${j.experience_min ?? 0}–${j.experience_max ?? '?'} yrs` },
    { label: 'Location', fn: (j: Job) => `${j.location} (${j.location_type})` },
    { label: 'Match', fn: (j: Job) => `${j.match_score ?? 0}%` },
    { label: 'Skills Required', fn: (j: Job) => (j.skills ?? []).slice(0, 4).join(', ') },
    { label: 'Missing Skills', fn: (j: Job) => (j.missing_skills ?? []).slice(0, 3).join(', ') || '—' },
    { label: 'Source', key: 'source' as keyof Job },
  ]

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9, y: 20 }}
        onClick={e => e.stopPropagation()}
        className="glass rounded-2xl border border-border p-6 max-w-3xl w-full max-h-[80vh] overflow-auto"
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-foreground font-bold text-lg flex items-center gap-2">
            <GitCompare className="w-5 h-5 text-accent" /> Compare Jobs
          </h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className={cn('grid gap-4 mb-4', jobs.length === 2 ? 'grid-cols-3' : 'grid-cols-4')}>
          <div />
          {jobs.map(j => (
            <div key={j.id} className="text-center">
              <p className="text-foreground font-medium text-sm">{j.title}</p>
              <p className="text-muted-foreground text-xs">{j.company}</p>
              <div className={cn(
                'mt-1 text-xs font-bold px-2 py-0.5 rounded-full inline-block',
                (j.match_score ?? 0) >= 80 ? 'text-emerald-400 bg-emerald-500/15' :
                (j.match_score ?? 0) >= 60 ? 'text-yellow-400 bg-yellow-500/15' : 'text-red-400 bg-red-500/15'
              )}>
                {j.match_score ?? 0}% match
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-1">
          {fields.map(({ label, key, fn }) => (
            <div key={label} className={cn('grid gap-4 px-3 py-2 rounded-lg', jobs.length === 2 ? 'grid-cols-3' : 'grid-cols-4')}>
              <p className="text-xs text-muted-foreground">{label}</p>
              {jobs.map(j => (
                <p key={j.id} className="text-xs text-foreground/80">
                  {fn ? fn(j) : (key ? String(j[key] ?? '—') : '—')}
                </p>
              ))}
            </div>
          ))}
        </div>

        <div className={cn('grid gap-4 mt-4', jobs.length === 2 ? 'grid-cols-3' : 'grid-cols-4')}>
          <div />
          {jobs.map(j => (
            <Link
              key={j.id}
              to={`/jobs/${j.id}`}
              className="text-center text-xs py-2 rounded-xl bg-accent hover:bg-accent/90 text-accent-foreground transition-colors"
            >
              View Details
            </Link>
          ))}
        </div>
      </motion.div>
    </motion.div>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function Jobs() {
  const [view, setView]           = useState<'grid' | 'list'>('grid')
  const [tab, setTab]             = useState('recommended')
  const [aiQuery, setAiQuery]     = useState('')
  const [aiMode, setAiMode]       = useState(false)
  const [sortBy, setSortBy]       = useState('Best Match')
  const [compareIds, setCompareIds] = useState<Set<string>>(new Set())
  const [showCompare, setShowCompare] = useState(false)
  const [showBulkApply, setShowBulkApply] = useState(false)
  const [suggestionIdx, setSuggestionIdx] = useState(0)
  const { filters, setFilters, clearFilters, user } = useAppStore()
  const isAdmin = user?.role === 'admin'
  const TABS = isAdmin ? ADMIN_TABS : USER_TABS

  // Cycle placeholder suggestions
  useEffect(() => {
    const t = setInterval(() => setSuggestionIdx(i => (i + 1) % AI_SUGGESTIONS.length), 3000)
    return () => clearInterval(t)
  }, [])

  const { data: allJobs = [], isLoading, isError } = useQuery<Job[]>({
    queryKey: ['jobs', filters],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (filters.match_score) params.set('min_match', String(filters.match_score))
      const { data } = await api.get(`/api/jobs/?${params}`)
      return data
    },
  })

  // Below a 40% match the job is never worth showing a regular user, and archived
  // jobs (auto or manual) belong on the dedicated Archives page, not here.
  const visibleJobs = isAdmin ? allJobs : allJobs.filter(j => (j.match_score ?? 0) >= 40 && j.status !== 'archived')
  const recommendedJobs = visibleJobs.filter(j => experienceCompatible(j) && skillFitPct(j) > 60)
  const needLearningJobs = visibleJobs.filter(j => experienceCompatible(j) && skillFitPct(j) <= 60)
  const futureFitJobs = visibleJobs.filter(j => !experienceCompatible(j))

  // All distinct city names currently in the pool, for the Location search — and
  // the user's own preferred cities pinned at the top of that same dropdown.
  const allCities = useMemo(() => {
    const set = new Set<string>()
    for (const j of allJobs) {
      const loc = (j.location || '').trim()
      if (loc && j.location_type !== 'remote') set.add(loc)
    }
    return [...set].sort()
  }, [allJobs])
  const preferredCities = user?.preferred_locations ?? []

  const allSkillOptions = useMemo(() => {
    const set = new Set<string>()
    for (const j of allJobs) for (const s of (j.skills ?? [])) if (s) set.add(s)
    return [...set].sort()
  }, [allJobs])
  const [skillSearch, setSkillSearch] = useState('')

  // Tab + skill + location + experience + sort filtering (client-side)
  const filtered = (() => {
    let jobs = [...visibleJobs]
    if (tab === 'remote') jobs = jobs.filter(j => j.location_type === 'remote')
    // Experience-compatible + skill fit >60% predicts whether applying is worth the
    // candidate's time; experience-incompatible jobs go to Future Fit instead of
    // being hidden or told "Don't Apply" (the card's experience_badge already reads
    // "Needs N more years experience"); score_suggestions has the per-skill
    // learning-time estimate for Need Learning jobs.
    if (tab === 'recommended') jobs = [...recommendedJobs]
    if (tab === 'need_learning') jobs = [...needLearningJobs]
    if (tab === 'future_fit') jobs = [...futureFitJobs]
    if (tab === 'trending') jobs = jobs.filter(j => (j.match_score ?? 0) >= 70)

    if (filters.skills?.length) {
      const wanted = filters.skills.map(s => s.toLowerCase())
      jobs = jobs.filter(j => {
        const have = (j.skills ?? []).map(x => x.toLowerCase())
        return filters.skills_mode === 'AND' ? wanted.every(s => have.includes(s)) : wanted.some(s => have.includes(s))
      })
    }
    if (filters.experience_min != null || filters.experience_max != null) {
      const lo = filters.experience_min ?? EXP_MIN
      const hi = filters.experience_max ?? EXP_MAX
      jobs = jobs.filter(j => (j.experience_max ?? 99) >= lo && (j.experience_min ?? 0) <= hi)
    }
    if (filters.locations?.length) {
      const types = new Set(filters.locations.filter(l => ['remote', 'hybrid', 'onsite'].includes(l)))
      const cities = filters.locations.filter(l => !types.has(l as 'remote'))
      jobs = jobs.filter(j =>
        (types.size > 0 && types.has(j.location_type)) ||
        (cities.length > 0 && cities.some(c => (j.location || '').toLowerCase() === c.toLowerCase()))
      )
    }

    return sortJobs(jobs, sortBy, user)
  })()

  function handleAISearch() {
    if (!aiQuery.trim()) { clearFilters(); setAiMode(false); return }
    const parsed = parseAIQuery(aiQuery)
    setFilters({ ...filters, ...parsed })
    setAiMode(true)
  }

  function handleAIKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') handleAISearch()
  }

  function clearAI() { setAiQuery(''); setAiMode(false); clearFilters() }

  const toggleSkill = useCallback((val: string) => {
    const curr = filters.skills ?? []
    const next = curr.includes(val) ? curr.filter(s => s !== val) : [...curr, val]
    setFilters({ ...filters, skills: next })
  }, [filters, setFilters])

  const toggleLocation = useCallback((val: string) => {
    const curr = filters.locations ?? []
    const next = curr.includes(val) ? curr.filter(l => l !== val) : [...curr, val]
    setFilters({ ...filters, locations: next })
  }, [filters, setFilters])

  const hasExperienceFilter = filters.experience_min != null || filters.experience_max != null
  const hasFilters = !!(hasExperienceFilter || filters.locations?.length || filters.match_score || filters.skills?.length)

  const compareJobs = allJobs.filter(j => compareIds.has(j.id))

  function toggleCompare(id: string) {
    setCompareIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) { next.delete(id) }
      else if (next.size < 3) { next.add(id) }
      return next
    })
  }

  return (
    <div className="w-full space-y-4">

      {/* ── Page Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Jobs</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {isLoading ? 'Loading…' : `${filtered.length} jobs found`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center glass rounded-xl p-1 border border-border">
            {([['grid', LayoutGrid], ['list', List]] as const).map(([v, Icon]) => (
              <button key={v} onClick={() => setView(v)}
                className={cn('p-1.5 rounded-lg transition-all', view === v ? 'bg-accent/30 text-accent' : 'text-muted-foreground hover:text-foreground')}>
                <Icon className="w-4 h-4" />
              </button>
            ))}
          </div>
          {isAdmin && (
            <Link to="/import">
              <motion.span whileTap={{ scale: 0.96 }}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-accent hover:bg-accent/90 text-accent-foreground text-sm font-medium transition-colors cursor-pointer">
                <Import className="w-4 h-4" /> Import Jobs
              </motion.span>
            </Link>
          )}
        </div>
      </div>

      {/* ── AI Search Bar ── */}
      <div className="relative">
        <div className={cn(
          'flex items-center gap-3 glass rounded-xl border px-4 py-3 transition-all',
          aiMode ? 'border-accent/50 ring-1 ring-accent/20' : 'border-border hover:border-accent/20'
        )}>
          {aiMode
            ? <Sparkles className="w-4 h-4 text-accent shrink-0" />
            : <Search className="w-4 h-4 text-muted-foreground shrink-0" />
          }
          <input
            value={aiQuery}
            onChange={e => { setAiQuery(e.target.value); if (!e.target.value) { setAiMode(false); clearFilters() } }}
            onKeyDown={handleAIKeyDown}
            placeholder={AI_SUGGESTIONS[suggestionIdx]}
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/60 outline-none"
          />
          {aiQuery && (
            <button onClick={clearAI} className="text-muted-foreground hover:text-foreground transition-colors">
              <X className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={handleAISearch}
            disabled={!aiQuery.trim()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent hover:bg-accent/90 text-accent-foreground text-xs font-medium transition-colors disabled:opacity-40"
          >
            <Sparkles className="w-3 h-3" /> Search
          </button>
        </div>
        {aiMode && (
          <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
            className="absolute -bottom-1 left-4 translate-y-full mt-1 text-xs text-accent/70 flex items-center gap-1.5 pt-1">
            <Zap className="w-3 h-3" /> AI parsed your query into filters below
          </motion.div>
        )}
      </div>

      {/* ── Filter Ribbon ── */}
      <div className={cn('transition-all', aiMode && 'mt-6')}>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Experience — dual-range slider with live count */}
          <FilterDropdown
            label={hasExperienceFilter ? `Exp: ${filters.experience_min ?? EXP_MIN}-${filters.experience_max ?? EXP_MAX}${(filters.experience_max ?? EXP_MAX) >= EXP_MAX ? '+' : ''} yrs` : 'Experience'}
            active={hasExperienceFilter}
            onClear={() => setFilters({ ...filters, experience_min: undefined, experience_max: undefined })}
          >
            <ExperienceRangeSlider
              lo={filters.experience_min ?? EXP_MIN}
              hi={filters.experience_max ?? EXP_MAX}
              jobs={visibleJobs}
              onChange={(lo, hi) => setFilters({ ...filters, experience_min: lo, experience_max: hi })}
            />
          </FilterDropdown>

          {/* Location — searchable multi-select of cities + remote/hybrid/onsite */}
          <FilterDropdown
            label="Location"
            active={!!(filters.locations?.length)}
            activeCount={filters.locations?.length}
            onClear={() => setFilters({ ...filters, locations: [] })}
            width="w-72"
          >
            <LocationMultiSelect
              selected={filters.locations ?? []}
              onToggle={toggleLocation}
              cities={allCities}
              preferredCities={preferredCities}
            />
          </FilterDropdown>

          {/* Skills — searchable, with an ANY (OR) / ALL (AND) match mode */}
          <FilterDropdown
            label="Skills"
            active={!!(filters.skills?.length)}
            activeCount={filters.skills?.length}
            onClear={() => setFilters({ ...filters, skills: [] })}
            width="w-64"
          >
            <div className="space-y-2">
              <div className="flex items-center gap-1 p-0.5 rounded-lg bg-foreground/5 border border-border">
                {(['OR', 'AND'] as const).map(mode => (
                  <button key={mode} onClick={() => setFilters({ ...filters, skills_mode: mode })}
                    className={cn('flex-1 text-[10px] py-1 rounded-md font-medium transition-all',
                      (filters.skills_mode ?? 'OR') === mode ? 'bg-accent/25 text-accent' : 'text-muted-foreground hover:text-foreground')}>
                    Match {mode === 'OR' ? 'ANY' : 'ALL'}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-foreground/5 border border-border">
                <Search className="w-3 h-3 text-muted-foreground shrink-0" />
                <input value={skillSearch} onChange={e => setSkillSearch(e.target.value)} placeholder="Search skills…"
                  className="flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground/60 outline-none min-w-0" />
              </div>
              <div className="max-h-52 overflow-y-auto space-y-0.5 pr-1">
                {allSkillOptions.filter(s => s.toLowerCase().includes(skillSearch.toLowerCase())).map(s => (
                  <FilterOption key={s} label={s} active={(filters.skills ?? []).includes(s)}
                    onClick={() => toggleSkill(s)} />
                ))}
              </div>
            </div>
          </FilterDropdown>

          {/* Match */}
          <FilterDropdown
            label="Match %"
            active={!!filters.match_score}
            onClear={() => setFilters({ ...filters, match_score: undefined })}
          >
            {MATCH_OPTS.map(o => (
              <FilterOption key={o} label={`${o}%+`} active={filters.match_score === o}
                onClick={() => setFilters({ ...filters, match_score: filters.match_score === o ? undefined : o })} />
            ))}
          </FilterDropdown>

          {/* Sort */}
          <FilterDropdown label={`Sort: ${sortBy}`} active={sortBy !== 'Best Match'} width="w-56">
            <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
              {SORT_GROUPS.map(([group, opts]) => (
                <div key={group}>
                  <p className="text-[10px] text-muted-foreground/70 uppercase tracking-wide px-1 mb-0.5">{group}</p>
                  {opts.map(o => (
                    <FilterOption key={o} label={o} active={sortBy === o} onClick={() => setSortBy(o)} />
                  ))}
                </div>
              ))}
            </div>
          </FilterDropdown>

          {/* Clear All */}
          {(hasFilters || aiMode) && (
            <motion.button initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
              onClick={clearAI}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs text-red-400/80 hover:text-red-400 border border-red-500/20 hover:border-red-500/40 transition-all">
              <X className="w-3 h-3" /> Clear All
            </motion.button>
          )}
        </div>

        {/* Active filter chips */}
        {hasFilters && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
            className="flex flex-wrap gap-1.5 mt-2.5">
            {hasExperienceFilter && (
              <ActiveChip
                label={`Exp: ${filters.experience_min ?? EXP_MIN}-${filters.experience_max ?? EXP_MAX}${(filters.experience_max ?? EXP_MAX) >= EXP_MAX ? '+' : ''} yrs`}
                onRemove={() => setFilters({ ...filters, experience_min: undefined, experience_max: undefined })} />
            )}
            {filters.locations?.map(l => (
              <ActiveChip key={l} label={l.charAt(0).toUpperCase() + l.slice(1)}
                onRemove={() => setFilters({ ...filters, locations: filters.locations!.filter(x => x !== l) })} />
            ))}
            {filters.match_score && (
              <ActiveChip label={`Match ${filters.match_score}%+`} onRemove={() => setFilters({ ...filters, match_score: undefined })} />
            )}
            {filters.skills?.map(s => (
              <ActiveChip key={s} label={s}
                onRemove={() => setFilters({ ...filters, skills: filters.skills!.filter(x => x !== s) })} />
            ))}
          </motion.div>
        )}
      </div>

      {/* ── Tabs ── */}
      <div className="flex items-center gap-1 border-b border-border">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setTab(id)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-all',
              tab === id
                ? 'border-accent text-accent'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}>
            <Icon className="w-3.5 h-3.5" />
            {label}
            {(id === 'recommended' || id === 'need_learning' || id === 'future_fit') && (
              <span className="px-1.5 py-0.5 rounded-full bg-accent/20 text-accent text-[10px]">
                {id === 'recommended' ? recommendedJobs.length : id === 'need_learning' ? needLearningJobs.length : futureFitJobs.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Content ── */}
      {isLoading ? (
        <LoadingCards count={8} />
      ) : isError ? (
        <EmptyState icon={Briefcase} title="Failed to load jobs"
          description="Could not connect to the server. Make sure the backend is running." />
      ) : filtered.length === 0 ? (
        isAdmin ? (
          <EmptyState icon={Briefcase} title="No jobs found"
            description="Import LinkedIn or WhatsApp job posts to start building the board."
            action={
              <Link to="/import" className="flex items-center gap-2 px-4 py-2 rounded-xl bg-accent text-accent-foreground text-sm font-medium hover:bg-accent/90 transition-colors">
                <Import className="w-4 h-4" /> Import Jobs
              </Link>
            }
          />
        ) : (
          <EmptyState icon={Briefcase} title="No jobs found"
            description="No approved jobs match your filters yet — new jobs are reviewed and published regularly. Try widening your filters or completing your profile for better matches."
            action={
              <Link to="/profile" className="flex items-center gap-2 px-4 py-2 rounded-xl bg-accent text-accent-foreground text-sm font-medium hover:bg-accent/90 transition-colors">
                Complete Profile
              </Link>
            }
          />
        )
      ) : (
        <motion.div layout className={cn(
          view === 'grid'
            ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4'
            : 'space-y-3'
        )}>
          {filtered.map((job, i) => (
            <JobCard
              key={job.id}
              job={job}
              index={i}
              compareMode={compareIds.size > 0}
              isCompared={compareIds.has(job.id)}
              onCompareToggle={() => toggleCompare(job.id)}
            />
          ))}
        </motion.div>
      )}

      {/* ── Compare Sticky Bar ── */}
      <AnimatePresence>
        {compareIds.size >= 2 && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 glass rounded-2xl border border-accent/30 px-5 py-3 flex items-center gap-4 shadow-2xl shadow-black/40"
          >
            <div className="flex items-center gap-2">
              <GitCompare className="w-4 h-4 text-accent" />
              <span className="text-sm text-foreground font-medium">{compareIds.size} jobs selected</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {compareJobs.map(j => (
                <span key={j.id} className="px-2 py-0.5 rounded bg-foreground/5 text-muted-foreground">{j.title.slice(0, 20)}</span>
              ))}
            </div>
            <button
              onClick={() => setCompareIds(new Set())}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Clear
            </button>
            <button
              onClick={() => setShowCompare(true)}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-accent hover:bg-accent/90 text-accent-foreground text-xs font-medium transition-colors"
            >
              Compare Now →
            </button>
            <button
              onClick={() => setShowBulkApply(true)}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-medium transition-colors"
            >
              ⚡ Apply All ({compareIds.size})
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Compare Modal ── */}
      <AnimatePresence>
        {showCompare && (
          <CompareModal jobs={compareJobs} onClose={() => setShowCompare(false)} />
        )}
      </AnimatePresence>

      {/* ── Bulk Apply (AI Application Agent) ── */}
      {showBulkApply && (
        <BulkApplyModal jobIds={[...compareIds]} onClose={() => setShowBulkApply(false)} />
      )}
    </div>
  )
}

function ActiveChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <motion.span
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.8 }}
      className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-accent/15 border border-accent/30 text-accent"
    >
      {label}
      <button onClick={onRemove} className="text-accent/60 hover:text-accent transition-colors">
        <X className="w-2.5 h-2.5" />
      </button>
    </motion.span>
  )
}
