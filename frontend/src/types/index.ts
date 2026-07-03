export interface User {
  id: string
  name: string
  email: string
  avatar?: string
  role: 'admin' | 'user'
  theme: 'dark' | 'light'
  created_at: string
  onboarding_complete: boolean
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
  match_score?: number
  matched_skills?: string[]
  missing_skills?: string[]
  ai_summary?: string
  ai_analysis?: string
  smart_tags: string[]
  is_duplicate: boolean
  freshness_score: number
  status: 'new' | 'applied' | 'archived' | 'shortlisted'
  archive_reason?: 'low_match' | 'missing_experience' | 'missing_skills' | 'expired'
  created_at: string
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
