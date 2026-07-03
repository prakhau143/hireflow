import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Mail, CheckCircle, XCircle, RefreshCw, Eye, EyeOff, Send, Settings } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { cn } from '@/lib/utils'
import { EmptyState } from '@/components/ui/EmptyState'
import api from '@/lib/api'
import toast from 'react-hot-toast'

interface SmtpForm {
  host: string
  port: string
  username: string
  password: string
  from_name: string
  from_email: string
}

export default function SmtpManager() {
  const qc = useQueryClient()
  const [showPass, setShowPass] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [testResult, setTestResult] = useState<'success' | 'failed' | null>(null)
  const [form, setForm] = useState<SmtpForm>({
    host: '', port: '587', username: '', password: '', from_name: '', from_email: '',
  })

  const { data: smtp, isLoading } = useQuery<any>({
    queryKey: ['smtp'],
    queryFn: async () => {
      const { data } = await api.get('/api/smtp/')
      return data
    },
  })

  useEffect(() => {
    if (smtp) {
      setForm({
        host: smtp.host ?? '',
        port: String(smtp.port ?? 587),
        username: smtp.username ?? '',
        password: '',
        from_name: smtp.from_name ?? '',
        from_email: smtp.from_email ?? '',
      })
    }
  }, [smtp])

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = { ...form, port: parseInt(form.port) }
      if (smtp?.id) {
        const { data } = await api.put(`/api/smtp/${smtp.id}`, payload)
        return data
      } else {
        const { data } = await api.post('/api/smtp/', payload)
        return data
      }
    },
    onSuccess: () => {
      toast.success('SMTP configuration saved!')
      qc.invalidateQueries({ queryKey: ['smtp'] })
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to save'),
  })

  const testMutation = useMutation({
    mutationFn: async () => {
      if (!smtp?.id) throw new Error('Save config first')
      const { data } = await api.post(`/api/smtp/${smtp.id}/test`)
      return data
    },
    onSuccess: (data) => {
      setTestResult(data.status === 'success' ? 'success' : 'failed')
      qc.invalidateQueries({ queryKey: ['smtp'] })
    },
    onError: () => setTestResult('failed'),
  })

  function setField(key: keyof SmtpForm, value: string) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  const isActive = smtp?.is_active && smtp?.test_status === 'success'

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-white">SMTP Manager</h1>
        <p className="text-white/40 text-sm mt-0.5">Configure email delivery for job applications</p>
      </div>

      {/* Config Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass rounded-2xl border border-white/10 p-6 space-y-5"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-white font-medium flex items-center gap-2">
            <Mail className="w-4 h-4 text-indigo-400" />
            SMTP Configuration
          </h2>
          {smtp && (
            <div className={cn(
              'flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full',
              isActive ? 'bg-emerald-500/10 text-emerald-400' : 'bg-gray-500/10 text-gray-400'
            )}>
              <div className={cn('w-1.5 h-1.5 rounded-full', isActive ? 'bg-emerald-400' : 'bg-gray-400')} />
              {isActive ? 'Connected' : 'Not Tested'}
            </div>
          )}
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-10 rounded-xl bg-white/5 shimmer" />
            ))}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField label="SMTP Host" value={form.host} onChange={(v) => setField('host', v)} placeholder="smtp.gmail.com" />
              <FormField label="Port" value={form.port} onChange={(v) => setField('port', v)} placeholder="587" type="number" />
              <FormField label="Username" value={form.username} onChange={(v) => setField('username', v)} placeholder="you@gmail.com" />
              <div className="space-y-1.5">
                <label className="text-xs text-white/40 uppercase tracking-wider">Password / App Password</label>
                <div className="relative">
                  <input
                    type={showPass ? 'text' : 'password'}
                    value={form.password}
                    onChange={(e) => setField('password', e.target.value)}
                    placeholder={smtp ? '••••••••••• (leave blank to keep)' : 'App password'}
                    className="w-full glass rounded-xl px-3 py-2.5 text-sm text-white/70 placeholder:text-white/25 border border-white/10 focus:border-indigo-500/40 focus:outline-none pr-9"
                  />
                  <button
                    onClick={() => setShowPass(!showPass)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60"
                  >
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <FormField label="From Name" value={form.from_name} onChange={(v) => setField('from_name', v)} placeholder="Your Name" />
              <FormField label="From Email" value={form.from_email} onChange={(v) => setField('from_email', v)} placeholder="you@gmail.com" />
            </div>

            {/* Gmail tip */}
            <div className="glass rounded-xl border border-yellow-500/20 px-4 py-3 text-xs text-yellow-400/80">
              <strong>Gmail users:</strong> Enable 2FA → generate an App Password at myaccount.google.com/apppasswords. Use that instead of your regular password.
            </div>

            <div className="flex gap-3 pt-2 flex-wrap">
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={() => testMutation.mutate()}
                disabled={testMutation.isPending || !smtp?.id}
                title={!smtp?.id ? 'Save first, then test' : ''}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl glass border border-white/15 text-sm text-white/70 hover:text-white hover:border-white/25 transition-all disabled:opacity-50"
              >
                {testMutation.isPending
                  ? <RefreshCw className="w-4 h-4 animate-spin" />
                  : <RefreshCw className="w-4 h-4" />}
                {testMutation.isPending ? 'Testing...' : 'Test Connection'}
              </motion.button>

              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={() => setShowPreview(true)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl glass border border-white/15 text-sm text-white/70 hover:text-white hover:border-white/25 transition-all"
              >
                <Eye className="w-4 h-4" />
                Preview Email
              </motion.button>

              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-500/20 border border-indigo-500/30 text-sm text-indigo-400 hover:bg-indigo-500/30 transition-all ml-auto disabled:opacity-60"
              >
                {saveMutation.isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Settings className="w-4 h-4" />}
                {saveMutation.isPending ? 'Saving...' : 'Save Changes'}
              </motion.button>
            </div>

            {/* Test Result */}
            <AnimatePresence>
              {testResult && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className={cn(
                    'flex items-center gap-2.5 px-4 py-3 rounded-xl text-sm',
                    testResult === 'success'
                      ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
                      : 'bg-red-500/10 border border-red-500/20 text-red-400'
                  )}
                >
                  {testResult === 'success'
                    ? <><CheckCircle className="w-4 h-4" /> SMTP connection successful! Email delivery is working.</>
                    : <><XCircle className="w-4 h-4" /> Connection failed. Check your host, port, and credentials.</>}
                </motion.div>
              )}
            </AnimatePresence>
          </>
        )}
      </motion.div>

      {/* If no SMTP configured at all */}
      {!isLoading && !smtp && (
        <EmptyState
          icon={Mail}
          title="No SMTP configured"
          description="Fill in your email server details above to enable sending job applications directly from HireFlow."
        />
      )}

      {/* Email Preview Modal */}
      <AnimatePresence>
        {showPreview && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-6"
            style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
            onClick={() => setShowPreview(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="glass rounded-2xl border border-white/15 p-6 max-w-xl w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
                <Send className="w-4 h-4 text-indigo-400" />
                Email Preview
              </h3>
              <div className="space-y-3 text-sm">
                <PreviewRow label="From" value={`${form.from_name} <${form.from_email}>`} />
                <PreviewRow label="Subject" value="Application for {role} at {company}" />
                <PreviewRow label="Attachment" value="your_resume.pdf" highlight />
                <div className="glass rounded-xl border border-white/10 p-3">
                  <p className="text-white/40 text-xs mb-2">Body</p>
                  <p className="text-white/60 leading-relaxed text-xs">
                    Dear {'{name}'},<br /><br />
                    I came across your opening for {'{role}'} and would love to apply.
                    Please find my resume attached.<br /><br />
                    Best regards,<br />
                    {form.from_name || 'Your Name'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowPreview(false)}
                className="mt-5 w-full py-2.5 rounded-xl glass border border-white/10 text-white/60 text-sm hover:text-white transition-colors"
              >
                Close
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function FormField({ label, value, onChange, placeholder, type = 'text' }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs text-white/40 uppercase tracking-wider">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full glass rounded-xl px-3 py-2.5 text-sm text-white/70 placeholder:text-white/25 border border-white/10 focus:border-indigo-500/40 focus:outline-none"
      />
    </div>
  )
}

function PreviewRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="glass rounded-xl border border-white/10 p-3">
      <p className="text-white/40 text-xs mb-1">{label}</p>
      <p className={highlight ? 'text-indigo-400 text-xs' : 'text-white/80 text-sm'}>{value}</p>
    </div>
  )
}
