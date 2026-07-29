import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Plus, Edit, Trash2, Eye, Search, Filter, Calendar, MapPin, Building2, DollarSign, Briefcase } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { cn } from '@/lib/utils'

// Types
interface CustomJob {
  id: string
  title: string
  company: string
  company_logo?: string
  company_website?: string
  company_type?: string
  industry?: string
  location: string
  location_type: string
  job_category?: string
  department?: string
  experience_min: number
  experience_max: number
  salary?: string
  skills: string[]
  description: string
  requirements?: string
  responsibilities?: string
  benefits?: string
  contact_email?: string
  contact_phone?: string
  apply_link?: string
  contact_linkedin?: string
  hiring_manager?: string
  recruiter_linkedin?: string
  employment_type?: string
  publication_status: 'draft' | 'published' | 'scheduled'
  scheduled_at?: string
  created_at: string
  updated_at: string
}

const API_BASE = import.meta.env.VITE_API_URL || 'https://hireflow-api.onrender.com'

export default function CustomJobs() {
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [selectedJob, setSelectedJob] = useState<CustomJob | null>(null)
  const [viewMode, setViewMode] = useState<'list' | 'create' | 'edit'>('list')
  const queryClient = useQueryClient()

  // Fetch custom jobs
  const { data: jobsData, isLoading } = useQuery({
    queryKey: ['custom-jobs', statusFilter],
    queryFn: async () => {
      const token = localStorage.getItem('token')
      const params = new URLSearchParams()
      if (statusFilter !== 'all') params.append('publication_status', statusFilter)
      
      const response = await fetch(
        `${API_BASE}/jobs/admin/custom-jobs?${params.toString()}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      )
      
      if (!response.ok) throw new Error('Failed to fetch custom jobs')
      return response.json()
    },
  })

  // Delete job mutation
  const deleteMutation = useMutation({
    mutationFn: async (jobId: string) => {
      const token = localStorage.getItem('token')
      const response = await fetch(`${API_BASE}/jobs/admin/custom-jobs/${jobId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })
      if (!response.ok) throw new Error('Failed to delete job')
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['custom-jobs'] })
      toast.success('Job deleted successfully')
    },
    onError: () => {
      toast.error('Failed to delete job')
    },
  })

  const jobs = jobsData?.jobs || []
  const filteredJobs = jobs.filter((job: CustomJob) =>
    job.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    job.company.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const handleDelete = (jobId: string) => {
    if (confirm('Are you sure you want to delete this job?')) {
      deleteMutation.mutate(jobId)
    }
  }

  const handleCreate = () => {
    setSelectedJob(null)
    setViewMode('create')
  }

  const handleEdit = (job: CustomJob) => {
    setSelectedJob(job)
    setViewMode('edit')
  }

  const handleView = (job: CustomJob) => {
    setSelectedJob(job)
    setViewMode('edit')
  }

  const handleBack = () => {
    setViewMode('list')
    setSelectedJob(null)
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Custom Jobs</h1>
          <p className="text-muted-foreground mt-1">Manually create and manage job postings</p>
        </div>
        <button
          onClick={handleCreate}
          className="flex items-center gap-2 px-4 py-2 bg-accent text-accent-foreground rounded-lg hover:bg-accent/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Custom Job
        </button>
      </div>

      {viewMode === 'list' ? (
        <>
          {/* Filters */}
          <div className="flex items-center gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search jobs..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 glass rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-accent/20"
              />
            </div>
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-muted-foreground" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-2 glass rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-accent/20"
              >
                <option value="all">All Status</option>
                <option value="published">Published</option>
                <option value="draft">Draft</option>
                <option value="scheduled">Scheduled</option>
              </select>
            </div>
          </div>

          {/* Jobs Grid */}
          {isLoading ? (
            <div className="text-center py-12 text-muted-foreground">Loading jobs...</div>
          ) : filteredJobs.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              {searchQuery || statusFilter !== 'all' ? 'No jobs found matching your filters' : 'No custom jobs yet. Create your first job!'}
            </div>
          ) : (
            <div className="grid gap-4">
              {filteredJobs.map((job: CustomJob) => (
                <motion.div
                  key={job.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="glass rounded-xl p-5 border border-border hover:border-accent/30 transition-all"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="font-semibold text-foreground">{job.title}</h3>
                        <span className={cn(
                          'px-2 py-0.5 text-xs rounded-full',
                          job.publication_status === 'published' ? 'bg-green-500/10 text-green-500' :
                          job.publication_status === 'draft' ? 'bg-yellow-500/10 text-yellow-500' :
                          'bg-blue-500/10 text-blue-500'
                        )}>
                          {job.publication_status}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground mb-3">
                        <span className="flex items-center gap-1">
                          <Building2 className="w-4 h-4" />
                          {job.company}
                        </span>
                        <span className="flex items-center gap-1">
                          <MapPin className="w-4 h-4" />
                          {job.location}
                        </span>
                        <span className="flex items-center gap-1">
                          <Briefcase className="w-4 h-4" />
                          {job.experience_min}-{job.experience_max} yrs
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-2 mb-3">
                        {job.skills.slice(0, 5).map((skill) => (
                          <span key={skill} className="px-2 py-1 text-xs bg-foreground/5 rounded-md">
                            {skill}
                          </span>
                        ))}
                        {job.skills.length > 5 && (
                          <span className="px-2 py-1 text-xs bg-foreground/5 rounded-md">
                            +{job.skills.length - 5} more
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Created: {new Date(job.created_at).toLocaleDateString()}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      <button
                        onClick={() => handleView(job)}
                        className="p-2 hover:bg-foreground/5 rounded-lg transition-colors"
                        title="View/Edit"
                      >
                        <Eye className="w-4 h-4 text-muted-foreground" />
                      </button>
                      <button
                        onClick={() => handleEdit(job)}
                        className="p-2 hover:bg-foreground/5 rounded-lg transition-colors"
                        title="Edit"
                      >
                        <Edit className="w-4 h-4 text-muted-foreground" />
                      </button>
                      <button
                        onClick={() => handleDelete(job.id)}
                        className="p-2 hover:bg-red-500/10 rounded-lg transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </>
      ) : (
        <CustomJobForm
          mode={viewMode}
          job={selectedJob}
          onCancel={handleBack}
          onSuccess={() => {
            handleBack()
            queryClient.invalidateQueries({ queryKey: ['custom-jobs'] })
          }}
        />
      )}
    </div>
  )
}

// Custom Job Form Component
function CustomJobForm({ mode, job, onCancel, onSuccess }: { mode: 'create' | 'edit', job: CustomJob | null, onCancel: () => void, onSuccess: () => void }) {
  const [step, setStep] = useState(1)
  const [formData, setFormData] = useState({
    title: job?.title || '',
    company: job?.company || '',
    company_logo: job?.company_logo || '',
    company_website: job?.company_website || '',
    company_type: job?.company_type || '',
    industry: job?.industry || '',
    employment_type: job?.employment_type || '',
    job_category: job?.job_category || '',
    department: job?.department || '',
    location: job?.location || '',
    location_type: job?.location_type || 'onsite',
    experience_min: job?.experience_min || 0,
    experience_max: job?.experience_max || 5,
    salary: job?.salary || '',
    skills: job?.skills || [],
    description: job?.description || '',
    requirements: job?.requirements || '',
    responsibilities: job?.responsibilities || '',
    benefits: job?.benefits || '',
    contact_email: job?.contact_email || '',
    contact_phone: job?.contact_phone || '',
    apply_link: job?.apply_link || '',
    contact_linkedin: job?.contact_linkedin || '',
    hiring_manager: job?.hiring_manager || '',
    recruiter_linkedin: job?.recruiter_linkedin || '',
    publication_status: job?.publication_status || 'published',
    scheduled_at: job?.scheduled_at || '',
  })

  const [skillInput, setSkillInput] = useState('')
  const queryClient = useQueryClient()

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const token = localStorage.getItem('token')
      const response = await fetch(`${API_BASE}/jobs/admin/custom-jobs`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      })
      if (!response.ok) throw new Error('Failed to create job')
      return response.json()
    },
    onSuccess: () => {
      toast.success('Job created successfully')
      onSuccess()
    },
    onError: () => {
      toast.error('Failed to create job')
    },
  })

  const updateMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const token = localStorage.getItem('token')
      const response = await fetch(`${API_BASE}/jobs/admin/custom-jobs/${job?.id}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      })
      if (!response.ok) throw new Error('Failed to update job')
      return response.json()
    },
    onSuccess: () => {
      toast.success('Job updated successfully')
      onSuccess()
    },
    onError: () => {
      toast.error('Failed to update job')
    },
  })

  const handleAddSkill = () => {
    if (skillInput.trim() && !formData.skills.includes(skillInput.trim())) {
      setFormData({ ...formData, skills: [...formData.skills, skillInput.trim()] })
      setSkillInput('')
    }
  }

  const handleRemoveSkill = (skill: string) => {
    setFormData({ ...formData, skills: formData.skills.filter(s => s !== skill) })
  }

  const handleSubmit = () => {
    if (mode === 'create') {
      createMutation.mutate(formData)
    } else {
      updateMutation.mutate(formData)
    }
  }

  const steps = [
    { title: 'Basic Info', icon: Building2 },
    { title: 'Location', icon: MapPin },
    { title: 'Experience', icon: Briefcase },
    { title: 'Salary', icon: DollarSign },
    { title: 'Skills', icon: Briefcase },
    { title: 'Requirements', icon: Briefcase },
    { title: 'Responsibilities', icon: Briefcase },
    { title: 'Benefits', icon: Briefcase },
    { title: 'Contact', icon: Briefcase },
    { title: 'Publish', icon: Calendar },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button onClick={onCancel} className="text-muted-foreground hover:text-foreground transition-colors">
          ← Back to Jobs
        </button>
        <h2 className="text-xl font-semibold">{mode === 'create' ? 'Create Custom Job' : 'Edit Job'}</h2>
        <div className="w-24" />
      </div>

      {/* Progress Steps */}
      <div className="flex items-center justify-between">
        {steps.map((s, i) => (
          <div key={i} className="flex items-center flex-1">
            <div className={cn(
              'w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium',
              step === i + 1 ? 'bg-accent text-accent-foreground' :
              step > i + 1 ? 'bg-green-500 text-white' : 'bg-foreground/10 text-muted-foreground'
            )}>
              {step > i + 1 ? '✓' : i + 1}
            </div>
            {i < steps.length - 1 && (
              <div className={cn(
                'flex-1 h-0.5 mx-2',
                step > i + 1 ? 'bg-green-500' : 'bg-foreground/10'
              )} />
            )}
          </div>
        ))}
      </div>

      {/* Step Content */}
      <div className="glass rounded-xl p-6 border border-border">
        {step === 1 && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold mb-4">Basic Information</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Job Title *</label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full px-3 py-2 glass rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-accent/20"
                  placeholder="e.g., Senior Software Engineer"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Company *</label>
                <input
                  type="text"
                  value={formData.company}
                  onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                  className="w-full px-3 py-2 glass rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-accent/20"
                  placeholder="e.g., Google"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Company Logo URL</label>
                <input
                  type="text"
                  value={formData.company_logo}
                  onChange={(e) => setFormData({ ...formData, company_logo: e.target.value })}
                  className="w-full px-3 py-2 glass rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-accent/20"
                  placeholder="https://..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Company Website</label>
                <input
                  type="text"
                  value={formData.company_website}
                  onChange={(e) => setFormData({ ...formData, company_website: e.target.value })}
                  className="w-full px-3 py-2 glass rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-accent/20"
                  placeholder="https://..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Company Type</label>
                <select
                  value={formData.company_type}
                  onChange={(e) => setFormData({ ...formData, company_type: e.target.value })}
                  className="w-full px-3 py-2 glass rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-accent/20"
                >
                  <option value="">Select type</option>
                  <option value="Startup">Startup</option>
                  <option value="MNC">MNC</option>
                  <option value="SME">SME</option>
                  <option value="Product">Product</option>
                  <option value="Service">Service</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Industry</label>
                <input
                  type="text"
                  value={formData.industry}
                  onChange={(e) => setFormData({ ...formData, industry: e.target.value })}
                  className="w-full px-3 py-2 glass rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-accent/20"
                  placeholder="e.g., Technology"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Employment Type</label>
                <select
                  value={formData.employment_type}
                  onChange={(e) => setFormData({ ...formData, employment_type: e.target.value })}
                  className="w-full px-3 py-2 glass rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-accent/20"
                >
                  <option value="">Select type</option>
                  <option value="Full Time">Full Time</option>
                  <option value="Part Time">Part Time</option>
                  <option value="Contract">Contract</option>
                  <option value="Internship">Internship</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Job Category</label>
                <input
                  type="text"
                  value={formData.job_category}
                  onChange={(e) => setFormData({ ...formData, job_category: e.target.value })}
                  className="w-full px-3 py-2 glass rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-accent/20"
                  placeholder="e.g., Engineering"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Department</label>
                <input
                  type="text"
                  value={formData.department}
                  onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                  className="w-full px-3 py-2 glass rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-accent/20"
                  placeholder="e.g., Engineering"
                />
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold mb-4">Location</h3>
            <div>
              <label className="block text-sm font-medium mb-2">Location</label>
              <input
                type="text"
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                className="w-full px-3 py-2 glass rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-accent/20"
                placeholder="e.g., Bangalore, India"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Location Type</label>
              <select
                value={formData.location_type}
                onChange={(e) => setFormData({ ...formData, location_type: e.target.value })}
                className="w-full px-3 py-2 glass rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-accent/20"
              >
                <option value="onsite">Onsite</option>
                <option value="remote">Remote</option>
                <option value="hybrid">Hybrid</option>
                <option value="wfa">Work From Anywhere</option>
              </select>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold mb-4">Experience</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Minimum Experience (years)</label>
                <input
                  type="number"
                  min="0"
                  max="20"
                  step="0.5"
                  value={formData.experience_min}
                  onChange={(e) => setFormData({ ...formData, experience_min: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-2 glass rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-accent/20"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Maximum Experience (years)</label>
                <input
                  type="number"
                  min="0"
                  max="20"
                  step="0.5"
                  value={formData.experience_max}
                  onChange={(e) => setFormData({ ...formData, experience_max: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-2 glass rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-accent/20"
                />
              </div>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold mb-4">Salary</h3>
            <div>
              <label className="block text-sm font-medium mb-2">Salary Range</label>
              <select
                value={formData.salary}
                onChange={(e) => setFormData({ ...formData, salary: e.target.value })}
                className="w-full px-3 py-2 glass rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-accent/20"
              >
                <option value="">Not disclosed</option>
                <option value="0-3 LPA">0-3 LPA</option>
                <option value="3-5 LPA">3-5 LPA</option>
                <option value="5-8 LPA">5-8 LPA</option>
                <option value="8-12 LPA">8-12 LPA</option>
                <option value="12-20 LPA">12-20 LPA</option>
                <option value="20+ LPA">20+ LPA</option>
              </select>
            </div>
          </div>
        )}

        {step === 5 && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold mb-4">Skills</h3>
            <div className="flex gap-2">
              <input
                type="text"
                value={skillInput}
                onChange={(e) => setSkillInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleAddSkill()}
                className="flex-1 px-3 py-2 glass rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-accent/20"
                placeholder="Type skill and press Enter"
              />
              <button
                onClick={handleAddSkill}
                className="px-4 py-2 bg-accent text-accent-foreground rounded-lg hover:bg-accent/90 transition-colors"
              >
                Add
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {formData.skills.map((skill) => (
                <span
                  key={skill}
                  className="px-3 py-1 bg-foreground/5 rounded-md flex items-center gap-2"
                >
                  {skill}
                  <button
                    onClick={() => handleRemoveSkill(skill)}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}

        {step === 6 && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold mb-4">Requirements</h3>
            <textarea
              value={formData.requirements}
              onChange={(e) => setFormData({ ...formData, requirements: e.target.value })}
              className="w-full px-3 py-2 glass rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-accent/20 min-h-[150px]"
              placeholder="List the requirements for this role..."
            />
          </div>
        )}

        {step === 7 && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold mb-4">Responsibilities</h3>
            <textarea
              value={formData.responsibilities}
              onChange={(e) => setFormData({ ...formData, responsibilities: e.target.value })}
              className="w-full px-3 py-2 glass rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-accent/20 min-h-[150px]"
              placeholder="List the key responsibilities..."
            />
          </div>
        )}

        {step === 8 && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold mb-4">Benefits</h3>
            <textarea
              value={formData.benefits}
              onChange={(e) => setFormData({ ...formData, benefits: e.target.value })}
              className="w-full px-3 py-2 glass rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-accent/20 min-h-[150px]"
              placeholder="List the benefits offered..."
            />
          </div>
        )}

        {step === 9 && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold mb-4">Contact Information</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Email</label>
                <input
                  type="email"
                  value={formData.contact_email}
                  onChange={(e) => setFormData({ ...formData, contact_email: e.target.value })}
                  className="w-full px-3 py-2 glass rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-accent/20"
                  placeholder="careers@company.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Phone</label>
                <input
                  type="text"
                  value={formData.contact_phone}
                  onChange={(e) => setFormData({ ...formData, contact_phone: e.target.value })}
                  className="w-full px-3 py-2 glass rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-accent/20"
                  placeholder="+91..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Apply Link</label>
                <input
                  type="text"
                  value={formData.apply_link}
                  onChange={(e) => setFormData({ ...formData, apply_link: e.target.value })}
                  className="w-full px-3 py-2 glass rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-accent/20"
                  placeholder="https://..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">LinkedIn</label>
                <input
                  type="text"
                  value={formData.contact_linkedin}
                  onChange={(e) => setFormData({ ...formData, contact_linkedin: e.target.value })}
                  className="w-full px-3 py-2 glass rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-accent/20"
                  placeholder="https://linkedin.com/..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Hiring Manager</label>
                <input
                  type="text"
                  value={formData.hiring_manager}
                  onChange={(e) => setFormData({ ...formData, hiring_manager: e.target.value })}
                  className="w-full px-3 py-2 glass rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-accent/20"
                  placeholder="John Doe"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Recruiter LinkedIn</label>
                <input
                  type="text"
                  value={formData.recruiter_linkedin}
                  onChange={(e) => setFormData({ ...formData, recruiter_linkedin: e.target.value })}
                  className="w-full px-3 py-2 glass rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-accent/20"
                  placeholder="https://linkedin.com/in/..."
                />
              </div>
            </div>
          </div>
        )}

        {step === 10 && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold mb-4">Publish</h3>
            <div>
              <label className="block text-sm font-medium mb-2">Publication Status</label>
              <select
                value={formData.publication_status}
                onChange={(e) => setFormData({ ...formData, publication_status: e.target.value as any })}
                className="w-full px-3 py-2 glass rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-accent/20"
              >
                <option value="published">Published</option>
                <option value="draft">Draft</option>
                <option value="scheduled">Scheduled</option>
              </select>
            </div>
            {formData.publication_status === 'scheduled' && (
              <div>
                <label className="block text-sm font-medium mb-2">Schedule Date & Time</label>
                <input
                  type="datetime-local"
                  value={formData.scheduled_at}
                  onChange={(e) => setFormData({ ...formData, scheduled_at: e.target.value })}
                  className="w-full px-3 py-2 glass rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-accent/20"
                />
              </div>
            )}
            
            {/* Preview Card */}
            <div className="mt-6 p-4 glass rounded-xl border border-border">
              <h4 className="font-semibold mb-2">Preview</h4>
              <div className="space-y-2 text-sm">
                <p><strong>Title:</strong> {formData.title}</p>
                <p><strong>Company:</strong> {formData.company}</p>
                <p><strong>Location:</strong> {formData.location}</p>
                <p><strong>Experience:</strong> {formData.experience_min}-{formData.experience_max} years</p>
                <p><strong>Skills:</strong> {formData.skills.join(', ')}</p>
                <p><strong>Status:</strong> {formData.publication_status}</p>
              </div>
            </div>
          </div>
        )}

        {/* Navigation Buttons */}
        <div className="flex justify-between mt-6 pt-4 border-t border-border">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-muted-foreground hover:text-foreground transition-colors"
          >
            Cancel
          </button>
          <div className="flex gap-2">
            {step > 1 && (
              <button
                onClick={() => setStep(step - 1)}
                className="px-4 py-2 glass rounded-lg hover:bg-foreground/5 transition-colors"
              >
                Previous
              </button>
            )}
            {step < 10 ? (
              <button
                onClick={() => setStep(step + 1)}
                className="px-4 py-2 bg-accent text-accent-foreground rounded-lg hover:bg-accent/90 transition-colors"
              >
                Next
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={createMutation.isPending || updateMutation.isPending}
                className="px-4 py-2 bg-accent text-accent-foreground rounded-lg hover:bg-accent/90 transition-colors disabled:opacity-50"
              >
                {createMutation.isPending || updateMutation.isPending ? 'Saving...' : mode === 'create' ? 'Create Job' : 'Update Job'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
