/** 72×22 line. Last point is a signal dot. */
export function Sparkline({ data, width = 72, height = 22 }: { data: number[]; width?: number; height?: number }) {
  if (data.length < 2) return null;
  const pad = 3;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const rng = max - min || 1;
  const step = (width - pad * 2) / (data.length - 1);
  const pts = data.map((d, i) => [pad + i * step, height - pad - ((d - min) / rng) * (height - pad * 2)] as const);
  const path = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const last = pts[pts.length - 1]!;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden className="block shrink-0">
      <path d={path} fill="none" stroke="var(--ink-3)" strokeWidth={1.25} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r={2.5} fill="var(--signal)" />
    </svg>
  );
}
