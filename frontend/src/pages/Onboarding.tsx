import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { User, Briefcase, MapPin, Upload, X, ArrowRight, CheckCircle2, Sparkles, Pencil } from 'lucide-react'
import { useAppStore } from '@/store/useAppStore'
import api from '@/lib/api'
import Logo from '@/components/ui/Logo'
import SkillsMultiSelect from '@/components/ui/SkillsMultiSelect'
import SearchableMultiSelect from '@/components/ui/SearchableMultiSelect'
import { POPULAR_ROLES, ALL_ROLES, isRoleInMasterList } from '@/data/roles'
import { POPULAR_LOCATIONS, ALL_LOCATIONS, isLocationInMasterList } from '@/data/locations'
import type { Resume, SkillIntelligence } from '@/types'
import toast from 'react-hot-toast'

const STEPS = ['Resume', 'Profile', 'Experience', 'Preferences']
const CONFIDENCE_THRESHOLD = 80

// onboarding_fields keys → the form field each one fills
const FIELD_MAP: Record<string, string> = {
  current_role: 'current_role',
  current_company: 'current_company',
  years_experience: 'years_experience',
  current_location: 'current_location',
  phone: 'phone',
  linkedin_url: 'linkedin_url',
  github_url: 'github_url',
  portfolio_url: 'portfolio_url',
}
const FIELD_LABELS: Record<string, string> = {
  current_role: 'Current Role', current_company: 'Current Company', years_experience: 'Years of Experience',
  current_location: 'Location', phone: 'Phone', linkedin_url: 'LinkedIn', github_url: 'GitHub', portfolio_url: 'Portfolio',
}

