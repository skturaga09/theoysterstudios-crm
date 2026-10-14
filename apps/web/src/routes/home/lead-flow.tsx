/**
 * Lead Flow — Sankey from channel (left) to current stage (right), drawn on <canvas>.
 * Hover a channel or stage to light its ribbons in signal; everything else drops to 4%.
 * Particles drift along ribbons (count ∝ volume, opacity sin πt). Live arrivals fire
 * three larger particles into New. Reduced motion: static ribbons, hover still works.
 */
import { CHANNEL_LABEL, CHANNEL_MONOGRAM, CHANNELS, STAGE_LABEL, type Channel, type Stage } from "@pinnacle/shared";
import { cn, Segmented } from "@pinnacle/ui";
import { sankey, type SankeyLink, type SankeyNode } from "d3-sankey";
import { useReducedMotion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useCrm } from "../../data/store";
import type { Lead } from "../../data/types";

const STAGE_ORDER: Stage[] = ["new", "qualified", "proposal", "negotiation", "won", "lost"];
type NodeX = { id: string; kind: "channel" | "stage"; label: string; short: string; order: number };
type LinkX = { key: string; source: string; target: string; value: number };
type Laid = {
  nodes: Map<string, { x0: number; x1: number; y0: number; y1: number; value: number; node: NodeX }>;
  links: Map<string, { sx: number; tx: number; y0: number; y1: number; w: number; value: number; source: string; target: string }>;
};

const RANGE_DAYS = { "30d": 30, quarter: 90 } as const;
type Range = keyof typeof RANGE_DAYS;

function buildGraph(leads: Lead[], days: number) {
  const since = Date.now() - days * 86_400_000;
  const recent = leads.filter((l) => +new Date(l.at) >= since);
  const counts = new Map<string, number>();
  const chTotals = new Map<Channel, number>();
  for (const l of recent) {
    const k = `${l.channel}->${l.stage}`;
    counts.set(k, (counts.get(k) ?? 0) + 1);
    chTotals.set(l.channel, (chTotals.get(l.channel) ?? 0) + 1);
  }
  const channels = [...CHANNELS].filter((c) => chTotals.get(c)).sort((a, b) => (chTotals.get(b) ?? 0) - (chTotals.get(a) ?? 0));
  const stages = STAGE_ORDER.filter((s) => recent.some((l) => l.stage === s));
  const nodes: NodeX[] = [
    ...channels.map((c, i) => ({ id: c, kind: "channel" as const, label: CHANNEL_LABEL[c].replace(" Lead Ads", ""), short: CHANNEL_MONOGRAM[c], order: i })),
    ...stages.map((s, i) => ({ id: `s:${s}`, kind: "stage" as const, label: STAGE_LABEL[s], short: STAGE_LABEL[s].slice(0, 3), order: i })),
  ];
  const links: LinkX[] = [];
  for (const [k, v] of counts) {
    const [c, s] = k.split("->") as [Channel, Stage];
    links.push({ key: k, source: c, target: `s:${s}`, value: v });
  }
  return { nodes, links, recent };
}

