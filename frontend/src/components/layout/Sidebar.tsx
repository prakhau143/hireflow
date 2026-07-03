import { motion, AnimatePresence } from 'framer-motion'
import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, Briefcase, Archive, Mail, FileText,
  BarChart3, FileCode2, Activity, Settings, Users,
  Import, Cpu, Database, ChevronLeft, Zap
} from 'lucide-react'
import { useAppStore } from '@/store/useAppStore'
import { cn } from '@/lib/utils'

const userNav = [
  { icon: LayoutDashboard, label: 'Dashboard', to: '/' },
  { icon: Import, label: 'Import Jobs', to: '/import' },
  { icon: Briefcase, label: 'Jobs', to: '/jobs' },
  { icon: Archive, label: 'Archives', to: '/archives' },
  { icon: Mail, label: 'SMTP', to: '/smtp' },
  { icon: FileText, label: 'Resume Manager', to: '/resume' },
  { icon: BarChart3, label: 'Analytics', to: '/analytics' },
  { icon: FileCode2, label: 'Templates', to: '/templates' },
  { icon: Activity, label: 'Activity Logs', to: '/logs' },
  { icon: Settings, label: 'Settings', to: '/settings' },
]

const adminNav = [
  { icon: LayoutDashboard, label: 'Dashboard', to: '/admin' },
  { icon: Users, label: 'Users', to: '/admin/users' },
  { icon: Import, label: 'Imported Jobs', to: '/admin/jobs' },
  { icon: Cpu, label: 'AI Processing', to: '/admin/ai' },
  { icon: FileCode2, label: 'Templates', to: '/admin/templates' },
  { icon: Mail, label: 'SMTP Management', to: '/admin/smtp' },
  { icon: BarChart3, label: 'Analytics', to: '/admin/analytics' },
  { icon: Database, label: 'System Logs', to: '/admin/logs' },
  { icon: Settings, label: 'Settings', to: '/admin/settings' },
]

export default function Sidebar() {
  const { user, sidebarCollapsed, toggleSidebar } = useAppStore()
  const nav = user?.role === 'admin' ? adminNav : userNav

  return (
    <motion.aside
      animate={{ width: sidebarCollapsed ? 64 : 220 }}
      transition={{ duration: 0.2, ease: 'easeInOut' }}
      className={cn(
        'fixed left-0 top-16 bottom-0 z-40',
        'glass border-r border-white/10 overflow-hidden'
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
                  'hover:bg-white/10 group relative',
                  isActive
                    ? 'bg-blue-500/20 text-blue-400 border border-blue-500/20'
                    : 'text-white/60 hover:text-white'
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon className={cn('w-4 h-4 shrink-0', isActive && 'text-blue-400')} />
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
                    <div className="absolute left-full ml-2 px-2 py-1 glass rounded-lg text-xs text-white whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
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
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-white/40 hover:text-white/70 hover:bg-white/10 transition-all w-full"
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
          <div className="px-4 py-3 border-t border-white/5">
            <div className="flex items-center gap-2">
              <Zap className="w-3 h-3 text-blue-400/50" />
              <span className="text-xs text-white/20">HireFlow v1.0</span>
            </div>
          </div>
        )}
      </div>
    </motion.aside>
  )
}
