import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { User, Briefcase, MapPin, Upload, Plus, X, ArrowRight, CheckCircle2 } from 'lucide-react'
import { useAppStore } from '@/store/useAppStore'
import api from '@/lib/api'
import Logo from '@/components/ui/Logo'
import toast from 'react-hot-toast'

const STEPS = ['Profile', 'Experience', 'Preferences', 'Resume']

export default function Onboarding() {
  const navigate = useNavigate()
  const { setUser } = useAppStore()
  const [step, setStep] = useState(0)
  const [loading, setLoading] = useState(false)

  const [form, setForm] = useState({
    phone: '',
    linkedin_url: '',
    github_url: '',
    portfolio_url: '',
    current_role: '',
    current_location: '',
    years_experience: '',
    skills: [] as string[],
    preferred_roles: [] as string[],
    preferred_locations: [] as string[],
  })
  const [skillInput, setSkillInput] = useState('')
  const [roleInput, setRoleInput] = useState('')
  const [locInput, setLocInput] = useState('')
  const [resumeFile, setResumeFile] = useState<File | null>(null)

  function setField(key: string, value: string) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function addTag(field: 'skills' | 'preferred_roles' | 'preferred_locations', value: string) {
    const trimmed = value.trim()
    if (!trimmed) return
    setForm((f) => ({ ...f, [field]: [...f[field], trimmed] }))
  }

  function removeTag(field: 'skills' | 'preferred_roles' | 'preferred_locations', idx: number) {
    setForm((f) => ({ ...f, [field]: f[field].filter((_, i) => i !== idx) }))
  }

  async function handleFinish() {
    setLoading(true)
    try {
      const payload = {
        ...form,
        years_experience: form.years_experience ? parseInt(form.years_experience) : null,
      }
      const { data } = await api.post('/api/users/onboarding', payload)
      setUser(data)

      if (resumeFile) {
        const fd = new FormData()
        fd.append('file', resumeFile)
        await api.post('/api/resumes/upload', fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
      }

      toast.success('Profile complete! Welcome to HireFlow.')
      navigate('/')
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to save profile')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0f1e] flex items-center justify-center p-4 relative overflow-hidden">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/3 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-72 h-72 bg-cyan-600/8 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-2xl">
        <div className="flex justify-center mb-8">
          <Logo size={44} />
        </div>

        {/* Step indicators */}
        <div className="flex items-center justify-center gap-3 mb-8">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center gap-3">
              <div className={`flex items-center gap-2 ${i <= step ? 'text-white' : 'text-white/30'}`}>
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border ${
                  i < step ? 'bg-indigo-600 border-indigo-600' :
                  i === step ? 'border-indigo-500 text-indigo-400' :
                  'border-white/20'
                }`}>
                  {i < step ? <CheckCircle2 className="w-4 h-4" /> : i + 1}
                </div>
                <span className="text-sm hidden sm:block">{s}</span>
              </div>
              {i < STEPS.length - 1 && <div className={`w-8 h-px ${i < step ? 'bg-indigo-600' : 'bg-white/10'}`} />}
            </div>
          ))}
        </div>

        <div className="glass rounded-2xl border border-white/10 p-8">
          <AnimatePresence mode="wait">
            {step === 0 && (
              <StepPanel key="profile" title="Your Profile" subtitle="Let recruiters know who you are" icon={User}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="Phone" value={form.phone} onChange={(v) => setField('phone', v)} placeholder="+91 98765 43210" />
                  <Field label="Current Role" value={form.current_role} onChange={(v) => setField('current_role', v)} placeholder="Software Engineer" />
                  <Field label="Current Location" value={form.current_location} onChange={(v) => setField('current_location', v)} placeholder="Bangalore, India" />
                  <Field label="LinkedIn URL" value={form.linkedin_url} onChange={(v) => setField('linkedin_url', v)} placeholder="linkedin.com/in/yourname" />
                  <Field label="GitHub URL" value={form.github_url} onChange={(v) => setField('github_url', v)} placeholder="github.com/yourname" />
                  <Field label="Portfolio URL" value={form.portfolio_url} onChange={(v) => setField('portfolio_url', v)} placeholder="yoursite.com" />
                </div>
              </StepPanel>
            )}

            {step === 1 && (
              <StepPanel key="experience" title="Experience & Skills" subtitle="Tell us what you know" icon={Briefcase}>
                <Field
                  label="Years of Experience"
                  type="number"
                  value={form.years_experience}
                  onChange={(v) => setField('years_experience', v)}
                  placeholder="3"
                />
                <div className="mt-4">
                  <label className="text-xs text-white/50 uppercase tracking-wider mb-2 block">Skills</label>
                  <TagInput
                    placeholder="Type a skill and press Enter (e.g. React)"
                    value={skillInput}
                    onChange={setSkillInput}
                    onAdd={() => { addTag('skills', skillInput); setSkillInput('') }}
                    tags={form.skills}
                    onRemove={(i) => removeTag('skills', i)}
                    color="indigo"
                  />
                </div>
              </StepPanel>
            )}

            {step === 2 && (
              <StepPanel key="preferences" title="Job Preferences" subtitle="What are you looking for?" icon={MapPin}>
                <div className="space-y-4">
                  <div>
                    <label className="text-xs text-white/50 uppercase tracking-wider mb-2 block">Preferred Roles</label>
                    <TagInput
                      placeholder="e.g. Frontend Engineer, Full Stack"
                      value={roleInput}
                      onChange={setRoleInput}
                      onAdd={() => { addTag('preferred_roles', roleInput); setRoleInput('') }}
                      tags={form.preferred_roles}
                      onRemove={(i) => removeTag('preferred_roles', i)}
                      color="cyan"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-white/50 uppercase tracking-wider mb-2 block">Preferred Locations</label>
                    <TagInput
                      placeholder="e.g. Remote, Bangalore, Mumbai"
                      value={locInput}
                      onChange={setLocInput}
                      onAdd={() => { addTag('preferred_locations', locInput); setLocInput('') }}
                      tags={form.preferred_locations}
                      onRemove={(i) => removeTag('preferred_locations', i)}
                      color="violet"
                    />
                  </div>
                </div>
              </StepPanel>
            )}

            {step === 3 && (
              <StepPanel key="resume" title="Upload Resume" subtitle="PDF format, max 10MB — optional but recommended" icon={Upload}>
                <label className="relative block cursor-pointer">
                  <input
                    type="file"
                    accept=".pdf"
                    className="hidden"
                    onChange={(e) => setResumeFile(e.target.files?.[0] ?? null)}
                  />
                  <div className={`border-2 border-dashed rounded-xl p-10 text-center transition-colors ${
                    resumeFile ? 'border-indigo-500/50 bg-indigo-500/5' : 'border-white/10 hover:border-white/20'
                  }`}>
                    {resumeFile ? (
                      <div className="flex items-center justify-center gap-3">
                        <CheckCircle2 className="w-6 h-6 text-emerald-400" />
                        <div>
                          <p className="text-white font-medium">{resumeFile.name}</p>
                          <p className="text-white/40 text-sm">{(resumeFile.size / 1024 / 1024).toFixed(2)} MB</p>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => { e.preventDefault(); setResumeFile(null) }}
                          className="ml-2 text-white/30 hover:text-white/60"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <div>
                        <Upload className="w-10 h-10 text-white/20 mx-auto mb-3" />
                        <p className="text-white/60 text-sm">Click to upload your resume (PDF)</p>
                        <p className="text-white/30 text-xs mt-1">AI will analyze it for ATS score and skill gaps</p>
                      </div>
                    )}
                  </div>
                </label>
              </StepPanel>
            )}
          </AnimatePresence>

          <div className="flex justify-between mt-8 pt-6 border-t border-white/10">
            {step > 0 ? (
              <button
                onClick={() => setStep(step - 1)}
                className="px-5 py-2.5 rounded-xl glass border border-white/10 text-sm text-white/70 hover:text-white transition-colors"
              >
                Back
              </button>
            ) : <div />}

            {step < STEPS.length - 1 ? (
              <motion.button
                whileTap={{ scale: 0.98 }}
                onClick={() => setStep(step + 1)}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors"
              >
                Continue <ArrowRight className="w-4 h-4" />
              </motion.button>
            ) : (
              <motion.button
                whileTap={{ scale: 0.98 }}
                disabled={loading}
                onClick={handleFinish}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors disabled:opacity-60"
              >
                {loading ? (
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>Complete Setup <CheckCircle2 className="w-4 h-4" /></>
                )}
              </motion.button>
            )}
          </div>
        </div>

        <p className="text-center text-xs text-white/20 mt-4">You can update all this later in Settings</p>
      </div>
    </div>
  )
}

function StepPanel({
  title,
  subtitle,
  icon: Icon,
  children,
}: {
  title: string
  subtitle: string
  icon: typeof User
  children: React.ReactNode
}) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.2 }}
    >
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center">
          <Icon className="w-5 h-5 text-indigo-400" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-white">{title}</h2>
          <p className="text-xs text-white/40">{subtitle}</p>
        </div>
      </div>
      {children}
    </motion.div>
  )
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
}) {
  return (
    <div>
      <label className="text-xs text-white/50 uppercase tracking-wider mb-1.5 block">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full glass rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-white/25 border border-white/10 focus:border-indigo-500/50 focus:outline-none transition-colors"
      />
    </div>
  )
}

function TagInput({
  placeholder,
  value,
  onChange,
  onAdd,
  tags,
  onRemove,
  color,
}: {
  placeholder: string
  value: string
  onChange: (v: string) => void
  onAdd: () => void
  tags: string[]
  onRemove: (i: number) => void
  color: 'indigo' | 'cyan' | 'violet'
}) {
  const colorMap = {
    indigo: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/20',
    cyan: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/20',
    violet: 'bg-violet-500/20 text-violet-300 border-violet-500/20',
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onAdd() } }}
          placeholder={placeholder}
          className="flex-1 glass rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-white/25 border border-white/10 focus:border-indigo-500/50 focus:outline-none transition-colors"
        />
        <button
          type="button"
          onClick={onAdd}
          className="px-3 py-2 rounded-xl glass border border-white/10 text-white/60 hover:text-white hover:bg-white/10 transition-colors"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {tags.map((tag, i) => (
            <span
              key={i}
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs border ${colorMap[color]}`}
            >
              {tag}
              <button onClick={() => onRemove(i)} className="opacity-60 hover:opacity-100">
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
