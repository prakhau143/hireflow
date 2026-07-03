import { useState } from 'react'
import { motion } from 'framer-motion'
import { FileCode2, Plus, Edit3, Trash2, Copy, Tag } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { cn } from '@/lib/utils'
import { EmptyState, LoadingCards } from '@/components/ui/EmptyState'
import api from '@/lib/api'
import toast from 'react-hot-toast'
import type { EmailTemplate } from '@/types'

const CATEGORIES = ['All', 'Python', 'Java', 'Backend', 'Frontend', 'Data Science', 'DevOps']

const categoryColors: Record<string, string> = {
  Python: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
  Java: 'text-orange-400 bg-orange-500/10 border-orange-500/20',
  Backend: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
  Frontend: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
  'Data Science': 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  DevOps: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20',
}

export default function Templates() {
  const qc = useQueryClient()
  const [activeCategory, setActiveCategory] = useState('All')
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newSubject, setNewSubject] = useState('')
  const [newBody, setNewBody] = useState('')
  const [newCategory, setNewCategory] = useState('Backend')

  const { data: templates, isLoading } = useQuery<EmailTemplate[]>({
    queryKey: ['templates'],
    queryFn: async () => {
      const { data } = await api.get('/api/templates/')
      return data
    },
  })

  const createMutation = useMutation({
    mutationFn: () => api.post('/api/templates/', {
      name: newName,
      subject: newSubject,
      body: newBody,
      category: newCategory,
    }),
    onSuccess: () => {
      toast.success('Template created!')
      qc.invalidateQueries({ queryKey: ['templates'] })
      setCreating(false)
      setNewName(''); setNewSubject(''); setNewBody('')
    },
    onError: () => toast.error('Failed to create template'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/templates/${id}`),
    onSuccess: () => {
      toast.success('Template deleted')
      qc.invalidateQueries({ queryKey: ['templates'] })
    },
  })

  const copyMutation = useMutation({
    mutationFn: async (template: EmailTemplate) =>
      api.post('/api/templates/', {
        name: `${template.name} (Copy)`,
        subject: template.subject,
        body: template.body,
        category: template.category,
      }),
    onSuccess: () => {
      toast.success('Template duplicated')
      qc.invalidateQueries({ queryKey: ['templates'] })
    },
  })

  const filtered = (templates ?? []).filter(
    (t) => activeCategory === 'All' || t.category === activeCategory
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Templates</h1>
          <p className="text-white/40 text-sm mt-0.5">Email templates for different job categories</p>
        </div>
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={() => setCreating(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-500/20 border border-indigo-500/30 text-indigo-400 text-sm hover:bg-indigo-500/30 transition-all"
        >
          <Plus className="w-4 h-4" />
          New Template
        </motion.button>
      </div>

      {/* Category Pills */}
      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={cn(
              'text-sm px-3 py-1.5 rounded-xl border transition-all',
              activeCategory === cat
                ? 'bg-indigo-500/25 border-indigo-500/40 text-indigo-300'
                : 'glass border-white/10 text-white/50 hover:text-white/70 hover:border-white/20'
            )}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* New Template Form */}
      {creating && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass rounded-2xl border border-indigo-500/30 p-5 space-y-3"
        >
          <h3 className="text-white font-medium text-sm">New Template</h3>
          <div className="grid grid-cols-2 gap-3">
            <input
              placeholder="Template name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="glass rounded-xl px-3 py-2 text-sm text-white placeholder:text-white/30 border border-white/10 focus:border-indigo-500/40 outline-none col-span-1"
            />
            <select
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              className="glass rounded-xl px-3 py-2 text-sm text-white border border-white/10 focus:border-indigo-500/40 outline-none bg-transparent"
            >
              {CATEGORIES.filter((c) => c !== 'All').map((c) => (
                <option key={c} value={c} style={{ background: '#0f1428' }}>{c}</option>
              ))}
            </select>
          </div>
          <input
            placeholder="Subject line (use {role}, {company}, {name})"
            value={newSubject}
            onChange={(e) => setNewSubject(e.target.value)}
            className="w-full glass rounded-xl px-3 py-2 text-sm text-white placeholder:text-white/30 border border-white/10 focus:border-indigo-500/40 outline-none"
          />
          <textarea
            placeholder="Email body..."
            value={newBody}
            onChange={(e) => setNewBody(e.target.value)}
            rows={4}
            className="w-full glass rounded-xl px-3 py-2 text-sm text-white placeholder:text-white/30 border border-white/10 focus:border-indigo-500/40 outline-none resize-none"
          />
          <div className="flex gap-2 justify-end">
            <button onClick={() => setCreating(false)} className="px-4 py-2 rounded-xl glass border border-white/10 text-sm text-white/60 hover:text-white transition-colors">
              Cancel
            </button>
            <button
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending || !newName || !newSubject || !newBody}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors disabled:opacity-60"
            >
              {createMutation.isPending ? 'Saving...' : 'Save Template'}
            </button>
          </div>
        </motion.div>
      )}

      {/* Template Cards */}
      {isLoading ? (
        <LoadingCards count={3} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={FileCode2}
          title="No templates yet"
          description="Create email templates to quickly send applications. Use {role}, {company}, and {name} as placeholders."
          action={
            <button
              onClick={() => setCreating(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm hover:bg-indigo-500 transition-colors"
            >
              <Plus className="w-4 h-4" /> Create First Template
            </button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((template, i) => (
            <motion.div
              key={template.id}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
              className="glass rounded-2xl border border-white/10 hover:border-white/20 transition-all p-5 space-y-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <FileCode2 className="w-4 h-4 text-indigo-400 shrink-0" />
                  <h3 className="text-white font-medium text-sm truncate">{template.name}</h3>
                </div>
                <span className={cn('text-xs px-2 py-0.5 rounded-full border shrink-0', categoryColors[template.category] ?? 'text-white/50 bg-white/5 border-white/10')}>
                  <Tag className="w-3 h-3 inline mr-1" />
                  {template.category}
                </span>
              </div>

              <div className="space-y-1.5">
                <p className="text-xs text-white/40">Subject:</p>
                <p className="text-sm text-white/70">{template.subject}</p>
              </div>

              <div className="p-3 rounded-xl bg-white/3 border border-white/5">
                <p className="text-xs text-white/40 line-clamp-3 leading-relaxed">{template.body}</p>
              </div>

              <div className="flex gap-2 pt-1">
                <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg glass border border-white/10 text-xs text-white/50 hover:text-white hover:border-white/20 transition-all">
                  <Edit3 className="w-3.5 h-3.5" />
                  Edit
                </button>
                <button
                  onClick={() => copyMutation.mutate(template)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg glass border border-white/10 text-xs text-white/50 hover:text-white hover:border-white/20 transition-all"
                >
                  <Copy className="w-3.5 h-3.5" />
                  Duplicate
                </button>
                <button
                  onClick={() => deleteMutation.mutate(template.id)}
                  className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg glass border border-white/10 text-xs text-white/30 hover:text-red-400 hover:border-red-500/20 transition-all"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  )
}
