import './StatCard.css'

interface StatCardProps {
  icon: string
  label: string
  value: string | number
  subtitle?: string
  trend?: {
    value: number
    label: string
    positive?: boolean
  }
  color?: 'default' | 'accent' | 'success' | 'warning' | 'info'
  onClick?: () => void
}

export function StatCard({ 
  icon, 
  label, 
  value, 
  subtitle, 
  trend, 
  color = 'default',
  onClick 
}: StatCardProps) {
  return (
    <div 
      className={`stat-card stat-card-${color} ${onClick ? 'stat-card-clickable' : ''}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      <div className="stat-card-icon">
        {icon}
      </div>
      <div className="stat-card-content">
        <span className="stat-card-label">{label}</span>
        <span className="stat-card-value">{value}</span>
        {subtitle && <span className="stat-card-subtitle">{subtitle}</span>}
        {trend && (
          <span className={`stat-card-trend ${trend.positive ? 'positive' : 'negative'}`}>
            {trend.positive ? '↑' : '↓'} {Math.abs(trend.value)}% {trend.label}
          </span>
        )}
      </div>
    </div>
  )
}

export default StatCard
