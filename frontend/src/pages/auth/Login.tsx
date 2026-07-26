import { useState, useRef, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Mail, Lock, Eye, EyeOff, ArrowRight, KeyRound, ShieldCheck, RefreshCw } from 'lucide-react'
import { useAppStore } from '@/store/useAppStore'
import api from '@/lib/api'
import Logo from '@/components/ui/Logo'
import toast from 'react-hot-toast'

export default function Login() {
  const navigate = useNavigate()
  const { setUser, setToken, theme } = useAppStore()
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
          <Logo size={44} theme={theme === 'light' ? 'light' : 'dark'} />
        </div>

        <div className="glass rounded-2xl border border-border p-8">
          <h1 className="text-2xl font-bold text-foreground mb-1">Welcome back</h1>
          <p className="text-muted-foreground text-sm mb-7">Sign in to continue your job hunt</p>

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
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-muted-foreground"
              >
                {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            <div className="flex justify-end">
              <Link
                to="/forgot-password"
                className="text-xs text-accent hover:text-accent/80 transition-colors"
              >
                Forgot password?
              </Link>
            </div>

            <motion.button
              type="submit"
              disabled={loading}
              whileTap={{ scale: 0.98 }}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-accent hover:bg-accent/90 text-accent-foreground font-medium transition-colors disabled:opacity-60"
            >
              {loading ? (
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>Sign In <ArrowRight className="w-4 h-4" /></>
              )}
            </motion.button>
          </form>

          <p className="text-center text-sm text-muted-foreground mt-6">
            Don't have an account?{' '}
            <Link to="/register" className="text-accent hover:text-accent/80 transition-colors">
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
  const { setUser, setToken, theme } = useAppStore()
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
          <Logo size={44} theme={theme === 'light' ? 'light' : 'dark'} />
        </div>

        <div className="glass rounded-2xl border border-border p-8">
          <h1 className="text-2xl font-bold text-foreground mb-1">Create account</h1>
          <p className="text-muted-foreground text-sm mb-7">Start your AI-powered job hunt</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <InputField icon={Mail} type="text" placeholder="Full Name" value={name} onChange={setName} required />
            <InputField icon={Mail} type="email" placeholder="Email address" value={email} onChange={setEmail} required />
            <InputField icon={Lock} type="password" placeholder="Password (min 8 chars)" value={password} onChange={setPassword} required />

            <motion.button
              type="submit"
              disabled={loading}
              whileTap={{ scale: 0.98 }}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-accent hover:bg-accent/90 text-accent-foreground font-medium transition-colors disabled:opacity-60"
            >
              {loading ? (
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>Create Account <ArrowRight className="w-4 h-4" /></>
              )}
            </motion.button>
          </form>

          <p className="text-center text-sm text-muted-foreground mt-6">
            Already have an account?{' '}
            <Link to="/login" className="text-accent hover:text-accent/80 transition-colors">
              Sign in
            </Link>
          </p>
        </div>
      </motion.div>
    </AuthShell>
  )
}

// ── Forgot Password — 3-step flow ─────────────────────────────────────────────

type FPStep = 'email' | 'otp' | 'password'

