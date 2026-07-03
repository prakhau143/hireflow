import { motion } from 'framer-motion'
import { User, Bell, Shield, Palette, Trash2, Save } from 'lucide-react'
import { useAppStore } from '@/store/useAppStore'

export default function Settings() {
  const { theme, toggleTheme } = useAppStore()

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="text-white/40 text-sm mt-0.5">Manage your account and preferences</p>
      </div>

      {/* Profile */}
      <SettingsSection title="Profile" icon={User}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <SettingsField label="Full Name" defaultValue="Prakhu" />
          <SettingsField label="Email" defaultValue="prakhu@gmail.com" type="email" />
          <SettingsField label="Phone" defaultValue="+91 98765 43210" />
          <SettingsField label="Location" defaultValue="Bengaluru, India" />
        </div>
        <SaveButton />
      </SettingsSection>

      {/* Appearance */}
      <SettingsSection title="Appearance" icon={Palette}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-white/80 text-sm font-medium">Theme</p>
            <p className="text-white/40 text-xs mt-0.5">Switch between dark and light mode</p>
          </div>
          <button
            onClick={toggleTheme}
            className="flex items-center gap-3 glass rounded-xl px-4 py-2 border border-white/10 hover:border-white/20 transition-all"
          >
            <span className="text-sm text-white/60">{theme === 'dark' ? '🌙 Dark' : '☀️ Light'}</span>
          </button>
        </div>
      </SettingsSection>

      {/* Notifications */}
      <SettingsSection title="Notifications" icon={Bell}>
        {[
          { label: 'New job matches', desc: 'Get notified when new jobs match your profile' },
          { label: 'AI analysis complete', desc: 'When Groq finishes processing imported jobs' },
          { label: 'Application reminders', desc: 'Remind me to follow up on applications' },
        ].map((item) => (
          <div key={item.label} className="flex items-center justify-between py-2">
            <div>
              <p className="text-white/80 text-sm">{item.label}</p>
              <p className="text-white/35 text-xs mt-0.5">{item.desc}</p>
            </div>
            <Toggle defaultChecked />
          </div>
        ))}
      </SettingsSection>

      {/* Security */}
      <SettingsSection title="Security" icon={Shield}>
        <div className="space-y-4">
          <SettingsField label="Current Password" type="password" defaultValue="" placeholder="Enter current password" />
          <SettingsField label="New Password" type="password" defaultValue="" placeholder="Enter new password" />
          <SaveButton label="Update Password" />
        </div>
      </SettingsSection>

      {/* Danger Zone */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass rounded-2xl border border-red-500/20 p-5"
      >
        <h2 className="text-red-400 font-medium text-sm flex items-center gap-2 mb-4">
          <Trash2 className="w-4 h-4" />
          Danger Zone
        </h2>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-white/70 text-sm">Delete account</p>
            <p className="text-white/35 text-xs mt-0.5">Permanently delete all your data</p>
          </div>
          <button className="px-4 py-2 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm hover:bg-red-500/20 transition-colors">
            Delete Account
          </button>
        </div>
      </motion.div>
    </div>
  )
}

function SettingsSection({ title, icon: Icon, children }: { title: string; icon: any; children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass rounded-2xl border border-white/10 p-5 space-y-4"
    >
      <h2 className="text-white font-medium text-sm flex items-center gap-2">
        <Icon className="w-4 h-4 text-blue-400" />
        {title}
      </h2>
      {children}
    </motion.div>
  )
}

function SettingsField({ label, defaultValue, type = 'text', placeholder }: { label: string; defaultValue: string; type?: string; placeholder?: string }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs text-white/40 uppercase tracking-wider">{label}</label>
      <input
        type={type}
        defaultValue={defaultValue}
        placeholder={placeholder}
        className="w-full glass rounded-xl px-3 py-2.5 text-sm text-white/70 border border-white/10 focus:border-blue-500/40 focus:outline-none"
      />
    </div>
  )
}

function SaveButton({ label = 'Save Changes' }: { label?: string }) {
  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-500/20 border border-blue-500/30 text-blue-400 text-sm hover:bg-blue-500/30 transition-all"
    >
      <Save className="w-4 h-4" />
      {label}
    </motion.button>
  )
}

function Toggle({ defaultChecked }: { defaultChecked?: boolean }) {
  return (
    <div className={`relative w-10 h-5 rounded-full transition-colors cursor-pointer ${defaultChecked ? 'bg-blue-500/60' : 'bg-white/10'}`}>
      <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${defaultChecked ? 'translate-x-5' : 'translate-x-0.5'}`} />
    </div>
  )
}
