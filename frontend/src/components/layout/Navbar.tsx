import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, Sun, Moon, Bell, ChevronDown, User, FileText, Settings, LogOut } from 'lucide-react'
import { useAppStore } from '@/store/useAppStore'
import { cn } from '@/lib/utils'
import { Link, useNavigate } from 'react-router-dom'
import Logo from '@/components/ui/Logo'

const searchCategories = ['Role', 'Skill', 'Company', 'Experience']

export default function Navbar() {
  const { theme, toggleTheme, user, logout } = useAppStore()
  const navigate = useNavigate()
  const [searchQuery, setSearchQuery] = useState('')
  const [searchBy, setSearchBy] = useState('Role')
  const [showDropdown, setShowDropdown] = useState(false)
  const [showUserMenu, setShowUserMenu] = useState(false)

  function handleLogout() {
    logout()
    navigate('/login')
  }

  return (
    <nav className={cn(
      'fixed top-0 left-0 right-0 z-50 h-16',
      'glass border-b border-white/10'
    )}>
      <div className="flex items-center h-full px-6 gap-4">
        {/* Logo */}
        <Link to="/" className="shrink-0">
          <Logo size={32} />
        </Link>

        {/* Global Search */}
        <div className="flex-1 max-w-2xl mx-auto">
          <div className="relative flex items-center gap-2 glass rounded-xl px-3 py-2">
            <Search className="w-4 h-4 text-white/40 shrink-0" />

            {/* Search By Dropdown */}
            <div className="relative">
              <button
                onClick={() => setShowDropdown(!showDropdown)}
                className="flex items-center gap-1 text-xs text-white/60 hover:text-white/80 transition-colors"
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
                          'w-full text-left px-4 py-2 text-sm transition-colors hover:bg-white/10',
                          searchBy === cat ? 'text-blue-400' : 'text-white/70'
                        )}
                      >
                        {cat}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="w-px h-4 bg-white/10" />

            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={`Search by ${searchBy.toLowerCase()}...`}
              className="flex-1 bg-transparent text-sm text-white placeholder:text-white/30 outline-none"
            />

            {searchQuery && (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-xs bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full"
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
            className="w-8 h-8 rounded-lg glass flex items-center justify-center text-white/70 hover:text-white transition-colors"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </motion.button>

          {/* Notifications */}
          <motion.button
            whileTap={{ scale: 0.9 }}
            className="relative w-8 h-8 rounded-lg glass flex items-center justify-center text-white/70 hover:text-white transition-colors"
          >
            <Bell className="w-4 h-4" />
            <span className="absolute top-1 right-1 w-2 h-2 bg-blue-500 rounded-full" />
          </motion.button>

          {/* User Menu */}
          <div className="relative">
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="flex items-center gap-2 glass rounded-xl px-3 py-1.5 hover:bg-white/10 transition-colors"
            >
              <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-xs font-bold text-white">
                {user?.name?.[0] ?? 'U'}
              </div>
              <span className="text-sm text-white/80 hidden sm:block">{user?.name ?? 'User'}</span>
              <ChevronDown className="w-3 h-3 text-white/50" />
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
                    { icon: Bell, label: 'Notifications', to: '/notifications' },
                    { icon: Settings, label: 'Settings', to: '/settings' },
                  ].map(({ icon: Icon, label, to }) => (
                    <Link
                      key={label}
                      to={to}
                      onClick={() => setShowUserMenu(false)}
                      className="flex items-center gap-3 px-4 py-3 text-sm text-white/70 hover:text-white hover:bg-white/10 transition-colors"
                    >
                      <Icon className="w-4 h-4" />
                      {label}
                    </Link>
                  ))}
                  <div className="border-t border-white/10">
                    <button
                      onClick={handleLogout}
                      className="flex items-center gap-3 px-4 py-3 text-sm text-red-400 hover:bg-red-500/10 transition-colors w-full"
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
