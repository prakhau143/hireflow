import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { User, Briefcase, MapPin, Upload, X, ArrowRight, CheckCircle2 } from 'lucide-react'
import { useAppStore } from '@/store/useAppStore'
import api from '@/lib/api'
import Logo from '@/components/ui/Logo'
import SkillsMultiSelect from '@/components/ui/SkillsMultiSelect'
import SearchableMultiSelect from '@/components/ui/SearchableMultiSelect'
import { POPULAR_ROLES, ALL_ROLES, isRoleInMasterList } from '@/data/roles'
import { POPULAR_LOCATIONS, ALL_LOCATIONS, isLocationInMasterList } from '@/data/locations'
import toast from 'react-hot-toast'

const STEPS = ['Profile', 'Experience', 'Preferences', 'Resume']

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
    current_location: '',
    years_experience: '',
    skills: [] as string[],
    preferred_roles: [] as string[],
    preferred_locations: [] as string[],
  })
  const [resumeFile, setResumeFile] = useState<File | null>(null)
  const [uploadingResume, setUploadingResume] = useState(false)

  function setField(key: string, value: string) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function handleFinish() {
    // Validate all mandatory fields
    if (!form.phone.trim()) {
      toast.error('Please enter your phone number')
      setStep(0)
      return
    }
    if (!form.current_role.trim()) {
      toast.error('Please enter your current role')
      setStep(0)
      return
    }
    if (!form.current_location.trim()) {
      toast.error('Please enter your current location')
      setStep(0)
      return
    }
    if (!form.linkedin_url.trim()) {
      toast.error('Please enter your LinkedIn URL')
      setStep(0)
      return
    }
    if (!form.github_url.trim()) {
      toast.error('Please enter your GitHub URL')
      setStep(0)
      return
    }
    if (!form.portfolio_url.trim()) {
      toast.error('Please enter your portfolio URL')
      setStep(0)
      return
    }
    if (!form.years_experience.trim()) {
      toast.error('Please enter your years of experience')
      setStep(1)
      return
    }
    if (form.skills.length === 0) {
      toast.error('Please select at least one skill')
      setStep(1)
      return
    }
    if (form.preferred_roles.length === 0) {
      toast.error('Please select at least one preferred role')
      setStep(2)
      return
    }
    if (form.preferred_locations.length === 0) {
      toast.error('Please select at least one preferred location')
      setStep(2)
      return
    }
    if (!resumeFile) {
      toast.error('Please upload your resume')
      setStep(3)
      return
    }

    setLoading(true)
    try {
      // Step 1: Upload resume
      setUploadingResume(true)
      const fd = new FormData()
      fd.append('file', resumeFile)
      const resumeResponse = await api.post('/api/resumes/upload', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      const uploadedResume = resumeResponse.data
      setUploadingResume(false)

      // If resume has strong_skills, auto-select them
      if (uploadedResume?.strong_skills && uploadedResume.strong_skills.length > 0) {
        const detectedSkills = uploadedResume.strong_skills
        const newSkills = [...new Set([...form.skills, ...detectedSkills])]

        // Limit to 30 skills
        const finalSkills = newSkills.slice(0, 30)

        if (finalSkills.length > form.skills.length) {
          setForm((f) => ({ ...f, skills: finalSkills }))
          setStep(1)
          toast.success(`We detected ${detectedSkills.length} skills from your resume! Please review them.`)
          setLoading(false)
          return
        }
      }

      // Step 2: Complete onboarding with all data
      const payload = {
        phone: form.phone,
        current_role: form.current_role,
        current_location: form.current_location,
        linkedin_url: form.linkedin_url,
        github_url: form.github_url,
        portfolio_url: form.portfolio_url,
        years_experience: parseInt(form.years_experience),
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

            {step === 2 && (
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

            {step === 3 && (
              <StepPanel key="resume" title="Upload Resume" subtitle="PDF format, max 10MB — required" icon={Upload}>
                <label className="relative block cursor-pointer">
                  <input
                    type="file"
                    accept=".pdf"
                    className="hidden"
                    onChange={(e) => setResumeFile(e.target.files?.[0] ?? null)}
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
                          onClick={(e) => { e.preventDefault(); setResumeFile(null) }}
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
                        <p className="text-muted-foreground text-xs mt-1">AI will analyze it for ATS score and skill gaps</p>
                      </div>
                    )}
                  </div>
                </label>
              </StepPanel>
            )}
          </AnimatePresence>

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
                onClick={() => setStep(step + 1)}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-accent hover:bg-accent/90 text-accent-foreground text-sm font-medium transition-colors"
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
      exit={{ opacity: 0, x: -20 }}
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
