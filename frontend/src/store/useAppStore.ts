import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Theme, FilterState, User } from '@/types'

interface AppState {
  user: User | null
  token: string | null
  theme: Theme
  sidebarCollapsed: boolean
  filters: FilterState

  setUser: (user: User | null) => void
  setToken: (token: string) => void
  logout: () => void
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
  toggleSidebar: () => void
  setFilters: (filters: FilterState) => void
  clearFilters: () => void
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      theme: 'dark',
      sidebarCollapsed: false,
      filters: {},

      setUser: (user) => set({ user }),

      setToken: (token) => set({ token }),

      logout: () => {
        set({ user: null, token: null, filters: {} })
        // navigate is handled in component via useEffect watching token
      },

      setTheme: (theme) => {
        set({ theme })
        document.documentElement.className = theme === 'light' ? 'light' : ''
      },

      toggleTheme: () =>
        set((state) => {
          const next = state.theme === 'dark' ? 'light' : 'dark'
          document.documentElement.className = next === 'light' ? 'light' : ''
          return { theme: next }
        }),

      toggleSidebar: () =>
        set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),

      setFilters: (filters) => set({ filters }),
      clearFilters: () => set({ filters: {} }),
    }),
    {
      name: 'hireflow-store',
      partialize: (state) => ({
        token: state.token,
        user: state.user,
        theme: state.theme,
        sidebarCollapsed: state.sidebarCollapsed,
      }),
    }
  )
)
