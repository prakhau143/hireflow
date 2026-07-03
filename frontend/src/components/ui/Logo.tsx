import { cn } from '@/lib/utils'

interface LogoProps {
  size?: number
  showText?: boolean
  className?: string
  theme?: 'dark' | 'light' | 'mono'
}

export default function Logo({ size = 32, showText = true, className, theme = 'dark' }: LogoProps) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <svg width={size} height={size} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="logoBg" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor={theme === 'mono' ? '#555' : '#4F46E5'} />
            <stop offset="100%" stopColor={theme === 'mono' ? '#999' : '#06B6D4'} />
          </linearGradient>
          <linearGradient id="logoGlow" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="rgba(255,255,255,0.25)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0.05)" />
          </linearGradient>
        </defs>
        {/* Background */}
        <rect width="40" height="40" rx="10" fill="url(#logoBg)" />
        <rect x="0.5" y="0.5" width="39" height="39" rx="9.5" stroke="url(#logoGlow)" strokeWidth="1" />
        {/* Left pillar */}
        <rect x="6.5" y="8" width="6" height="24" rx="2" fill="white" opacity="0.95" />
        {/* Right pillar */}
        <rect x="27.5" y="8" width="6" height="24" rx="2" fill="white" opacity="0.95" />
        {/* Neural dots on right pillar */}
        <circle cx="30.5" cy="12" r="1.8" fill={theme === 'mono' ? '#333' : '#4338CA'} />
        <circle cx="30.5" cy="20" r="1.8" fill={theme === 'mono' ? '#333' : '#3B82F6'} opacity="0.8" />
        <circle cx="30.5" cy="28" r="1.8" fill={theme === 'mono' ? '#333' : '#06B6D4'} opacity="0.6" />
        {/* H crossbar as upward growth arrow */}
        <path
          d="M12.5 22 L20 13 L27.5 22"
          stroke="white"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
          opacity="0.95"
        />
      </svg>

      {showText && (
        <div className="flex items-baseline gap-1">
          <span
            className={cn(
              'font-bold tracking-tight',
              theme === 'light' ? 'text-gray-900' : 'text-white'
            )}
            style={{ fontSize: size * 0.45 }}
          >
            HireFlow
          </span>
          <span
            className="font-semibold"
            style={{
              fontSize: size * 0.3,
              color: theme === 'mono' ? '#666' : '#06B6D4',
            }}
          >
            AI
          </span>
        </div>
      )}
    </div>
  )
}
