import { motion, AnimatePresence } from 'framer-motion'
import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, Briefcase, Archive, Mail, FileText,
  BarChart3, FileCode2, Activity, Settings, Users,
  Import, Cpu, Database, ChevronLeft, Zap, ShieldCheck, MailPlus, Plus
} from 'lucide-react'
import { useAppStore } from '@/store/useAppStore'
import { cn } from '@/lib/utils'

// key = permission identifier stored per-user in the DB (users.permissions)
// Import Jobs / Review Queue are admin-only (backend require_admin gate) — never
// grantable to a regular user, so they're intentionally absent from this list.
export const NAV_PERMISSIONS = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'jobs', label: 'Jobs' },
  { key: 'archives', label: 'Archives' },
  { key: 'smtp', label: 'SMTP' },
  { key: 'resume', label: 'Resume Manager' },
  { key: 'analytics', label: 'Analytics' },
  { key: 'templates', label: 'Templates' },
  { key: 'logs', label: 'Activity Logs' },
  { key: 'settings', label: 'Settings' },
]

const userNav = [
  { key: 'dashboard', icon: LayoutDashboard, label: 'Dashboard', to: '/' },
  { key: 'jobs', icon: Briefcase, label: 'Jobs', to: '/jobs' },
  { key: 'archives', icon: Archive, label: 'Archives', to: '/archives' },
  { key: 'smtp', icon: Mail, label: 'SMTP', to: '/smtp' },
  { key: 'resume', icon: FileText, label: 'Resume Manager', to: '/resume' },
  { key: 'analytics', icon: BarChart3, label: 'Analytics', to: '/analytics' },
  { key: 'templates', icon: FileCode2, label: 'Templates', to: '/templates' },
  { key: 'logs', icon: Activity, label: 'Activity Logs', to: '/logs' },
  { key: 'settings', icon: Settings, label: 'Settings', to: '/settings' },
]

const adminNav = [
  { icon: LayoutDashboard, label: 'Dashboard', to: '/admin' },
  { icon: Users, label: 'Users', to: '/admin/users' },
  { icon: Cpu, label: 'Import Jobs', to: '/admin/ai' },
  { icon: ShieldCheck, label: 'Review Queue', to: '/admin/review' },
  { icon: Plus, label: 'Custom Jobs', to: '/admin/custom-jobs' },
  { icon: Import, label: 'All Jobs', to: '/admin/jobs' },
  { icon: FileCode2, label: 'Templates', to: '/admin/templates' },
  { icon: MailPlus, label: 'Email Templates', to: '/admin/email-templates' },
  { icon: Mail, label: 'SMTP Management', to: '/admin/smtp' },
  { icon: BarChart3, label: 'Analytics', to: '/admin/analytics' },
  { icon: Database, label: 'System Logs', to: '/admin/logs' },
  { icon: Settings, label: 'Settings', to: '/admin/settings' },
]

export default function Sidebar() {
  const { user, sidebarCollapsed, toggleSidebar } = useAppStore()
  // DB-driven access: non-admins with a permissions list only see those nav keys
  const nav = user?.role === 'admin'
    ? adminNav
    : userNav.filter(item =>
        !Array.isArray((user as any)?.permissions) || (user as any).permissions.includes(item.key)
      )

  return (
    <motion.aside
      animate={{ width: sidebarCollapsed ? 64 : 220 }}
      transition={{ duration: 0.2, ease: 'easeInOut' }}
      className={cn(
        'fixed left-0 top-16 bottom-0 z-40',
        'glass border-r border-border overflow-hidden'
      )}
    >
      <div className="flex flex-col h-full py-4">
        <nav className="flex-1 px-2 space-y-1">
          {nav.map(({ icon: Icon, label, to }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/' || to === '/admin'}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all duration-150',
                  'hover:bg-foreground/5 group relative',
                  isActive
                    ? 'bg-accent/15 text-accent border border-accent/20'
                    : 'text-muted-foreground hover:text-foreground'
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon className={cn('w-4 h-4 shrink-0', isActive && 'text-accent')} />
                  <AnimatePresence>
                    {!sidebarCollapsed && (
                      <motion.span
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -10 }}
                        transition={{ duration: 0.15 }}
                        className="whitespace-nowrap"
                      >
                        {label}
                      </motion.span>
                    )}
                  </AnimatePresence>

                  {/* Tooltip when collapsed */}
                  {sidebarCollapsed && (
                    <div className="absolute left-full ml-2 px-2 py-1 glass rounded-lg text-xs text-foreground whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                      {label}
                    </div>
                  )}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Collapse Toggle */}
        <div className="px-2 pb-2">
          <button
            onClick={toggleSidebar}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-muted-foreground hover:text-foreground hover:bg-foreground/5 transition-all w-full"
          >
            <motion.div animate={{ rotate: sidebarCollapsed ? 180 : 0 }} transition={{ duration: 0.2 }}>
              <ChevronLeft className="w-4 h-4" />
            </motion.div>
            <AnimatePresence>
              {!sidebarCollapsed && (
                <motion.span
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="text-xs"
                >
                  Collapse
                </motion.span>
              )}
            </AnimatePresence>
          </button>
        </div>

        {/* Brand watermark */}
        {!sidebarCollapsed && (
          <div className="px-4 py-3 border-t border-border">
            <div className="flex items-center gap-2">
              <Zap className="w-3 h-3 text-accent/50" />
              <span className="text-xs text-muted-foreground/60">HireFlow v1.0</span>
            </div>
          </div>
        )}
      </div>
    </motion.aside>
  )
}
