import { Outlet } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useAppStore } from '@/store/useAppStore'
import Navbar from './Navbar'
import Sidebar from './Sidebar'

export default function AppLayout() {
  const { sidebarCollapsed } = useAppStore()

  return (
    <div className="min-h-screen bg-[#0a0f1e]">
      {/* Background gradient orbs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl" />
        <div className="absolute top-1/3 right-1/4 w-80 h-80 bg-purple-600/8 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 left-1/3 w-64 h-64 bg-cyan-600/6 rounded-full blur-3xl" />
        <div
          className="absolute inset-0 opacity-[0.015]"
          style={{
            backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
            backgroundSize: '60px 60px',
          }}
        />
      </div>

      <Navbar />
      <Sidebar />

      <motion.main
        animate={{ marginLeft: sidebarCollapsed ? 64 : 220 }}
        transition={{ duration: 0.2, ease: 'easeInOut' }}
        className="pt-16 min-h-screen relative"
      >
        <div className="p-6">
          <Outlet />
        </div>
      </motion.main>
    </div>
  )
}
