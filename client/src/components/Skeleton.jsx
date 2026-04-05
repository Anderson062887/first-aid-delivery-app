/**
 * Skeleton loading placeholders
 * Usage:
 *   <Skeleton /> - single line
 *   <Skeleton width="60%" /> - shorter line
 *   <Skeleton height={100} /> - taller block
 *   <Skeleton.Card /> - card placeholder
 *   <Skeleton.Table rows={5} /> - table placeholder
 */

const baseStyle = {
  background: 'linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%)',
  backgroundSize: '200% 100%',
  animation: 'shimmer 1.5s infinite',
  borderRadius: 4,
};

export default function Skeleton({ width = '100%', height = 16, style = {} }) {
  return (
    <>
      <style>{`
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
      <div style={{ ...baseStyle, width, height, ...style }} />
    </>
  );
}

// Card skeleton with title and content lines
Skeleton.Card = function SkeletonCard({ lines = 3 }) {
  return (
    <div className="card" style={{ display: 'grid', gap: 12 }}>
      <Skeleton width="40%" height={20} />
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} width={i === lines - 1 ? '70%' : '100%'} height={14} />
      ))}
    </div>
  );
};

// Table skeleton with header and rows
Skeleton.Table = function SkeletonTable({ rows = 5, cols = 4 }) {
  return (
    <div className="card" style={{ display: 'grid', gap: 8 }}>
      {/* Header */}
      <div style={{ display: 'flex', gap: 12, paddingBottom: 8, borderBottom: '1px solid #eee' }}>
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} width={`${100 / cols}%`} height={16} />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, rowIdx) => (
        <div key={rowIdx} style={{ display: 'flex', gap: 12, padding: '8px 0' }}>
          {Array.from({ length: cols }).map((_, colIdx) => (
            <Skeleton key={colIdx} width={`${100 / cols}%`} height={14} />
          ))}
        </div>
      ))}
    </div>
  );
};

// List skeleton with items
Skeleton.List = function SkeletonList({ items = 3 }) {
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {Array.from({ length: items }).map((_, i) => (
        <div key={i} className="card" style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <Skeleton width={48} height={48} style={{ borderRadius: 8, flexShrink: 0 }} />
          <div style={{ flex: 1, display: 'grid', gap: 8 }}>
            <Skeleton width="60%" height={16} />
            <Skeleton width="40%" height={12} />
          </div>
        </div>
      ))}
    </div>
  );
};

// Form skeleton
Skeleton.Form = function SkeletonForm({ fields = 3 }) {
  return (
    <div className="card" style={{ display: 'grid', gap: 16 }}>
      <Skeleton width="30%" height={24} />
      {Array.from({ length: fields }).map((_, i) => (
        <div key={i} style={{ display: 'grid', gap: 6 }}>
          <Skeleton width="20%" height={12} />
          <Skeleton width="100%" height={38} style={{ borderRadius: 8 }} />
        </div>
      ))}
      <Skeleton width={120} height={40} style={{ borderRadius: 8 }} />
    </div>
  );
};
