// Shared styling for all Recharts visualizations — adapts to the active theme

// Fixed categorical palette for distinguishing multiple series — intentionally
// literal (not theme tokens), since these encode "series 1 vs series 2", not
// a themeable surface/text role.
export const CHART_COLORS = [
  '#818cf8', // indigo
  '#34d399', // emerald
  '#22d3ee', // cyan
  '#c084fc', // purple
  '#fbbf24', // amber
  '#f87171', // red
  '#60a5fa', // blue
  '#f472b6', // pink
]

export const axisTick = { fill: 'var(--muted-foreground)', fontSize: 10 }
export const gridStroke = 'var(--border)'

export function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="glass rounded-xl px-3 py-2 border border-border shadow-xl text-xs backdrop-blur-xl">
      {label != null && <p className="text-muted-foreground mb-1.5 font-medium">{label}</p>}
      <div className="space-y-1">
        {payload.map((entry: any, i: number) => (
          <div key={i} className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: entry.color || entry.payload?.fill || '#818cf8' }} />
            <span className="text-muted-foreground">{entry.name}:</span>
            <span className="text-foreground font-semibold">{entry.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
