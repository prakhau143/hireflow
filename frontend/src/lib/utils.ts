import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(date: string | Date) {
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(date))
}

export function formatTime(date: string | Date) {
  return new Intl.DateTimeFormat('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(date))
}

export function getMatchColor(score: number) {
  if (score >= 90) return 'text-emerald-400'
  if (score >= 80) return 'text-blue-400'
  if (score >= 70) return 'text-yellow-400'
  return 'text-red-400'
}

export function getMatchBg(score: number) {
  if (score >= 90) return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
  if (score >= 80) return 'bg-blue-500/20 text-blue-400 border-blue-500/30'
  if (score >= 70) return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
  return 'bg-red-500/20 text-red-400 border-red-500/30'
}

export function getMatchRingColor(score: number) {
  if (score >= 90) return '#10b981'
  if (score >= 80) return '#3b82f6'
  if (score >= 70) return '#f59e0b'
  return '#ef4444'
}

export function truncate(str: string, len: number) {
  return str.length > len ? str.slice(0, len) + '...' : str
}

export function timeAgo(date: string | Date) {
  const now = new Date()
  const past = new Date(date)
  const diffMs = now.getTime() - past.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return formatDate(date)
}
