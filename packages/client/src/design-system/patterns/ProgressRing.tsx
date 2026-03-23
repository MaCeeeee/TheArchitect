interface ProgressRingProps {
  value: number;       // 0-100
  size?: number;       // px
  strokeWidth?: number;
  color?: string;
  trackColor?: string;
  label?: string;
  className?: string;
  children?: React.ReactNode;
}

export default function ProgressRing({
  value,
  size = 48,
  strokeWidth = 4,
  color = 'var(--accent-default)',
  trackColor = 'var(--border-subtle)',
  label,
  className = '',
  children,
}: ProgressRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.min(100, Math.max(0, value)) / 100) * circumference;

  return (
    <div className={`relative inline-flex items-center justify-center ${className}`} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={trackColor}
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-500 ease-out"
        />
      </svg>
      <span className="absolute text-[10px] font-bold text-white">
        {children ?? label ?? Math.round(value)}
      </span>
    </div>
  );
}
