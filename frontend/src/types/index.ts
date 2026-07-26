export interface User {
  id: string
  name: string
  email: string
  avatar?: string
  role: 'admin' | 'user'
  theme: 'dark' | 'light'
  created_at: string
  onboarding_complete: boolean
  is_active?: boolean
  permissions?: string[] | null
  last_login?: string | null
  skills?: string[]
  years_experience?: number
  current_role?: string
  current_location?: string
  phone?: string
  linkedin_url?: string
  github_url?: string
  portfolio_url?: string
  preferred_roles?: string[]
  preferred_locations?: string[]
  headline?: string | null
  current_company?: string | null
  expected_salary?: string | null
  notice_period?: string | null
  employment_type_pref?: string | null
  remote_preference?: string | null
  timezone?: string | null
  leetcode_url?: string | null
  hackerrank_url?: string | null
  medium_url?: string | null
  skill_proficiency?: Record<string, { level: number; years?: number }> | null
  experience_timeline?: ExperienceEntry[] | null
  projects?: ProjectEntry[] | null
  certifications?: CertificationEntry[] | null
  dream_companies?: string[] | null
  preferred_domains?: string[] | null
  target_salary?: string | null
}

export interface ExperienceEntry {
  title: string
  company: string
  start: string
  end: string
  current?: boolean
  description?: string
}

export interface ProjectEntry {
  name: string
  description?: string
  tech?: string[]
  github?: string
  demo?: string
}

export interface CertificationEntry {
  name: string
  issuer?: string
  year?: number | string
}

export interface Job {
  id: string
  title: string
  company: string
  location: string
  location_type: 'remote' | 'hybrid' | 'onsite'
  experience_min: number
  experience_max: number
  skills: string[]
  description: string
  contact_email?: string
  contact_linkedin?: string
  contact_phone?: string
  posted_date: string
  source: string
  source_url?: string
  apply_link?: string
  match_score?: number
  matched_skills?: string[]
  missing_skills?: string[]
  ai_summary?: string
  ai_analysis?: string
  smart_tags: string[]
  is_duplicate: boolean
  freshness_score: number
  salary?: string
  employment_type?: string
  confidence_score?: number
  hiring_manager?: string
  application_type?: 'email' | 'google_form' | 'linkedin' | 'portal' | 'phone' | 'none'
  is_recommended?: boolean
  experience_badge?: string
  match_tier?: string
  match_breakdown?: { key: string; label: string; score: number; max: number; available: boolean; pct: number }[]
  score_suggestions?: { skill: string; projected: number; gain: number }[]
  status: 'new' | 'applied' | 'archived' | 'shortlisted'
  archive_reason?: 'low_match' | 'missing_experience' | 'missing_skills' | 'expired'
  created_at: string
}

export interface SkillIntelligence {
  skill: string
  category: 'Programming' | 'Framework' | 'Cloud' | 'AI/ML' | 'Tool' | 'Soft Skill'
  years: number | null
  confidence: number | null
  last_used: string | number | null
}

export interface EducationEntry {
  college: string
  degree: string
  cgpa: string | number | null
  year: string | number | null
}

export interface ResumeExperienceEntry {
  company: string
  role: string
  start: string
  end: string
  current: boolean
  duration: string | null
  responsibilities: string[]
}

export interface ResumeProject {
  name: string
  description?: string
  tech?: string[]
  github?: string | null
  live?: string | null
}

export interface ResumeCertificate {
  name: string
  issuer?: string | null
}

export interface Resume {
  id: string
  name: string
  file_url: string
  ats_score: number
  missing_keywords: string[]
  strong_skills: string[]
  weak_sections: string[]
  created_at: string
  updated_at: string
  contact_info?: { name?: string; phone?: string; email?: string; location?: string } | null
  education?: EducationEntry[] | null
  experience_entries?: ResumeExperienceEntry[] | null
  projects_extracted?: ResumeProject[] | null
  certificates_extracted?: ResumeCertificate[] | null
  skill_intelligence?: SkillIntelligence[] | null
  github_detected?: string | null
  portfolio_detected?: string | null
  total_experience_computed?: string | null
  section_scores?: Record<string, number> | null
}

export interface SmtpConfig {
  id: string
  host: string
  port: number
  username: string
  password: string
  from_name: string
  from_email: string
  is_active: boolean
  last_tested?: string
  test_status?: 'success' | 'failed'
  created_at: string
}

export interface EmailTemplate {
  id: string
  name: string
  category: string
  subject: string
  body: string
  created_at: string
  updated_at: string
}

export interface ActivityLog {
  id: string
  action: string
  description: string
  metadata?: Record<string, unknown>
  created_at: string
}

export interface DashboardStats {
  jobs_imported: number
  matched_jobs: number
  archived: number
  applications_prepared: number
  match_distribution: { range: string; count: number }[]
  skills_demand: { skill: string; count: number }[]
  experience_distribution: { range: string; count: number }[]
}

export interface AnalyticsData {
  match_trend: { date: string; score: number }[]
  top_skills: { skill: string; count: number }[]
  job_roles: { role: string; count: number }[]
  companies: { company: string; count: number }[]
  locations: { location: string; count: number }[]
}

export type Theme = 'dark' | 'light'

export interface FilterState {
  experience?: string
  location_type?: string
  skills?: string[]
  match_score?: number
  search?: string
  search_by?: 'role' | 'skill' | 'company' | 'experience'
}