export function ForgotPassword() {
  const navigate = useNavigate()
  const { theme } = useAppStore()
  const [step, setStep] = useState<FPStep>('email')
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState(['', '', '', '', '', ''])
  const [resetToken, setResetToken] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [resendCountdown, setResendCountdown] = useState(0)
  const otpRefs = useRef<(HTMLInputElement | null)[]>([])

  // Countdown timer for resend
  useEffect(() => {
    if (resendCountdown <= 0) return
    const t = setTimeout(() => setResendCountdown(c => c - 1), 1000)
    return () => clearTimeout(t)
  }, [resendCountdown])

  // ── Step 1: Request OTP ──────────────────────────────────────────────────────
  async function handleSendOTP(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const { data } = await api.post('/api/auth/forgot-password', { email })
      toast.success('OTP sent! Check your email.')
      setStep('otp')
      setResendCountdown(data?.resend_after_seconds ?? 60)
      setTimeout(() => otpRefs.current[0]?.focus(), 100)
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to send OTP')
    } finally {
      setLoading(false)
    }
  }

  // ── OTP input handlers ────────────────────────────────────────────────────────
  function handleOtpChange(idx: number, val: string) {
    if (!/^\d*$/.test(val)) return
    const next = [...otp]
    next[idx] = val.slice(-1)
    setOtp(next)
    if (val && idx < 5) otpRefs.current[idx + 1]?.focus()
  }

  function handleOtpKeyDown(idx: number, e: React.KeyboardEvent) {
    if (e.key === 'Backspace' && !otp[idx] && idx > 0) {
      otpRefs.current[idx - 1]?.focus()
    }
    if (e.key === 'ArrowLeft' && idx > 0) otpRefs.current[idx - 1]?.focus()
    if (e.key === 'ArrowRight' && idx < 5) otpRefs.current[idx + 1]?.focus()
  }

  function handleOtpPaste(e: React.ClipboardEvent) {
    e.preventDefault()
    const digits = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (!digits) return
    const next = [...otp]
    digits.split('').forEach((d, i) => { next[i] = d })
    setOtp(next)
    otpRefs.current[Math.min(digits.length, 5)]?.focus()
  }

  // ── Step 2: Verify OTP ────────────────────────────────────────────────────────
  async function handleVerifyOTP(e: React.FormEvent) {
    e.preventDefault()
    const code = otp.join('')
    if (code.length < 6) { toast.error('Enter the 6-digit OTP'); return }
    setLoading(true)
    try {
      const { data } = await api.post('/api/auth/verify-otp', { email, otp: code })
      setResetToken(data.reset_token)
      toast.success('OTP verified!')
      setStep('password')
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Invalid OTP')
    } finally {
      setLoading(false)
    }
  }

  // ── Step 3: Reset Password ────────────────────────────────────────────────────
  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault()
    if (newPassword !== confirmPassword) { toast.error('Passwords do not match'); return }
    if (newPassword.length < 8) { toast.error('Password must be at least 8 characters'); return }
    setLoading(true)
    try {
      await api.post('/api/auth/reset-password', { reset_token: resetToken, new_password: newPassword })
      toast.success('Password reset! Please sign in.')
      navigate('/login')
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to reset password')
    } finally {
      setLoading(false)
    }
  }

  async function handleResend() {
    if (resendCountdown > 0) return
    setLoading(true)
    try {
      const { data } = await api.post('/api/auth/forgot-password', { email })
      setOtp(['', '', '', '', '', ''])
      setResendCountdown(data?.resend_after_seconds ?? 60)
      toast.success('New OTP sent!')
      setTimeout(() => otpRefs.current[0]?.focus(), 100)
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to resend OTP')
    } finally {
      setLoading(false)
    }
  }

  const stepMeta = {
    email:    { icon: Mail,        label: 'Forgot password',    sub: 'Enter your registered email' },
    otp:      { icon: ShieldCheck, label: 'Verify OTP',         sub: `6-digit code sent to ${email}` },
    password: { icon: KeyRound,    label: 'New password',       sub: 'Choose a strong password' },
  }

  const { icon: StepIcon, label, sub } = stepMeta[step]

  return (
    <AuthShell>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        <div className="flex justify-center mb-8">
          <Logo size={44} theme={theme === 'light' ? 'light' : 'dark'} />
        </div>

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-2 mb-6">
          {(['email', 'otp', 'password'] as FPStep[]).map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                step === s ? 'bg-accent text-accent-foreground' :
                ['email', 'otp', 'password'].indexOf(step) > i ? 'bg-emerald-500 text-white' :
                'bg-foreground/10 text-muted-foreground'
              }`}>
                {['email', 'otp', 'password'].indexOf(step) > i ? '✓' : i + 1}
              </div>
              {i < 2 && <div className={`w-8 h-px ${['email', 'otp', 'password'].indexOf(step) > i ? 'bg-emerald-500' : 'bg-border'}`} />}
            </div>
          ))}
        </div>

        <div className="glass rounded-2xl border border-border p-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 }}
              transition={{ duration: 0.2 }}
            >
              {/* Header */}
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-accent/20 flex items-center justify-center">
                  <StepIcon className="w-5 h-5 text-accent" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-foreground">{label}</h1>
                  <p className="text-muted-foreground text-xs">{sub}</p>
                </div>
              </div>

              {/* ── Step 1: Email ── */}
              {step === 'email' && (
                <form onSubmit={handleSendOTP} className="space-y-4">
                  <InputField
                    icon={Mail}
                    type="email"
                    placeholder="Your registered email"
                    value={email}
                    onChange={setEmail}
                    required
                  />
                  <PrimaryButton loading={loading}>
                    Send OTP <ArrowRight className="w-4 h-4" />
                  </PrimaryButton>
                  <p className="text-center text-sm text-muted-foreground pt-1">
                    Remember it?{' '}
                    <Link to="/login" className="text-accent hover:text-accent/80">Back to sign in</Link>
                  </p>
                </form>
              )}

              {/* ── Step 2: OTP ── */}
              {step === 'otp' && (
                <form onSubmit={handleVerifyOTP} className="space-y-6">
                  <div className="flex gap-2 justify-center">
                    {otp.map((digit, i) => (
                      <input
                        key={i}
                        ref={el => { otpRefs.current[i] = el }}
                        type="text"
                        inputMode="numeric"
                        maxLength={1}
                        value={digit}
                        onChange={e => handleOtpChange(i, e.target.value)}
                        onKeyDown={e => handleOtpKeyDown(i, e)}
                        onPaste={handleOtpPaste}
                        className={`w-11 h-14 text-center text-xl font-bold glass rounded-xl border transition-all outline-none
                          ${digit ? 'border-accent text-foreground' : 'border-border text-muted-foreground'}
                          focus:border-accent focus:ring-2 focus:ring-accent/20`}
                      />
                    ))}
                  </div>

                  <PrimaryButton loading={loading}>
                    Verify OTP <ShieldCheck className="w-4 h-4" />
                  </PrimaryButton>

                  <div className="flex items-center justify-between text-sm">
                    <button
                      type="button"
                      onClick={() => { setStep('email'); setOtp(['', '', '', '', '', '']) }}
                      className="text-muted-foreground hover:text-muted-foreground transition-colors text-xs"
                    >
                      ← Change email
                    </button>
                    <button
                      type="button"
                      onClick={handleResend}
                      disabled={resendCountdown > 0 || loading}
                      className="flex items-center gap-1 text-xs text-accent hover:text-accent/80 disabled:text-muted-foreground/60 disabled:cursor-not-allowed transition-colors"
                    >
                      <RefreshCw className="w-3 h-3" />
                      {resendCountdown > 0 ? `Resend in ${resendCountdown}s` : 'Resend OTP'}
                    </button>
                  </div>
                </form>
              )}

              {/* ── Step 3: New Password ── */}
              {step === 'password' && (
                <form onSubmit={handleResetPassword} className="space-y-4">
                  <div className="relative">
                    <InputField
                      icon={Lock}
                      type={showPass ? 'text' : 'password'}
                      placeholder="New password (min 8 characters)"
                      value={newPassword}
                      onChange={setNewPassword}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPass(!showPass)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-muted-foreground"
                    >
                      {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <InputField
                    icon={Lock}
                    type="password"
                    placeholder="Confirm new password"
                    value={confirmPassword}
                    onChange={setConfirmPassword}
                    required
                  />

                  {/* Password strength indicator */}
                  {newPassword && (
                    <PasswordStrength password={newPassword} />
                  )}

                  <PrimaryButton loading={loading}>
                    Reset Password <KeyRound className="w-4 h-4" />
                  </PrimaryButton>
                </form>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </motion.div>
    </AuthShell>
  )
}

// ── Shared sub-components ──────────────────────────────────────────────────────

function PasswordStrength({ password }: { password: string }) {
  const checks = [
    { label: '8+ characters', ok: password.length >= 8 },
    { label: 'Uppercase', ok: /[A-Z]/.test(password) },
    { label: 'Number', ok: /\d/.test(password) },
    { label: 'Symbol', ok: /[^A-Za-z0-9]/.test(password) },
  ]
  const score = checks.filter(c => c.ok).length
  const color = score <= 1 ? 'bg-red-500' : score <= 2 ? 'bg-amber-500' : score <= 3 ? 'bg-yellow-400' : 'bg-emerald-500'
  const label = score <= 1 ? 'Weak' : score <= 2 ? 'Fair' : score <= 3 ? 'Good' : 'Strong'

  return (
    <div className="space-y-2">
      <div className="flex gap-1">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className={`h-1 flex-1 rounded-full transition-all ${i <= score ? color : 'bg-foreground/10'}`} />
        ))}
      </div>
      <div className="flex items-center justify-between">
        <div className="flex gap-2 flex-wrap">
          {checks.map(c => (
            <span key={c.label} className={`text-xs ${c.ok ? 'text-emerald-400' : 'text-muted-foreground/60'}`}>
              {c.ok ? '✓' : '○'} {c.label}
            </span>
          ))}
        </div>
        <span className={`text-xs font-medium ${color.replace('bg-', 'text-')}`}>{label}</span>
      </div>
    </div>
  )
}

function PrimaryButton({ children, loading }: { children: React.ReactNode; loading: boolean }) {
  return (
    <motion.button
      type="submit"
      disabled={loading}
      whileTap={{ scale: 0.98 }}
      className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-accent hover:bg-accent/90 text-accent-foreground font-medium transition-colors disabled:opacity-60"
    >
      {loading ? (
        <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
      ) : children}
    </motion.button>
  )
}

function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 relative overflow-hidden">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-80 h-80 rounded-full blur-3xl" style={{ background: 'var(--orb-1)' }} />
        <div className="absolute bottom-1/4 right-1/4 w-64 h-64 rounded-full blur-3xl" style={{ background: 'var(--orb-3)' }} />
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
      <Icon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        className="w-full glass rounded-xl pl-10 pr-4 py-3 text-sm text-foreground placeholder:text-muted-foreground border border-border focus:border-accent/50 focus:outline-none transition-colors"
      />
    </div>
  )
}
