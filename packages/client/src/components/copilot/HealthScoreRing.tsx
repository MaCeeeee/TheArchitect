import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import type { HealthScore } from '@thearchitect/shared';

interface HealthScoreRingProps {
  score: HealthScore;
  size?: number;
  compact?: boolean;
}

export default function HealthScoreRing({ score, size = 64, compact = false }: HealthScoreRingProps) {
  const radius = (size - 8) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = (score.total / 100) * circumference;
  const strokeColor = score.total >= 70 ? '#00ff41' : score.total >= 40 ? '#eab308' : '#ef4444';
  const bgStroke = '#1a2a1a';

  const TrendIcon = score.trend === 'up' ? TrendingUp : score.trend === 'down' ? TrendingDown : Minus;
  const trendColor = score.trend === 'up' ? 'text-[#00ff41]' : score.trend === 'down' ? 'text-red-400' : 'text-[#4a5a4a]';

  if (compact) {
    return (
      <div className="flex items-center gap-1.5" title={`Architecture Health: ${score.total}/100`}>
        <svg width={20} height={20} className="shrink-0">
          <circle cx={10} cy={10} r={7} fill="none" stroke={bgStroke} strokeWidth={2.5} />
          <circle
            cx={10} cy={10} r={7}
            fill="none" stroke={strokeColor} strokeWidth={2.5}
            strokeDasharray={`${(score.total / 100) * 2 * Math.PI * 7} ${2 * Math.PI * 7}`}
            strokeLinecap="round"
            transform="rotate(-90 10 10)"
          />
        </svg>
        <span className="text-[10px] font-mono font-bold" style={{ color: strokeColor }}>{score.total}</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size}>
          <circle
            cx={size / 2} cy={size / 2} r={radius}
            fill="none" stroke={bgStroke} strokeWidth={4}
          />
          <circle
            cx={size / 2} cy={size / 2} r={radius}
            fill="none" stroke={strokeColor} strokeWidth={4}
            strokeDasharray={`${progress} ${circumference}`}
            strokeLinecap="round"
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            style={{ transition: 'stroke-dasharray 0.6s ease, stroke 0.3s ease' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-lg font-bold font-mono" style={{ color: strokeColor }}>{score.total}</span>
        </div>
      </div>
      <div className="flex items-center gap-1">
        <TrendIcon size={10} className={trendColor} />
        <span className={`text-[9px] ${trendColor}`}>
          {score.trendDelta !== 0 ? `${score.trendDelta > 0 ? '+' : ''}${score.trendDelta}` : 'stable'}
        </span>
      </div>
    </div>
  );
}
