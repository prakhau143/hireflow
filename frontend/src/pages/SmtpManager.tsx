import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Mail, CheckCircle, XCircle, RefreshCw, Eye, EyeOff, Send, Settings, Server, Activity, Clock, AlertCircle, ExternalLink, Copy, Zap } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { cn } from '@/lib/utils'
import { EmptyState } from '@/components/ui/EmptyState'
import api from '@/lib/api'
import toast from 'react-hot-toast'

interface SmtpForm {
  provider: string
  host: string
  port: string
  encryption: string
  username: string
  password: string
  from_name: string
  from_email: string
  reply_email: string
}

const PROVIDER_CONFIGS: Record<string, { host: string; port: string; encryption: string }> = {
  gmail: { host: 'smtp.gmail.com', port: '587', encryption: 'TLS' },
  outlook: { host: 'smtp-mail.outlook.com', port: '587', encryption: 'TLS' },
  yahoo: { host: 'smtp.mail.yahoo.com', port: '587', encryption: 'TLS' },
  zoho: { host: 'smtp.zoho.com', port: '587', encryption: 'TLS' },
  custom: { host: '', port: '587', encryption: 'TLS' },
}

export default function SmtpManager() {
  const qc = useQueryClient()
  const [showPass, setShowPass] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [showTestEmail, setShowTestEmail] = useState(false)
  const [testEmail, setTestEmail] = useState('')
  const [form, setForm] = useState<SmtpForm>({
    provider: 'gmail',
    host: 'smtp.gmail.com',
    port: '587',
    encryption: 'TLS',
    username: '',
    password: '',
    from_name: '',
    from_email: '',
    reply_email: '',
  })

  const { data: smtpConfigs, isLoading } = useQuery<any[]>({
    queryKey: ['smtp'],
    queryFn: async () => {
      const { data } = await api.get('/api/smtp/')
      return data
    },
  })

  const primarySmtp = smtpConfigs?.find((s: any) => s.is_primary) || smtpConfigs?.[0]

  const { data: logs } = useQuery({
    queryKey: ['smtp-logs', primarySmtp?.id],
    queryFn: async () => {
      if (!primarySmtp?.id) return []
      const { data } = await api.get(`/api/smtp/${primarySmtp.id}/logs`)
      return data
    },
    enabled: !!primarySmtp?.id,
  })

  useEffect(() => {
    if (primarySmtp) {
      setForm({
        provider: primarySmtp.provider || 'custom',
        host: primarySmtp.host || '',
        port: String(primarySmtp.port || 587),
        encryption: primarySmtp.encryption || 'TLS',
        username: primarySmtp.username || '',
        password: '',
        from_name: primarySmtp.from_name || '',
        from_email: primarySmtp.from_email || '',
        reply_email: primarySmtp.reply_email || '',
      })
    }
  }, [primarySmtp])

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = { ...form, port: parseInt(form.port) }
      if (primarySmtp?.id) {
        const { data } = await api.put(`/api/smtp/${primarySmtp.id}`, payload)
        return data
      } else {
        const { data } = await api.post('/api/smtp/', payload)
        return data
      }
    },
    onSuccess: () => {
      toast.success('SMTP configuration saved successfully!')
      qc.invalidateQueries({ queryKey: ['smtp'] })
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to save configuration'),
  })

  const verifyMutation = useMutation({
    mutationFn: async () => {
      if (!primarySmtp?.id) throw new Error('Save configuration first')
      const { data } = await api.post(`/api/smtp/${primarySmtp.id}/verify`)
      return data
    },
    onSuccess: (data) => {
      if (data.status === 'success') {
        toast.success('SMTP verified successfully! Test email sent.')
      } else {
        toast.error(data.message || 'Verification failed')
      }
      qc.invalidateQueries({ queryKey: ['smtp'] })
    },
  })

  const sendTestMutation = useMutation({
    mutationFn: async () => {
      if (!primarySmtp?.id) throw new Error('Save configuration first')
      const { data } = await api.post(`/api/smtp/${primarySmtp.id}/send-test`, { to_email: testEmail })
      return data
    },
    onSuccess: (data) => {
      if (data.status === 'success') {
        toast.success(data.message || 'Test email sent successfully!')
        setShowTestEmail(false)
        setTestEmail('')
      } else {
        toast.error(data.message || 'Failed to send test email')
      }
      qc.invalidateQueries({ queryKey: ['smtp'] })
    },
  })

  function setField(key: keyof SmtpForm, value: string) {
    setForm((f) => ({ ...f, [key]: value }))
    
    // Auto-fill based on provider
    if (key === 'provider' && value in PROVIDER_CONFIGS) {
      const config = PROVIDER_CONFIGS[value]
      setForm((f) => ({ ...f, host: config.host, port: config.port, encryption: config.encryption }))
    }
  }

  const isConnected = primarySmtp?.test_status === 'success'
  const healthScore = primarySmtp?.connection_health || 0

  return (
    <div className="w-full space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Email Delivery Center</h1>
        <p className="text-white/40 text-sm mt-0.5">Configure, verify and manage your email delivery for AI job applications</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Configuration */}
        <div className="lg:col-span-2 space-y-6">
          {/* SMTP Configuration Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass rounded-2xl border border-white/10 p-6"
          >
            <div className="flex items-center gap-2 mb-6">
              <Server className="w-5 h-5 text-indigo-400" />
              <h2 className="text-white font-semibold">SMTP Configuration</h2>
            </div>

            {isLoading ? (
              <div className="space-y-4">
                {[...Array(8)].map((_, i) => (
                  <div key={i} className="h-12 rounded-xl bg-white/5 shimmer" />
                ))}
              </div>
            ) : (
              <div className="space-y-4">
                {/* Provider Selection */}
                <div className="space-y-1.5">
                  <label className="text-xs text-white/40 uppercase tracking-wider">SMTP Provider</label>
                  <select
                    value={form.provider}
                    onChange={(e) => setField('provider', e.target.value)}
                    className="w-full glass rounded-xl px-3 py-2.5 text-sm text-white/70 border border-white/10 focus:border-indigo-500/40 focus:outline-none"
                  >
                    <option value="gmail">Gmail</option>
                    <option value="outlook">Outlook</option>
                    <option value="yahoo">Yahoo</option>
                    <option value="zoho">Zoho</option>
                    <option value="custom">Custom SMTP</option>
                  </select>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <FormField label="Host" value={form.host} onChange={(v) => setField('host', v)} placeholder="smtp.gmail.com" />
                  <FormField label="Port" value={form.port} onChange={(v) => setField('port', v)} placeholder="587" type="number" />
                  <FormField label="Encryption" value={form.encryption} onChange={(v) => setField('encryption', v)} placeholder="TLS" />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs text-white/40 uppercase tracking-wider">Google Email</label>
                  <input
                    type="email"
                    value={form.username}
                    onChange={(e) => setField('username', e.target.value)}
                    placeholder="example@gmail.com"
                    className="w-full glass rounded-xl px-3 py-2.5 text-sm text-white/70 placeholder:text-white/25 border border-white/10 focus:border-indigo-500/40 focus:outline-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs text-white/40 uppercase tracking-wider">App Password</label>
                  <div className="relative">
                    <input
                      type={showPass ? 'text' : 'password'}
                      value={form.password}
                      onChange={(e) => setField('password', e.target.value)}
                      placeholder={primarySmtp ? '••••••••••• (leave blank to keep)' : 'App password'}
                      className="w-full glass rounded-xl px-3 py-2.5 text-sm text-white/70 placeholder:text-white/25 border border-white/10 focus:border-indigo-500/40 focus:outline-none pr-20"
                    />
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                      <button
                        onClick={() => setShowPass(!showPass)}
                        className="p-1.5 text-white/30 hover:text-white/60 rounded-lg hover:bg-white/5 transition-colors"
                      >
                        {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField label="Sender Name" value={form.from_name} onChange={(v) => setField('from_name', v)} placeholder="Prakhar Mittal" />
                  <FormField label="Reply Email" value={form.reply_email} onChange={(v) => setField('reply_email', v)} placeholder="example@gmail.com" />
                </div>

                {/* Gmail App Password Guide */}
                <div className="glass rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-indigo-500/20 flex items-center justify-center shrink-0">
                      <Zap className="w-4 h-4 text-indigo-400" />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-sm font-medium text-indigo-300 mb-2">Need a Gmail App Password?</h3>
                      <ol className="text-xs text-white/50 space-y-1 list-decimal list-inside">
                        <li>Enable Two Factor Authentication</li>
                        <li>Visit <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:underline">myaccount.google.com/apppasswords</a></li>
                        <li>Generate App Password</li>
                        <li>Paste it here</li>
                      </ol>
                      <a
                        href="https://myaccount.google.com/apppasswords"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 mt-3 text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
                      >
                        Open Google <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  </div>
                </div>

                <div className="flex gap-3 pt-2 flex-wrap">
                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={() => verifyMutation.mutate()}
                    disabled={verifyMutation.isPending || !primarySmtp?.id}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500/20 border border-emerald-500/30 text-sm text-emerald-400 hover:bg-emerald-500/30 transition-all disabled:opacity-50"
                  >
                    {verifyMutation.isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                    {verifyMutation.isPending ? 'Verifying...' : 'Verify SMTP'}
                  </motion.button>

                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={() => setShowTestEmail(true)}
                    disabled={!primarySmtp?.id || !isConnected}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl glass border border-white/15 text-sm text-white/70 hover:text-white hover:border-white/25 transition-all disabled:opacity-50"
                  >
                    <Send className="w-4 h-4" />
                    Send Test Email
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
                    {saveMutation.isPending ? 'Saving...' : 'Save Configuration'}
                  </motion.button>
                </div>
              </div>
            )}
          </motion.div>

          {/* Saved Configuration Card */}
          {primarySmtp && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="glass rounded-2xl border border-white/10 p-6"
            >
              <h3 className="text-white font-medium mb-4 flex items-center gap-2">
                <Settings className="w-4 h-4 text-indigo-400" />
                Saved Configuration
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <p className="text-white/40 text-xs mb-1">Provider</p>
                  <p className="text-white/80">{primarySmtp.provider || 'Custom'}</p>
                </div>
                <div>
                  <p className="text-white/40 text-xs mb-1">Email</p>
                  <p className="text-white/80">{primarySmtp.username}</p>
                </div>
                <div>
                  <p className="text-white/40 text-xs mb-1">Port</p>
                  <p className="text-white/80">{primarySmtp.port}</p>
                </div>
                <div>
                  <p className="text-white/40 text-xs mb-1">Encryption</p>
                  <p className="text-white/80">{primarySmtp.encryption}</p>
                </div>
                <div>
                  <p className="text-white/40 text-xs mb-1">Status</p>
                  <p className={cn(isConnected ? 'text-emerald-400' : 'text-red-400')}>
                    {isConnected ? 'Connected' : 'Not Verified'}
                  </p>
                </div>
                <div>
                  <p className="text-white/40 text-xs mb-1">Last Tested</p>
                  <p className="text-white/80">
                    {primarySmtp.last_tested ? new Date(primarySmtp.last_tested).toLocaleString() : 'Never'}
                  </p>
                </div>
                <div className="col-span-2">
                  <p className="text-white/40 text-xs mb-1">Password</p>
                  <p className="text-white/80">{'•'.repeat(16)}</p>
                </div>
              </div>
            </motion.div>
          )}
        </div>

        {/* Right Column - Status & Analytics */}
        <div className="space-y-6">
          {/* Connection Status Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="glass rounded-2xl border border-white/10 p-6"
          >
            <div className="flex items-center gap-2 mb-6">
              <Activity className="w-5 h-5 text-indigo-400" />
              <h2 className="text-white font-semibold">Connection Status</h2>
            </div>

            {!primarySmtp ? (
              <div className="text-center py-8">
                <Server className="w-12 h-12 text-white/20 mx-auto mb-3" />
                <p className="text-white/40 text-sm">No configuration yet</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-white/60 text-sm">Status</span>
                  <div className={cn(
                    'flex items-center gap-2 text-sm',
                    isConnected ? 'text-emerald-400' : 'text-red-400'
                  )}>
                    <div className={cn('w-2 h-2 rounded-full', isConnected ? 'bg-emerald-400' : 'bg-red-400')} />
                    {isConnected ? 'Connected' : 'Failed'}
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-white/60 text-sm">Provider</span>
                  <span className="text-white/80 text-sm">{primarySmtp.provider || 'Custom'}</span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-white/60 text-sm">Last Verified</span>
                  <span className="text-white/80 text-sm">
                    {primarySmtp.last_tested ? new Date(primarySmtp.last_tested).toLocaleString() : 'Never'}
                  </span>
                </div>

                <div className="border-t border-white/10 pt-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-white/60 text-sm">Connection Health</span>
                    <span className={cn(
                      'text-sm font-bold',
                      healthScore >= 90 ? 'text-emerald-400' : healthScore >= 70 ? 'text-yellow-400' : 'text-red-400'
                    )}>
                      {healthScore}%
                    </span>
                  </div>
                  <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${healthScore}%` }}
                      transition={{ duration: 0.5 }}
                      className={cn(
                        'h-full rounded-full',
                        healthScore >= 90 ? 'bg-emerald-400' : healthScore >= 70 ? 'bg-yellow-400' : 'bg-red-400'
                      )}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-white/60 text-sm">Emails Sent</span>
                  <span className="text-white/80 text-sm">{primarySmtp.emails_sent || 0}</span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-white/60 text-sm">Success Rate</span>
                  <span className="text-emerald-400 text-sm">
                    {primarySmtp.emails_sent > 0
                      ? Math.round(((primarySmtp.emails_sent - (primarySmtp.emails_failed || 0)) / primarySmtp.emails_sent) * 100)
                      : 100}%
                  </span>
                </div>
              </div>
            )}
          </motion.div>

          {/* Email Analytics */}
          {primarySmtp && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="glass rounded-2xl border border-white/10 p-6"
            >
              <h3 className="text-white font-medium mb-4 flex items-center gap-2">
                <Mail className="w-4 h-4 text-indigo-400" />
                Email Analytics
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="glass rounded-xl border border-white/10 p-3 text-center">
                  <p className="text-2xl font-bold text-white">{primarySmtp.emails_sent || 0}</p>
                  <p className="text-xs text-white/40 mt-1">Sent</p>
                </div>
                <div className="glass rounded-xl border border-white/10 p-3 text-center">
                  <p className="text-2xl font-bold text-emerald-400">{primarySmtp.emails_sent - (primarySmtp.emails_failed || 0)}</p>
                  <p className="text-xs text-white/40 mt-1">Success</p>
                </div>
                <div className="glass rounded-xl border border-white/10 p-3 text-center">
                  <p className="text-2xl font-bold text-red-400">{primarySmtp.emails_failed || 0}</p>
                  <p className="text-xs text-white/40 mt-1">Failed</p>
                </div>
                <div className="glass rounded-xl border border-white/10 p-3 text-center">
                  <p className="text-2xl font-bold text-white">{primarySmtp.emails_sent || 0}</p>
                  <p className="text-xs text-white/40 mt-1">Attachments</p>
                </div>
              </div>
            </motion.div>
          )}

          {/* Connection Logs */}
          {logs && logs.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="glass rounded-2xl border border-white/10 p-6"
            >
              <h3 className="text-white font-medium mb-4 flex items-center gap-2">
                <Clock className="w-4 h-4 text-indigo-400" />
                Connection Logs
              </h3>
              <div className="space-y-3">
                {logs.slice(0, 10).map((log: any) => (
                  <div key={log.id} className="flex items-start gap-3 text-sm">
                    <div className={cn(
                      'w-2 h-2 rounded-full mt-1.5 shrink-0',
                      log.status === 'success' ? 'bg-emerald-400' : 'bg-red-400'
                    )} />
                    <div className="flex-1 min-w-0">
                      <p className="text-white/80">{log.message}</p>
                      <p className="text-white/40 text-xs mt-0.5">
                        {new Date(log.created_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </div>
      </div>

      {/* Test Email Modal */}
      <AnimatePresence>
        {showTestEmail && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-6"
            style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
            onClick={() => setShowTestEmail(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="glass rounded-2xl border border-white/15 p-6 max-w-md w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
                <Send className="w-4 h-4 text-indigo-400" />
                Send Test Email
              </h3>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs text-white/40 uppercase tracking-wider">Send To</label>
                  <input
                    type="email"
                    value={testEmail}
                    onChange={(e) => setTestEmail(e.target.value)}
                    placeholder="someone@gmail.com"
                    className="w-full glass rounded-xl px-3 py-2.5 text-sm text-white/70 placeholder:text-white/25 border border-white/10 focus:border-indigo-500/40 focus:outline-none"
                  />
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => sendTestMutation.mutate()}
                    disabled={sendTestMutation.isPending || !testEmail}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-500/20 border border-indigo-500/30 text-sm text-indigo-400 hover:bg-indigo-500/30 transition-all disabled:opacity-50"
                  >
                    {sendTestMutation.isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    {sendTestMutation.isPending ? 'Sending...' : 'Send'}
                  </button>
                  <button
                    onClick={() => setShowTestEmail(false)}
                    className="flex-1 px-4 py-2.5 rounded-xl glass border border-white/10 text-white/60 text-sm hover:text-white transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

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
                <Eye className="w-4 h-4 text-indigo-400" />
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