export default function Onboarding() {
  const navigate = useNavigate()
  const { setUser, theme } = useAppStore()
  const [step, setStep] = useState(0)
  const [loading, setLoading] = useState(false)

  const [form, setForm] = useState({
    phone: '',
    linkedin_url: '',
    github_url: '',
    portfolio_url: '',
    current_role: '',
    current_company: '',
    current_location: '',
    years_experience: '',
    skills: [] as string[],
    preferred_roles: [] as string[],
    preferred_locations: [] as string[],
  })
  const [resumeFile, setResumeFile] = useState<File | null>(null)
  const [uploadingResume, setUploadingResume] = useState(false)
  const [uploadedResume, setUploadedResume] = useState<Resume | null>(null)
  // Which low-confidence onboarding fields the user has explicitly resolved (accepted or edited)
  const [resolvedFields, setResolvedFields] = useState<Set<string>>(new Set())
  const [editingField, setEditingField] = useState<string | null>(null)

  function setField(key: string, value: string) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function handleResumeUpload(file: File) {
    setResumeFile(file)
    setUploadingResume(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const { data } = await api.post<Resume>('/api/resumes/upload', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setUploadedResume(data)

      // Auto-accept every high-confidence field straight into the form.
      const fields = data.onboarding_fields ?? {}
      const patch: Record<string, string> = {}
      for (const [key, formKey] of Object.entries(FIELD_MAP)) {
        const f = fields[key]
        if (f && f.value != null && f.confidence >= CONFIDENCE_THRESHOLD) {
          patch[formKey] = String(f.value)
        }
      }
      // High-confidence skills auto-added; low-confidence ones offered separately below.
      const highConfSkills = (data.skill_intelligence ?? [])
        .filter(s => (s.confidence ?? 0) >= CONFIDENCE_THRESHOLD)
        .map(s => s.skill)
      if (highConfSkills.length) {
        setForm(f => ({ ...f, ...patch, skills: [...new Set([...f.skills, ...highConfSkills])] } as any))
      } else if (Object.keys(patch).length) {
        setForm(f => ({ ...f, ...patch }))
      }

      const lowConfCount = Object.values(fields).filter(f => f.value != null && f.confidence < CONFIDENCE_THRESHOLD).length
      toast.success(lowConfCount > 0
        ? `Resume analyzed — please confirm ${lowConfCount} field${lowConfCount !== 1 ? 's' : ''} below`
        : 'Resume analyzed — details filled in below')
    } catch (err: unknown) {
      const error = err as { response?: { data?: { detail?: string } } }
      toast.error(error.response?.data?.detail || 'Failed to analyze resume')
      setResumeFile(null)
    } finally {
      setUploadingResume(false)
    }
  }

  function acceptField(key: string) {
    const f = uploadedResume?.onboarding_fields?.[key]
    if (f && f.value != null) setField(FIELD_MAP[key], String(f.value))
    setResolvedFields(s => new Set(s).add(key))
    setEditingField(null)
  }
  function editField(key: string) {
    setEditingField(key)
  }
  function saveEditedField(key: string, value: string) {
    setField(FIELD_MAP[key], value)
    setResolvedFields(s => new Set(s).add(key))
    setEditingField(null)
  }
  function toggleLowConfSkill(skill: string) {
    setForm(f => ({
      ...f,
      skills: f.skills.includes(skill) ? f.skills.filter(x => x !== skill) : [...f.skills, skill],
    }))
  }

  const lowConfidenceFields = Object.entries(uploadedResume?.onboarding_fields ?? {})
    .filter(([, f]) => f.value != null && f.confidence < CONFIDENCE_THRESHOLD)
  const lowConfidenceSkills = (uploadedResume?.skill_intelligence ?? [])
    .filter((s: SkillIntelligence) => (s.confidence ?? 0) < CONFIDENCE_THRESHOLD && (s.confidence ?? 0) >= 30)

  async function handleFinish() {
    if (!form.current_role.trim()) { toast.error('Please enter your current role'); setStep(1); return }
    if (!form.current_location.trim()) { toast.error('Please enter your current location'); setStep(1); return }
    if (!form.phone.trim()) { toast.error('Please enter your phone number'); setStep(1); return }
    if (!form.years_experience.trim()) { toast.error('Please enter your years of experience'); setStep(2); return }
    if (form.skills.length === 0) { toast.error('Please select at least one skill'); setStep(2); return }
    if (form.preferred_roles.length === 0) { toast.error('Please select at least one preferred role'); setStep(3); return }
    if (form.preferred_locations.length === 0) { toast.error('Please select at least one preferred location'); setStep(3); return }
    if (!uploadedResume) { toast.error('Please upload your resume'); setStep(0); return }

    setLoading(true)
    try {
      const payload = {
        phone: form.phone,
        current_role: form.current_role,
        current_company: form.current_company,
        current_location: form.current_location,
        linkedin_url: form.linkedin_url,
        github_url: form.github_url,
        portfolio_url: form.portfolio_url,
        years_experience: parseInt(form.years_experience) || 0,
        skills: form.skills,
        preferred_roles: form.preferred_roles,
        preferred_locations: form.preferred_locations,
        resume_id: uploadedResume.id,
      }

      const { data } = await api.post('/api/users/onboarding/complete', payload)
      setUser(data.user)

      toast.success('Profile complete! Welcome to HireFlow.')
      navigate(data.redirect || '/')
    } catch (err: unknown) {
      const error = err as { response?: { data?: { detail?: string } } }
      toast.error(error.response?.data?.detail || 'Failed to save profile')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 relative overflow-hidden">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/3 w-96 h-96 rounded-full blur-3xl" style={{ background: 'var(--orb-1)' }} />
        <div className="absolute bottom-1/4 right-1/4 w-72 h-72 rounded-full blur-3xl" style={{ background: 'var(--orb-3)' }} />
      </div>

      <div className="w-full max-w-2xl">
        <div className="flex justify-center mb-8">
          <Logo size={44} theme={theme === 'light' ? 'light' : 'dark'} />
        </div>

        {/* Step indicators */}
        <div className="flex items-center justify-center gap-3 mb-8">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center gap-3">
              <div className={`flex items-center gap-2 ${i <= step ? 'text-foreground' : 'text-muted-foreground'}`}>
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border ${
                  i < step ? 'bg-accent border-accent text-accent-foreground' :
                  i === step ? 'border-accent text-accent' :
                  'border-border'
                }`}>
                  {i < step ? <CheckCircle2 className="w-4 h-4" /> : i + 1}
                </div>
                <span className="text-sm hidden sm:block">{s}</span>
              </div>
              {i < STEPS.length - 1 && <div className={`w-8 h-px ${i < step ? 'bg-accent' : 'bg-border'}`} />}
            </div>
          ))}
        </div>

        <div className="glass rounded-2xl border border-border p-8">
          <>
            {step === 0 && (
              <StepPanel key="resume" title="Upload Resume" subtitle="PDF format, max 10MB — AI fills in the rest of this form for you" icon={Upload}>
                <label className="relative block cursor-pointer">
                  <input
                    type="file"
                    accept=".pdf"
                    className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleResumeUpload(f) }}
                    disabled={loading || uploadingResume}
                  />
                  <div className={`border-2 border-dashed rounded-xl p-10 text-center transition-colors ${
                    resumeFile ? 'border-accent/50 bg-accent/5' : 'border-border hover:border-accent/30'
                  } ${loading || uploadingResume ? 'opacity-50 cursor-not-allowed' : ''}`}>
                    {uploadingResume ? (
                      <div className="flex items-center justify-center gap-3">
                        <span className="w-6 h-6 border-2 border-border border-t-foreground rounded-full animate-spin" />
                        <p className="text-muted-foreground text-sm">Uploading and analyzing resume...</p>
                      </div>
                    ) : resumeFile ? (
                      <div className="flex items-center justify-center gap-3">
                        <CheckCircle2 className="w-6 h-6 text-emerald-400" />
                        <div>
                          <p className="text-foreground font-medium">{resumeFile.name}</p>
                          <p className="text-muted-foreground text-sm">{(resumeFile.size / 1024 / 1024).toFixed(2)} MB</p>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => { e.preventDefault(); setResumeFile(null); setUploadedResume(null); setResolvedFields(new Set()) }}
                          className="ml-2 text-muted-foreground hover:text-muted-foreground"
                          disabled={loading}
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <div>
                        <Upload className="w-10 h-10 text-muted-foreground/60 mx-auto mb-3" />
                        <p className="text-muted-foreground text-sm">Click to upload your resume (PDF)</p>
                        <p className="text-muted-foreground text-xs mt-1">AI will read your role, company, skills, links and more</p>
                      </div>
                    )}
                  </div>
                </label>

                {/* AI extraction confidence review */}
                {uploadedResume && (
                  <div className="mt-5 space-y-3">
                    <p className="flex items-center gap-1.5 text-xs text-accent/80 font-medium">
                      <Sparkles className="w-3.5 h-3.5" /> AI-extracted from your resume
                    </p>

                    {/* High-confidence, auto-accepted fields */}
                    <div className="flex flex-wrap gap-1.5">
                      {Object.entries(uploadedResume.onboarding_fields ?? {})
                        .filter(([, f]) => f.value != null && f.confidence >= CONFIDENCE_THRESHOLD)
                        .map(([key, f]) => (
                          <span key={key} className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-emerald-400">
                            <CheckCircle2 className="w-3 h-3" /> {FIELD_LABELS[key]}: {String(f.value)} · {f.confidence}%
                          </span>
                        ))}
                    </div>

                    {/* Low-confidence fields — needs a Yes/Edit decision */}
                    {lowConfidenceFields.filter(([key]) => !resolvedFields.has(key)).map(([key, f]) => (
                      <div key={key} className="flex items-center gap-2 p-2.5 rounded-xl bg-amber-500/8 border border-amber-500/20">
                        <div className="flex-1 min-w-0 text-xs">
                          <span className="text-amber-300/90">{FIELD_LABELS[key]}: </span>
                          {editingField === key ? (
                            <input
                              autoFocus
                              defaultValue={String(f.value)}
                              onKeyDown={e => { if (e.key === 'Enter') saveEditedField(key, (e.target as HTMLInputElement).value) }}
                              onBlur={e => saveEditedField(key, e.target.value)}
                              className="mt-1 w-full glass rounded-lg px-2 py-1 text-xs text-foreground border border-accent/40 focus:outline-none"
                            />
                          ) : (
                            <span className="text-foreground/85 font-medium">{String(f.value)}</span>
                          )}
                          <span className="text-amber-400/60 ml-1.5">({f.confidence}% sure — is this correct?)</span>
                        </div>
                        {editingField !== key && (
                          <div className="flex items-center gap-1 shrink-0">
                            <button onClick={() => acceptField(key)} className="p-1.5 rounded-lg text-emerald-400 hover:bg-emerald-500/10"><CheckCircle2 className="w-3.5 h-3.5" /></button>
                            <button onClick={() => editField(key)} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-foreground/5"><Pencil className="w-3.5 h-3.5" /></button>
                          </div>
                        )}
                      </div>
                    ))}
                    {lowConfidenceFields.filter(([key]) => resolvedFields.has(key)).map(([key]) => (
                      <span key={key} className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-full bg-foreground/5 border border-border text-muted-foreground w-fit">
                        <CheckCircle2 className="w-3 h-3 text-emerald-400" /> {FIELD_LABELS[key]}: {(form as any)[FIELD_MAP[key]]} (confirmed)
                      </span>
                    ))}

                    {/* Low-confidence skills — opt-in chips */}
                    {lowConfidenceSkills.length > 0 && (
                      <div>
                        <p className="text-[11px] text-muted-foreground mb-1.5">AI also spotted these skills — add if correct:</p>
                        <div className="flex flex-wrap gap-1.5">
                          {lowConfidenceSkills.map(s => (
                            <button key={s.skill} onClick={() => toggleLowConfSkill(s.skill)}
                              className={`text-[11px] px-2 py-1 rounded-full border transition-colors ${
                                form.skills.includes(s.skill)
                                  ? 'bg-accent/20 border-accent/40 text-accent'
                                  : 'border-border text-muted-foreground hover:text-foreground'
                              }`}>
                              {form.skills.includes(s.skill) && <CheckCircle2 className="w-2.5 h-2.5 inline mr-1" />}
                              {s.skill} · {s.confidence}%
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </StepPanel>
            )}

            {step === 1 && (
              <StepPanel key="profile" title="Your Profile" subtitle="Let recruiters know who you are" icon={User}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="Phone" value={form.phone} onChange={(v) => setField('phone', v)} placeholder="+91 98765 43210" />
                  <Field label="Current Role" value={form.current_role} onChange={(v) => setField('current_role', v)} placeholder="Software Engineer" />
                  <Field label="Current Company" value={form.current_company} onChange={(v) => setField('current_company', v)} placeholder="Acme Corp" />
                  <Field label="Current Location" value={form.current_location} onChange={(v) => setField('current_location', v)} placeholder="Bangalore, India" />
                  <Field label="LinkedIn URL" value={form.linkedin_url} onChange={(v) => setField('linkedin_url', v)} placeholder="linkedin.com/in/yourname" />
                  <Field label="GitHub URL" value={form.github_url} onChange={(v) => setField('github_url', v)} placeholder="github.com/yourname" />
                  <Field label="Portfolio URL" value={form.portfolio_url} onChange={(v) => setField('portfolio_url', v)} placeholder="yoursite.com" />
                </div>
              </StepPanel>
            )}

            {step === 2 && (
              <StepPanel key="experience" title="Experience & Skills" subtitle="Tell us what you know" icon={Briefcase}>
                <Field
                  label="Years of Experience"
                  type="number"
                  value={form.years_experience}
                  onChange={(v) => setField('years_experience', v)}
                  placeholder="3"
                />
                <div className="mt-4">
                  <SkillsMultiSelect
                    value={form.skills}
                    onChange={(skills) => setForm((f) => ({ ...f, skills }))}
                    placeholder="Search and select skills..."
                    maxSkills={30}
                    required={true}
                  />
                </div>
              </StepPanel>
            )}

            {step === 3 && (
              <StepPanel key="preferences" title="Job Preferences" subtitle="What are you looking for?" icon={MapPin}>
                <div className="space-y-4">
                  <SearchableMultiSelect
                    value={form.preferred_roles}
                    onChange={(roles) => setForm((f) => ({ ...f, preferred_roles: roles }))}
                    placeholder="Search and select roles..."
                    label="Preferred Roles"
                    popularItems={POPULAR_ROLES}
                    allItems={ALL_ROLES}
                    isItemInList={isRoleInMasterList}
                    allowCustom={true}
                    maxItems={10}
                    color="cyan"
                  />
                  <SearchableMultiSelect
                    value={form.preferred_locations}
                    onChange={(locations) => setForm((f) => ({ ...f, preferred_locations: locations }))}
                    placeholder="Search and select locations..."
                    label="Preferred Locations"
                    popularItems={POPULAR_LOCATIONS}
                    allItems={ALL_LOCATIONS}
                    isItemInList={isLocationInMasterList}
                    allowCustom={true}
                    maxItems={10}
                    color="violet"
                  />
                </div>
              </StepPanel>
            )}
          </>

          <div className="flex justify-between mt-8 pt-6 border-t border-border">
            {step > 0 ? (
              <button
                onClick={() => setStep(step - 1)}
                className="px-5 py-2.5 rounded-xl glass border border-border text-sm text-foreground/80 hover:text-foreground transition-colors"
              >
                Back
              </button>
            ) : <div />}

            {step < STEPS.length - 1 ? (
              <motion.button
                whileTap={{ scale: 0.98 }}
                onClick={() => { if (step === 0 && !uploadedResume) { toast.error('Please upload your resume first'); return }; setStep(step + 1) }}
                disabled={uploadingResume}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-accent hover:bg-accent/90 text-accent-foreground text-sm font-medium transition-colors disabled:opacity-60"
              >
                Continue <ArrowRight className="w-4 h-4" />
              </motion.button>
            ) : (
              <motion.button
                whileTap={{ scale: 0.98 }}
                disabled={loading}
                onClick={handleFinish}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-accent hover:bg-accent/90 text-accent-foreground text-sm font-medium transition-colors disabled:opacity-60"
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

        <p className="text-center text-xs text-muted-foreground/60 mt-4">You can update all this later in Settings</p>
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
      transition={{ duration: 0.2 }}
    >
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-accent/20 border border-accent/30 flex items-center justify-center">
          <Icon className="w-5 h-5 text-accent" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-foreground">{title}</h2>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
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
      <label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full glass rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground border border-border focus:border-accent/50 focus:outline-none transition-colors"
      />
    </div>
  )
}
