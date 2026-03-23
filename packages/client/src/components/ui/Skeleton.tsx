export function SkeletonLine({ width = '100%', height = '12px' }: { width?: string; height?: string }) {
  return (
    <div
      className="animate-pulse rounded bg-[#1a2a1a]"
      style={{ width, height }}
    />
  );
}

export function SkeletonCard() {
  return (
    <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4 space-y-3">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 animate-pulse rounded-lg bg-[#1a2a1a]" />
        <div className="flex-1 space-y-2">
          <SkeletonLine width="60%" height="14px" />
          <SkeletonLine width="40%" height="10px" />
        </div>
      </div>
      <SkeletonLine width="80%" />
      <div className="flex gap-2">
        <SkeletonLine width="50px" height="20px" />
        <SkeletonLine width="50px" height="20px" />
      </div>
    </div>
  );
}

export function SkeletonTable({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="flex gap-3 pb-2 border-b border-[var(--border-subtle)]">
        {Array.from({ length: cols }).map((_, i) => (
          <SkeletonLine key={i} width={`${100 / cols}%`} height="10px" />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-3 py-1.5">
          {Array.from({ length: cols }).map((_, c) => (
            <SkeletonLine key={c} width={`${100 / cols}%`} height="12px" />
          ))}
        </div>
      ))}
    </div>
  );
}

export function SkeletonList({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-2 rounded-md p-2">
          <div className="h-4 w-4 animate-pulse rounded bg-[#1a2a1a]" />
          <SkeletonLine width={`${60 + Math.random() * 30}%`} height="12px" />
        </div>
      ))}
    </div>
  );
}
