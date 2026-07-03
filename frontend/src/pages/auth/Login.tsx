import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Mail, Lock, Eye, EyeOff, ArrowRight } from 'lucide-react'
import { useAppStore } from '@/store/useAppStore'
import api from '@/lib/api'
import Logo from '@/components/ui/Logo'
import toast from 'react-hot-toast'

export default function Login() {
  const navigate = useNavigate()
  const { setUser, setToken } = useAppStore()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const { data } = await api.post('/api/auth/login', { email, password })
      setToken(data.access_token)

      const me = await api.get('/api/users/me')
      setUser(me.data)

      if (!me.data.onboarding_complete) {
        navigate('/onboarding')
      } else {
        navigate('/')
      }
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Invalid credentials')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        <div className="flex justify-center mb-8">
          <Logo size={44} />
        </div>

        <div className="glass rounded-2xl border border-white/10 p-8">
          <h1 className="text-2xl font-bold text-white mb-1">Welcome back</h1>
          <p className="text-white/40 text-sm mb-7">Sign in to continue your job hunt</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <InputField
              icon={Mail}
              type="email"
              placeholder="Email address"
              value={email}
              onChange={setEmail}
              required
            />
            <div className="relative">
              <InputField
                icon={Lock}
                type={showPass ? 'text' : 'password'}
                placeholder="Password"
                value={password}
                onChange={setPassword}
                required
              />
              <button
                type="button"
                onClick={() => setShowPass(!showPass)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60"
              >
                {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            <motion.button
              type="submit"
              disabled={loading}
              whileTap={{ scale: 0.98 }}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition-colors disabled:opacity-60"
            >
              {loading ? (
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>Sign In <ArrowRight className="w-4 h-4" /></>
              )}
            </motion.button>
          </form>

          <p className="text-center text-sm text-white/40 mt-6">
            Don't have an account?{' '}
            <Link to="/register" className="text-cyan-400 hover:text-cyan-300 transition-colors">
              Create one
            </Link>
          </p>
        </div>
      </motion.div>
    </AuthShell>
  )
}

export function Register() {
  const navigate = useNavigate()
  const { setUser, setToken } = useAppStore()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const { data } = await api.post('/api/auth/register', { name, email, password })
      setToken(data.access_token)

      const me = await api.get('/api/users/me')
      setUser(me.data)
      navigate('/onboarding')
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        <div className="flex justify-center mb-8">
          <Logo size={44} />
        </div>

        <div className="glass rounded-2xl border border-white/10 p-8">
          <h1 className="text-2xl font-bold text-white mb-1">Create account</h1>
          <p className="text-white/40 text-sm mb-7">Start your AI-powered job hunt</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <InputField icon={Mail} type="text" placeholder="Full Name" value={name} onChange={setName} required />
            <InputField icon={Mail} type="email" placeholder="Email address" value={email} onChange={setEmail} required />
            <InputField icon={Lock} type="password" placeholder="Password (min 8 chars)" value={password} onChange={setPassword} required />

            <motion.button
              type="submit"
              disabled={loading}
              whileTap={{ scale: 0.98 }}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition-colors disabled:opacity-60"
            >
              {loading ? (
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>Create Account <ArrowRight className="w-4 h-4" /></>
              )}
            </motion.button>
          </form>

          <p className="text-center text-sm text-white/40 mt-6">
            Already have an account?{' '}
            <Link to="/login" className="text-cyan-400 hover:text-cyan-300 transition-colors">
              Sign in
            </Link>
          </p>
        </div>
      </motion.div>
    </AuthShell>
  )
}

function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#0a0f1e] flex items-center justify-center p-4 relative overflow-hidden">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-80 h-80 bg-indigo-600/15 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-cyan-600/10 rounded-full blur-3xl" />
      </div>
      {children}
    </div>
  )
}

function InputField({
  icon: Icon,
  type,
  placeholder,
  value,
  onChange,
  required,
}: {
  icon: typeof Mail
  type: string
  placeholder: string
  value: string
  onChange: (v: string) => void
  required?: boolean
}) {
  return (
    <div className="relative">
      <Icon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        className="w-full glass rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder:text-white/30 border border-white/10 focus:border-indigo-500/50 focus:outline-none transition-colors"
      />
    </div>
  )
}
