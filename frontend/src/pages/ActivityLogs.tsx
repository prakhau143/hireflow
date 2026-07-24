import { motion } from 'framer-motion'
import { Activity, Import, Zap, FileText, Send, AlertTriangle, CheckCircle } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { formatTime, formatDate } from '@/lib/utils'
import { LoadingRows, EmptyState } from '@/components/ui/EmptyState'
import api from '@/lib/api'
import type { ActivityLog } from '@/types'

const iconMap: Record<string, { icon: any; color: string }> = {
  'Jobs Imported': { icon: Import, color: 'text-blue-400 bg-blue-500/15' },
  'Groq Analysis': { icon: Zap, color: 'text-purple-400 bg-purple-500/15' },
  'Resume': { icon: FileText, color: 'text-cyan-400 bg-cyan-500/15' },
  'Application': { icon: Send, color: 'text-emerald-400 bg-emerald-500/15' },
  'Duplicate': { icon: AlertTriangle, color: 'text-yellow-400 bg-yellow-500/15' },
  'SMTP': { icon: CheckCircle, color: 'text-emerald-400 bg-emerald-500/15' },
}

function getIconConfig(action: string) {
  for (const [key, val] of Object.entries(iconMap)) {
    if (action.includes(key)) return val
  }
  return { icon: Activity, color: 'text-muted-foreground bg-foreground/10' }
}

export default function ActivityLogs() {
  const { data: logs, isLoading, isError } = useQuery<ActivityLog[]>({
    queryKey: ['activity-logs'],
    queryFn: async () => {
      const { data } = await api.get('/api/logs/')
      return data
    },
  })

  const grouped = (logs ?? []).reduce<Record<string, ActivityLog[]>>((acc, log) => {
    const date = formatDate(log.created_at)
    if (!acc[date]) acc[date] = []
    acc[date].push(log)
    return acc
  }, {})

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Activity Logs</h1>
        <p className="text-muted-foreground text-sm mt-0.5">Timeline of all your HireFlow activity</p>
      </div>

      {isLoading ? (
        <LoadingRows count={5} />
      ) : isError ? (
        <EmptyState icon={Activity} title="Failed to load logs" description="Could not connect to the server." />
      ) : !logs?.length ? (
        <EmptyState
          icon={Activity}
          title="No activity yet"
          description="Every action you take — importing jobs, uploading resumes, testing SMTP — will appear here."
        />
      ) : (
        Object.entries(grouped).map(([date, dayLogs]) => (
          <div key={date}>
            <div className="flex items-center gap-3 mb-4">
              <div className="h-px flex-1 bg-border" />
              <span className="text-xs text-muted-foreground font-medium px-2">{date}</span>
              <div className="h-px flex-1 bg-border" />
            </div>

            <div className="relative pl-8">
              <div className="absolute left-3.5 top-0 bottom-0 w-px bg-border" />

              <div className="space-y-4">
                {dayLogs.map((log, i) => {
                  const { icon: Icon, color } = getIconConfig(log.action)
                  return (
                    <motion.div
                      key={log.id}
                      initial={{ opacity: 0, x: -15 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.06 }}
                      className="relative flex gap-4"
                    >
                      <div className={`absolute -left-8 w-7 h-7 rounded-full flex items-center justify-center ${color.split(' ')[1]}`}>
                        <Icon className={`w-3.5 h-3.5 ${color.split(' ')[0]}`} />
                      </div>

                      <div className="flex-1 glass rounded-xl border border-border p-4 hover:border-accent/30 transition-all">
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-foreground/85 font-medium text-sm">{log.action}</p>
                          <span className="text-xs text-muted-foreground shrink-0">{formatTime(log.created_at)}</span>
                        </div>
                        {log.description && (
                          <p className="text-muted-foreground text-xs mt-1.5 leading-relaxed">{log.description}</p>
                        )}
                      </div>
                    </motion.div>
                  )
                })}
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  )
}