function layout(g: ReturnType<typeof buildGraph>, w: number, h: number, padL: number, padR: number): Laid {
  const gen = sankey<NodeX, LinkX>()
    .nodeId((d) => d.id)
    .nodeWidth(6)
    .nodePadding(h < 260 ? 8 : 12)
    .nodeSort((a, b) => a.order - b.order)
    .linkSort((a, b) => (a.source as NodeX).order - (b.source as NodeX).order || (a.target as NodeX).order - (b.target as NodeX).order)
    .extent([[padL, 4], [w - padR, h - 4]]);
  const out = gen({ nodes: g.nodes.map((n) => ({ ...n })), links: g.links.map((l) => ({ ...l })) });
  const nodes: Laid["nodes"] = new Map();
  for (const n of out.nodes as SankeyNode<NodeX, LinkX>[]) nodes.set(n.id, { x0: n.x0!, x1: n.x1!, y0: n.y0!, y1: n.y1!, value: n.value ?? 0, node: n });
  const links: Laid["links"] = new Map();
  for (const l of out.links as SankeyLink<NodeX, LinkX>[]) {
    const s = l.source as SankeyNode<NodeX, LinkX>;
    const t = l.target as SankeyNode<NodeX, LinkX>;
    links.set(l.key, { sx: s.x1!, tx: t.x0!, y0: l.y0!, y1: l.y1!, w: l.width!, value: l.value, source: s.id, target: t.id });
  }
  return { nodes, links };
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
function mix(a: Laid | null, b: Laid, t: number): Laid {
  if (!a || t >= 1) return b;
  const nodes: Laid["nodes"] = new Map();
  for (const [k, n] of b.nodes) {
    const p = a.nodes.get(k);
    nodes.set(k, p ? { ...n, y0: lerp(p.y0, n.y0, t), y1: lerp(p.y1, n.y1, t) } : { ...n, y1: lerp(n.y0, n.y1, t) });
  }
  const links: Laid["links"] = new Map();
  for (const [k, l] of b.links) {
    const p = a.links.get(k);
    links.set(k, p ? { ...l, y0: lerp(p.y0, l.y0, t), y1: lerp(p.y1, l.y1, t), w: lerp(p.w, l.w, t) } : { ...l, w: l.w * t });
  }
  return { nodes, links };
}

const bez = (p0: number, p1: number, p2: number, p3: number, t: number) => {
  const u = 1 - t;
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
};

type Particle = { key: string; t: number; speed: number; off: number; big?: boolean };

function readColors() {
  const cs = getComputedStyle(document.documentElement);
  const v = (n: string) => cs.getPropertyValue(n).trim();
  return { ink: v("--ink"), ok: v("--ok"), signal: v("--signal"), ink3: v("--ink-3"), line2: v("--line-2") };
}
function withAlpha(hex: string, a: number) {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

export function LeadFlow() {
  const leads = useCrm((s) => s.leads);
  const lastArrival = useCrm((s) => s.lastArrival);
  const [range, setRange] = useState<Range>("30d");
  const [hover, setHover] = useState<string | null>(null);
  const [width, setWidth] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reduce = useReducedMotion();

  const height = width < 520 ? 240 : 300;
  const compact = width < 560;
  const tiny = width > 0 && width < 400;
  const padL = compact ? 40 : 112;
  const padR = compact ? 44 : 112;

  const graph = useMemo(() => buildGraph(leads, RANGE_DAYS[range]), [leads, range]);
  const laid = useMemo(() => (width ? layout(graph, width, height, padL, padR) : null), [graph, width, height, padL, padR]);

  /* refs the animation loop reads without re-subscribing */
  const state = useRef({ prev: null as Laid | null, cur: null as Laid | null, tweenStart: 0, hover: null as string | null, particles: [] as Particle[], colors: null as ReturnType<typeof readColors> | null, visible: true });
  state.current.hover = hover;

  useEffect(() => {
    if (!laid) return;
    const st = state.current;
    st.prev = st.cur ? mix(st.prev, st.cur, Math.min(1, (performance.now() - st.tweenStart) / 300)) : null;
    st.cur = laid;
    st.tweenStart = performance.now();
    // particles proportional to volume
    const ps: Particle[] = [];
    for (const [key, l] of laid.links) {
      const n = Math.max(1, Math.round(l.value / 3));
      for (let i = 0; i < n; i++) ps.push({ key, t: Math.random(), speed: 0.00014 + Math.random() * 0.00014, off: Math.random() - 0.5 });
    }
    st.particles = ps;
  }, [laid]);

  /* live burst */
  useEffect(() => {
    if (!lastArrival || !state.current.cur) return;
    const key = `${lastArrival.channel}->new`;
    for (let i = 0; i < 3; i++) state.current.particles.push({ key, t: -i * 0.08, speed: 0.0011, off: (i - 1) * 0.25, big: true });
  }, [lastArrival]);

  /* size + theme + visibility */
  useEffect(() => {
    const el = wrapRef.current!;
    const ro = new ResizeObserver(([e]) => setWidth(Math.floor(e!.contentRect.width)));
    ro.observe(el);
    const io = new IntersectionObserver(([e]) => (state.current.visible = !!e?.isIntersecting));
    io.observe(el);
    const refresh = () => (state.current.colors = readColors());
    refresh();
    const mo = new MutationObserver(refresh);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    const mq = matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", refresh);
    return () => {
      ro.disconnect();
      io.disconnect();
      mo.disconnect();
      mq.removeEventListener("change", refresh);
    };
  }, []);

  /* draw loop */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !width || tiny) return;
    const ctx = canvas.getContext("2d")!;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    let raf = 0;
    let last = performance.now();

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const st = state.current;
      if (!st.cur || !st.colors) return;
      if (!st.visible || document.hidden) {
        last = now;
        return;
      }
      const dt = Math.min(48, now - last);
      last = now;
      const t = reduce ? 1 : Math.min(1, (now - st.tweenStart) / 300);
      const L = mix(st.prev, st.cur, t);
      const c = st.colors;
      const h = st.hover;
      const isLit = (src: string, tgt: string) => !h || h === src || h === tgt;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      // ribbons
      for (const l of L.links.values()) {
        const lit = isLit(l.source, l.target);
        const won = l.target === "s:won";
        const mid = (l.sx + l.tx) / 2;
        ctx.beginPath();
        ctx.moveTo(l.sx, l.y0);
        ctx.bezierCurveTo(mid, l.y0, mid, l.y1, l.tx, l.y1);
        ctx.lineWidth = Math.max(1, l.w);
        ctx.strokeStyle = h
          ? lit
            ? withAlpha(c.signal, 0.42)
            : withAlpha(c.ink, 0.04)
          : won
            ? withAlpha(c.ok, 0.22)
            : withAlpha(c.ink, 0.12);
        ctx.stroke();
      }
      // nodes
      for (const [id, n] of L.nodes) {
        const lit = !h || h === id || [...L.links.values()].some((l) => (l.source === h && l.target === id) || (l.target === h && l.source === id));
        ctx.fillStyle = id === "s:won" ? c.ok : id === "s:lost" ? withAlpha(c.ink3, 0.6) : lit && h ? c.signal : c.ink;
        ctx.globalAlpha = lit ? 1 : 0.25;
        ctx.fillRect(n.x0, n.y0, n.x1 - n.x0, Math.max(1, n.y1 - n.y0));
        ctx.globalAlpha = 1;
      }
      // particles
      if (!reduce) {
        for (const p of st.particles) {
          p.t += p.speed * dt;
          const l = L.links.get(p.key);
          if (!l) continue;
          if (p.t > 1) {
            if (p.big) {
              p.t = 2;
              continue;
            }
            p.t -= 1;
          }
          if (p.t < 0) continue;
          const mid = (l.sx + l.tx) / 2;
          const x = bez(l.sx, mid, mid, l.tx, p.t);
          const y = bez(l.y0, l.y0, l.y1, l.y1, p.t) + p.off * Math.max(0, l.w - 2);
          const a = Math.sin(Math.PI * p.t);
          const lit = isLit(l.source, l.target);
          ctx.beginPath();
          ctx.arc(x, y, p.big ? 3.2 : 1.4, 0, Math.PI * 2);
          ctx.fillStyle = p.big ? withAlpha(c.signal, a) : h && lit ? withAlpha(c.signal, a * 0.9) : withAlpha(c.ink, a * (h ? 0.08 : 0.45));
          ctx.fill();
        }
        st.particles = st.particles.filter((p) => p.t <= 1.5);
      }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [width, height, reduce, tiny]);

  /* legend copy */
  const legend = useMemo(() => {
    const r = graph.recent;
    const won = (xs: Lead[]) => xs.filter((l) => l.stage === "won").length;
    const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
    if (!hover) {
      const w = won(r);
      return `${range === "30d" ? "Last 30 days" : "Last quarter"} · ${r.length} leads · Won ${w} (${pct(w, r.length)}%)`;
    }
    if (hover.startsWith("s:")) {
      const s = hover.slice(2) as Stage;
      const xs = r.filter((l) => l.stage === s);
      const by = new Map<Channel, number>();
      xs.forEach((l) => by.set(l.channel, (by.get(l.channel) ?? 0) + 1));
      const top = [...by.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([c, n]) => `${CHANNEL_LABEL[c].replace(" Lead Ads", "")} ${n}`);
      return `${STAGE_LABEL[s]} · ${xs.length} leads · from ${top.join(", ")}`;
    }
    const xs = r.filter((l) => l.channel === hover);
    const w = won(xs);
    return `${CHANNEL_LABEL[hover as Channel].replace(" Lead Ads", "")} · ${xs.length} leads · Won ${w} (${pct(w, xs.length)}%) · Still in New ${xs.filter((l) => l.stage === "new").length}`;
  }, [hover, graph, range]);

  const matrix = useMemo(() => {
    const stages = STAGE_ORDER;
    return graph.nodes
      .filter((n) => n.kind === "channel")
      .map((n) => ({ label: n.label, cells: stages.map((s) => graph.links.find((l) => l.key === `${n.id}->${s}`)?.value ?? 0) }));
  }, [graph]);

  return (
    <section aria-labelledby="leadflow-h" className="flex min-w-0 flex-col">
      <header className="mb-4 flex flex-wrap items-center gap-3">
        <h2 id="leadflow-h" className="t-eyebrow m-0 text-ink-2">Lead flow</h2>
        <span className="t-meta text-ink-3">Channel → current stage</span>
        <Segmented
          className="ml-auto"
          label="Range"
          value={range}
          onChange={setRange}
          options={[
            { value: "30d", label: "30 days" },
            { value: "quarter", label: "Quarter" },
          ]}
        />
      </header>

      <div ref={wrapRef} className="relative w-full" style={{ height: tiny ? "auto" : height }} onMouseLeave={() => setHover(null)}>
        {tiny ? (
          <StackedBars graph={graph} hover={hover} setHover={setHover} />
        ) : (
          <>
            <canvas
              ref={canvasRef}
              role="img"
              aria-label={`Lead flow. ${legend}.`}
              style={{ width, height }}
              className="block"
            />
            {laid &&
              [...laid.nodes.entries()].map(([id, n]) => {
                const left = n.node.kind === "channel";
                const lit = !hover || hover === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onMouseEnter={() => setHover(id)}
                    onFocus={() => setHover(id)}
                    onBlur={() => setHover(null)}
                    className={cn(
                      "absolute flex items-center gap-1.5 rounded-[4px] px-1 text-[12px] whitespace-nowrap transition-colors duration-150",
                      left ? "flex-row-reverse text-right" : "text-left",
                      lit ? "text-ink" : "text-ink-3",
                    )}
                    style={{
                      top: (n.y0 + n.y1) / 2,
                      transform: "translateY(-50%)",
                      ...(left ? { right: width - n.x0 + 6 } : { left: n.x1 + 6 }),
                    }}
                    aria-label={`${n.node.label}: ${Math.round(n.value)} leads`}
                  >
                    <span className="font-mono text-[11px] text-ink-3 tnum">{Math.round(n.value)}</span>
                    <span className={cn(compact && "font-mono text-[10.5px] tracking-[0.04em]")}>{compact ? n.node.short : n.node.label}</span>
                  </button>
                );
              })}
          </>
        )}
      </div>

      <p aria-live="polite" className="m-0 mt-3 border-t border-line pt-3 font-mono text-[11.5px] text-ink-2 tnum">
        {legend}
      </p>

      <table className="sr-only">
        <caption>Leads by channel and current stage</caption>
        <thead>
          <tr>
            <th>Channel</th>
            {STAGE_ORDER.map((s) => <th key={s}>{STAGE_LABEL[s]}</th>)}
          </tr>
        </thead>
        <tbody>
          {matrix.map((r) => (
            <tr key={r.label}>
              <th>{r.label}</th>
              {r.cells.map((v, i) => <td key={i}>{v}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

/** < 400px: stacked horizontal bar per channel instead of the Sankey. */
function StackedBars({ graph, hover, setHover }: { graph: ReturnType<typeof buildGraph>; hover: string | null; setHover: (s: string | null) => void }) {
  const rows = graph.nodes.filter((n) => n.kind === "channel");
  const max = Math.max(...rows.map((r) => graph.links.filter((l) => l.source === r.id).reduce((a, l) => a + l.value, 0)), 1);
  const tone: Record<Stage, string> = { new: "bg-signal", qualified: "bg-ink/70", proposal: "bg-ink/50", negotiation: "bg-ink/35", won: "bg-ok", lost: "bg-line-2" };
  return (
    <ul className="m-0 flex list-none flex-col gap-2 p-0">
      {rows.map((r) => {
        const ls = graph.links.filter((l) => l.source === r.id);
        const total = ls.reduce((a, l) => a + l.value, 0);
        return (
          <li key={r.id}>
            <button type="button" onClick={() => setHover(hover === r.id ? null : r.id)} className="flex w-full items-center gap-2 text-left">
              <span className="w-9 font-mono text-[10.5px] text-ink-2">{r.short}</span>
              <span className="flex h-3 overflow-hidden rounded-[2px]" style={{ width: `${(total / max) * 100}%` }}>
                {STAGE_ORDER.map((s) => {
                  const v = ls.find((l) => l.target === `s:${s}`)?.value ?? 0;
                  return v ? <span key={s} className={tone[s]} style={{ width: `${(v / total) * 100}%` }} /> : null;
                })}
              </span>
              <span className="font-mono text-[10.5px] text-ink-3">{total}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
