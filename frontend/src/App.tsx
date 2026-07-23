import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { useEffect } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import AppLayout from '@/components/layout/AppLayout'
import Dashboard from '@/pages/Dashboard'
import Jobs from '@/pages/Jobs'
import JobDetail from '@/pages/JobDetail'
import ResumeManager from '@/pages/ResumeManager'
import Profile from '@/pages/Profile'
import Archives from '@/pages/Archives'
import SmtpManager from '@/pages/SmtpManager'
import Templates from '@/pages/Templates'
import ActivityLogs from '@/pages/ActivityLogs'
import Analytics from '@/pages/Analytics'
import Settings from '@/pages/Settings'
import ImportJobs from '@/pages/ImportJobs'
import Onboarding from '@/pages/Onboarding'
import Login, { Register, ForgotPassword } from '@/pages/auth/Login'
import AdminUsers from '@/pages/admin/AdminUsers'
import ReviewPanel from '@/pages/admin/ReviewPanel'
import AdminAnalyticsPage from '@/pages/admin/AdminAnalytics'
import { useAppStore } from '@/store/useAppStore'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
  },
})

function AuthGuard() {
  const { token } = useAppStore()
  if (!token) return <Navigate to="/login" replace />
  return <Outlet />
}

function OnboardingGuard() {
  const { user } = useAppStore()
  if (user && !user.onboarding_complete) return <Navigate to="/onboarding" replace />
  return <Outlet />
}

export default function App() {
  const { theme } = useAppStore()

  useEffect(() => {
    document.documentElement.className = theme === 'light' ? 'light' : ''
  }, [theme])

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: {
              background: 'rgba(15,20,40,0.95)',
              backdropFilter: 'blur(20px)',
              color: '#fff',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '12px',
              fontSize: '13px',
            },
          }}
        />
        <Routes>
          {/* Public routes */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />

          {/* Auth-required routes */}
          <Route element={<AuthGuard />}>
            {/* Onboarding (no main layout) */}
            <Route path="/onboarding" element={<Onboarding />} />

            {/* App routes (need completed onboarding) */}
            <Route element={<OnboardingGuard />}>
              <Route element={<AppLayout />}>
                {/* User routes */}
                <Route path="/" element={<Dashboard />} />
                <Route path="/profile" element={<Profile />} />
                <Route path="/import" element={<ImportJobs />} />
                <Route path="/jobs" element={<Jobs />} />
                <Route path="/jobs/:id" element={<JobDetail />} />
                <Route path="/resume" element={<ResumeManager />} />
                <Route path="/archives" element={<Archives />} />
                <Route path="/smtp" element={<SmtpManager />} />
                <Route path="/templates" element={<Templates />} />
                <Route path="/logs" element={<ActivityLogs />} />
                <Route path="/analytics" element={<Analytics />} />
                <Route path="/settings" element={<Settings />} />

                {/* Admin routes */}
                <Route path="/admin" element={<Dashboard />} />
                <Route path="/admin/users" element={<AdminUsers />} />
                <Route path="/admin/review" element={<ReviewPanel />} />
                <Route path="/admin/jobs" element={<Jobs />} />
                <Route path="/admin/ai" element={<ImportJobs />} />
                <Route path="/admin/templates" element={<Templates />} />
                <Route path="/admin/smtp" element={<SmtpManager />} />
                <Route path="/admin/analytics" element={<AdminAnalyticsPage />} />
                <Route path="/admin/logs" element={<ActivityLogs />} />
                <Route path="/admin/settings" element={<Settings />} />
              </Route>
            </Route>
          </Route>

          {/* Catch-all */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
