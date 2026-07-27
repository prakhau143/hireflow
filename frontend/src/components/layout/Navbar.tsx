import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, Sun, Moon, Bell, ChevronDown, User, FileText, Settings, LogOut, CheckCircle2 } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useAppStore } from '@/store/useAppStore'
import { cn } from '@/lib/utils'
import { Link, useNavigate } from 'react-router-dom'
import Logo from '@/components/ui/Logo'
import api from '@/lib/api'

const searchCategories = ['Role', 'Skill', 'Company', 'Experience']

interface MissingFields { complete_percent: number; missing_fields: string[] }

export default function Navbar() {
  const { theme, toggleTheme, user, logout } = useAppStore()
  const navigate = useNavigate()
  const [searchQuery, setSearchQuery] = useState('')
  const [searchBy, setSearchBy] = useState('Role')
  const [showDropdown, setShowDropdown] = useState(false)
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [showNotifications, setShowNotifications] = useState(false)

  const { data: missing } = useQuery<MissingFields>({
    queryKey: ['missing-fields'],
    queryFn: async () => (await api.get('/api/users/me/missing-fields')).data,
    staleTime: 5 * 60_000,
  })
  const hasMissing = (missing?.missing_fields.length ?? 0) > 0

  function handleLogout() {
    logout()
    navigate('/login')
  }

  return (
    <nav className={cn(
      'fixed top-0 left-0 right-0 z-50 h-16',
      'glass border-b border-border'
    )}>
      <div className="flex items-center h-full px-6 gap-4">
        {/* Logo */}
        <Link to="/" className="shrink-0">
          <Logo size={32} theme={theme === 'light' ? 'light' : 'dark'} />
        </Link>

        {/* Global Search */}
        <div className="flex-1 max-w-2xl mx-auto">
          <div className="relative flex items-center gap-2 glass rounded-xl px-3 py-2">
            <Search className="w-4 h-4 text-muted-foreground shrink-0" />

            {/* Search By Dropdown */}
            <div className="relative">
              <button
                onClick={() => setShowDropdown(!showDropdown)}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                {searchBy}
                <ChevronDown className="w-3 h-3" />
              </button>
              <AnimatePresence>
                {showDropdown && (
                  <motion.div
                    initial={{ opacity: 0, y: -8, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -8, scale: 0.95 }}
                    transition={{ duration: 0.15 }}
                    className="absolute top-7 left-0 glass rounded-xl overflow-hidden min-w-[120px] shadow-2xl"
                  >
                    {searchCategories.map((cat) => (
                      <button
                        key={cat}
                        onClick={() => { setSearchBy(cat); setShowDropdown(false) }}
                        className={cn(
                          'w-full text-left px-4 py-2 text-sm transition-colors hover:bg-foreground/5',
                          searchBy === cat ? 'text-accent' : 'text-muted-foreground'
                        )}
                      >
                        {cat}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="w-px h-4 bg-border" />

            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={`Search by ${searchBy.toLowerCase()}...`}
              className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
            />

            {searchQuery && (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-xs bg-accent/15 text-accent px-2 py-0.5 rounded-full"
              >
                Press Enter
              </motion.span>
            )}
          </div>
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-3 shrink-0">
          {/* Theme Toggle */}
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={toggleTheme}
            className="w-8 h-8 rounded-lg glass flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </motion.button>

          {/* Notifications */}
          <div className="relative">
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={() => setShowNotifications(!showNotifications)}
              className="relative w-8 h-8 rounded-lg glass flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
            >
              <Bell className="w-4 h-4" />
              {hasMissing && <span className="absolute top-1 right-1 w-2 h-2 bg-accent rounded-full" />}
            </motion.button>

            <AnimatePresence>
              {showNotifications && (
                <motion.div
                  initial={{ opacity: 0, y: -8, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8, scale: 0.95 }}
                  transition={{ duration: 0.15 }}
                  className="absolute right-0 top-12 glass rounded-2xl overflow-hidden min-w-[260px] shadow-2xl"
                >
                  <div className="px-4 py-3 border-b border-border">
                    <p className="text-sm text-foreground font-semibold">
                      Complete profile {missing?.complete_percent ?? 100}%
                    </p>
                    <div className="h-1.5 bg-foreground/5 rounded-full overflow-hidden mt-2">
                      <div
                        className={cn('h-full rounded-full', (missing?.complete_percent ?? 100) >= 80 ? 'bg-emerald-500' : (missing?.complete_percent ?? 100) >= 50 ? 'bg-yellow-500' : 'bg-red-500')}
                        style={{ width: `${missing?.complete_percent ?? 100}%` }}
                      />
                    </div>
                  </div>
                  {hasMissing ? (
                    <div className="py-1.5">
                      {missing!.missing_fields.map(field => (
                        <div key={field} className="flex items-center gap-2.5 px-4 py-2 text-sm text-muted-foreground">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                          Add {field}
                        </div>
                      ))}
                      <Link
                        to="/profile"
                        onClick={() => setShowNotifications(false)}
                        className="flex items-center justify-center gap-1.5 mx-3 my-1.5 px-3 py-2 rounded-xl bg-accent/15 text-accent text-xs font-medium hover:bg-accent/25 transition-colors"
                      >
                        Complete Profile
                      </Link>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 px-4 py-3 text-sm text-muted-foreground">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" /> Your profile is fully filled out
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* User Menu */}
          <div className="relative">
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="flex items-center gap-2 glass rounded-xl px-3 py-1.5 hover:bg-foreground/5 transition-colors"
            >
              <div className="w-6 h-6 rounded-full bg-gradient-to-br from-[var(--gradient-1)] to-[var(--gradient-2)] flex items-center justify-center text-xs font-bold text-white">
                {user?.name?.[0] ?? 'U'}
              </div>
              <span className="text-sm text-foreground hidden sm:block">{user?.name ?? 'User'}</span>
              <ChevronDown className="w-3 h-3 text-muted-foreground" />
            </button>

            <AnimatePresence>
              {showUserMenu && (
                <motion.div
                  initial={{ opacity: 0, y: -8, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8, scale: 0.95 }}
                  transition={{ duration: 0.15 }}
                  className="absolute right-0 top-12 glass rounded-2xl overflow-hidden min-w-[180px] shadow-2xl"
                >
                  {[
                    { icon: User, label: 'Profile', to: '/profile' },
                    { icon: FileText, label: 'Resume', to: '/resume' },
                    { icon: Settings, label: 'Settings', to: '/settings' },
                  ].map(({ icon: Icon, label, to }) => (
                    <Link
                      key={label}
                      to={to}
                      onClick={() => setShowUserMenu(false)}
                      className="flex items-center gap-3 px-4 py-3 text-sm text-muted-foreground hover:text-foreground hover:bg-foreground/5 transition-colors"
                    >
                      <Icon className="w-4 h-4" />
                      {label}
                    </Link>
                  ))}
                  <div className="border-t border-border">
                    <button
                      onClick={handleLogout}
                      className="flex items-center gap-3 px-4 py-3 text-sm text-danger hover:bg-danger/10 transition-colors w-full"
                    >
                      <LogOut className="w-4 h-4" />
                      Logout
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </nav>
  )
}
