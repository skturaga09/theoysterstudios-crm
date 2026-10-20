import { CHANNEL_LABEL, CHANNELS, formatCompact, formatFull, lakh } from "@pinnacle/shared";
import { Avatar, Button, Ledger, Segmented, Table, TBody, TD, TH, THead, TR, Tooltip as Tip, type LedgerCell } from "@pinnacle/ui";
import { Download } from "lucide-react";
import { useMemo, useState } from "react";
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { downloadCsv } from "../../lib/download";
import { PageHeader } from "../../components/page-header";
import { isOpen, sum } from "../../data/derive";
import { probabilityOf, runFor } from "../../data/pipeline";
import { ME_ID, REVENUE } from "../../data/seed";
import { useCrm } from "../../data/store";
import type { Invoice } from "../../data/types";
import { IS_DEMO } from "../../lib/demo";

type Range = "month" | "quarter" | "year";
const DAYS: Record<Range, number> = { month: 30, quarter: 90, year: 365 };
const MONTHS: Record<Range, number> = { month: 2, quarter: 3, year: 12 };


function ChartHead({ title, meta, onExport }: { title: string; meta?: string; onExport?: () => void }) {
  return (
    <header className="mb-4 flex items-center gap-3">
      <h2 className="t-eyebrow m-0 text-ink-2">{title}</h2>
      {meta && <span className="t-meta text-ink-3">{meta}</span>}
      {onExport && (
        <Button variant="ghost" size="sm" className="ml-auto" onClick={onExport}>
          <Download strokeWidth={1.5} /> CSV
        </Button>
      )}
    </header>
  );
}

/** Payments received per calendar month (IST), oldest first, in lakh — the shape the revenue chart uses. */
function collectedByMonth(invoices: Invoice[], months: number) {
  const key = (d: Date) => d.toLocaleString("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit" });
  const now = new Date();
  return Array.from({ length: months }, (_, k) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (months - 1 - k), 15);
    const paise = sum(invoices.flatMap((i) => i.payments).filter((p) => key(new Date(p.at)) === key(d)).map((p) => p.amountPaise));
    return { month: d.toLocaleString("en-IN", { month: "short" }), collected: paise / 1e7, target: 0 };
  });
}

export function ReportsRoute() {
  const s = useCrm();
  const [range, setRange] = useState<Range>("quarter");
  const since = Date.now() - DAYS[range] * 86_400_000;

  const leads = useMemo(() => s.leads.filter((l) => +new Date(l.at) >= since), [s.leads, since]);
  const won = s.deals.filter((d) => d.stage === "won");
  const wonInRange = won.filter((d) => d.wonAt && +new Date(d.wonAt) >= since);
  const closedLeads = leads.filter((l) => l.stage === "won" || l.stage === "lost");
  const winRate = closedLeads.length ? Math.round((leads.filter((l) => l.stage === "won").length / closedLeads.length) * 100) : 0;
  const basis = wonInRange.length ? wonInRange : won;
  const avgDeal = basis.length ? Math.round(sum(basis.map((d) => d.valuePaise)) / basis.length) : 0;
  const cycle = basis.length ? Math.round(sum(basis.map((d) => (+new Date(d.wonAt!) - +new Date(d.createdAt)) / 86_400_000)) / basis.length) : 0;
  const forecast = Math.round(sum(s.deals.filter(isOpen).map((d) => d.valuePaise * probabilityOf(s.pipelines, d))));
  // The funnel follows one pipeline: the business being viewed (photography's when viewing both).
  const run = runFor(s.pipelines, s.businessView === "all" ? undefined : s.businessView);
  const rank = (id: string) => run.findIndex((x) => x.id === id);

  // The demo's comparisons, goal and trend lines are illustrative; the live app shows only what the data supports.
  const ledger: LedgerCell[] = IS_DEMO
    ? [
        { label: "Win rate", value: winRate, unit: "%", delta: "+4 pts vs last period", deltaTone: "ok", spark: [26, 28, 27, 30, 31, 29, 33, winRate] },
        { label: "Avg deal size", paise: avgDeal, delta: `${basis.length} won ${basis.length === 1 ? "deal" : "deals"}`, deltaTone: "mute", spark: [4.8, 5.1, 5.0, 5.4, 5.2, 5.6, 5.9, avgDeal / 1e7] },
        { label: "Sales cycle", value: cycle, unit: "days", delta: "−3 days", deltaTone: "ok", spark: [31, 29, 30, 27, 26, 24, 24, cycle] },
        { label: "Forecast vs goal", paise: forecast, delta: `goal ₹70.0 L · ${Math.round((forecast / lakh(70)) * 100)}%`, deltaTone: forecast >= lakh(70) ? "ok" : "risk", spark: [40, 42, 46, 45, 50, 53, 55, forecast / 1e7] },
      ]
    : [
        { label: "Win rate", value: winRate, unit: "%", delta: `${closedLeads.length} closed ${closedLeads.length === 1 ? "lead" : "leads"}`, deltaTone: "mute" },
        { label: "Avg deal size", paise: avgDeal, delta: `${basis.length} won ${basis.length === 1 ? "deal" : "deals"}`, deltaTone: "mute" },
        { label: "Sales cycle", value: cycle, unit: "days", delta: "created → won, average", deltaTone: "mute" },
        { label: "Weighted forecast", paise: forecast, delta: "open deals × stage likelihood", deltaTone: "mute" },
      ];

  const revenue = IS_DEMO ? REVENUE.slice(-MONTHS[range]) : collectedByMonth(s.invoices, MONTHS[range]);
  const collected = sum(revenue.map((r) => r.collected));
  const target = sum(revenue.map((r) => r.target));

  const byChannel = CHANNELS.map((c) => {
    const ls = leads.filter((l) => l.channel === c);
    const w = ls.filter((l) => l.stage === "won").length;
    return { c, n: ls.length, won: w, rate: ls.length ? w / ls.length : 0 };
  })
    .filter((r) => r.n)
    .sort((a, b) => b.rate - a.rate);
  const maxRate = Math.max(...byChannel.map((r) => r.rate), 0.01);

  const funnel = run.map((st, i) => ({ st: st.id, label: st.label, n: leads.filter((l) => (l.stage !== "lost" ? rank(l.stage) >= i : i === 0)).length }));

  const reps = s.members
    .map((m) => {
      const mine = s.deals.filter((d) => d.ownerId === m.id);
      const w = mine.filter((d) => d.stage === "won");
      const l = mine.filter((d) => d.stage === "lost");
      return {
        m,
        wonValue: sum(w.map((d) => d.valuePaise)),
        wonCount: w.length,
        open: sum(mine.filter(isOpen).map((d) => d.valuePaise)),
        rate: w.length + l.length ? Math.round((w.length / (w.length + l.length)) * 100) : null,
        reply: { sr: 22, rv: 41, ak: 58, dp: 35 }[m.id] ?? null,
      };
    })
    .sort((a, b) => b.wonValue - a.wonValue);

  return (
    <div className="flex flex-col gap-12">
      <PageHeader
        eyebrow="Pipeline & revenue"
        title="Reports"
        actions={
          <Segmented
            label="Date range"
            value={range}
            onChange={setRange}
            options={[
              { value: "month", label: "30 days" },
              { value: "quarter", label: "Quarter" },
              { value: "year", label: "12 months" },
            ]}
          />
        }
      />
      <div className="-mt-12">
        <Ledger key={range} cells={ledger} />
      </div>

      <section>
        <ChartHead
          title={IS_DEMO ? "Revenue collected vs target" : "Revenue collected"}
          meta={IS_DEMO ? `${formatCompact(lakh(collected))} of ${formatCompact(lakh(target))} · ${Math.round((collected / target) * 100)}%` : `${formatCompact(lakh(collected))} received from invoice payments`}
          onExport={() => downloadCsv("revenue", [["Month", "Collected (₹)", "Target (₹)"], ...revenue.map((r) => [r.month, r.collected * 1e5, r.target * 1e5])])}
        />
        <div className="flex items-center gap-5 pb-3 text-[12px] text-ink-2">
          <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-[2px] bg-ink" /> Collected</span>
          {IS_DEMO && <span className="flex items-center gap-2"><span className="h-0 w-4 border-t-2 border-dashed border-ink-3" /> Target</span>}
        </div>
        <div className="h-[280px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={revenue} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap="28%">
              <CartesianGrid vertical={false} stroke="var(--line)" />
              <XAxis dataKey="month" tickLine={false} axisLine={{ stroke: "var(--line-2)" }} tick={{ fill: "var(--ink-3)", fontSize: 11, fontFamily: "var(--font-mono)" }} />
              <YAxis
                width={52}
                tickLine={false}
                axisLine={false}
                tick={{ fill: "var(--ink-3)", fontSize: 11, fontFamily: "var(--font-mono)" }}
                tickFormatter={(v: number) => `₹${v} L`}
              />
              <Tooltip
                cursor={{ fill: "var(--hover)" }}
                content={({ active, payload, label }) =>
                  active && payload?.length ? (
                    <div className="rounded-control bg-ink px-3 py-2 text-[12px] text-on-ink shadow-pop">
                      <div className="mb-1 font-medium">{label}</div>
                      <div className="font-mono tnum">Collected {formatFull(lakh(Number(payload[0]?.payload.collected)))}</div>
                      {IS_DEMO && <div className="font-mono text-on-ink/70 tnum">Target {formatFull(lakh(Number(payload[0]?.payload.target)))}</div>}
                    </div>
                  ) : null
                }
              />
              <Bar dataKey="collected" fill="var(--ink)" radius={[4, 4, 0, 0]} maxBarSize={36} isAnimationActive={false} />
              {IS_DEMO && <Line dataKey="target" stroke="var(--ink-3)" strokeWidth={2} strokeDasharray="4 4" dot={false} type="linear" isAnimationActive={false} />}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-12 xl:grid-cols-2">
        <section>
          <ChartHead
            title="Conversion by channel"
            meta="Leads won ÷ leads received"
            onExport={() => downloadCsv("conversion-by-channel", [["Channel", "Leads", "Won", "Win %"], ...byChannel.map((r) => [CHANNEL_LABEL[r.c], r.n, r.won, Math.round(r.rate * 100)])])}
          />
          <ul className="m-0 flex list-none flex-col gap-2.5 border-t border-line p-0 pt-4">
            {byChannel.map((r) => (
              <li key={r.c}>
                <Tip content={`${CHANNEL_LABEL[r.c]}: ${r.won} won of ${r.n} leads (${Math.round(r.rate * 100)}%)`}>
                  <div tabIndex={0} className="grid grid-cols-[112px_minmax(0,1fr)_72px] items-center gap-3 rounded-[4px] py-1 hover:bg-hover">
                    <span className="truncate text-[12.5px] text-ink-2">{CHANNEL_LABEL[r.c].replace(" Lead Ads", "")}</span>
                    <span className="h-3 rounded-r-[4px] bg-ink" style={{ width: `${Math.max(1.5, (r.rate / maxRate) * 100)}%` }} />
                    <span className="text-right font-mono text-[12px] tnum">{Math.round(r.rate * 100)}% <span className="text-ink-3">· {r.n}</span></span>
                  </div>
                </Tip>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <ChartHead
            title="Stage funnel"
            meta="Leads that reached each stage"
            onExport={() => downloadCsv("stage-funnel", [["Stage", "Leads"], ...funnel.map((f) => [f.label, f.n])])}
          />
          <ol className="m-0 flex list-none flex-col gap-1 border-t border-line p-0 pt-4">
            {funnel.map((f, i) => {
              const prev = funnel[i - 1];
              const drop = prev && prev.n ? Math.round((1 - f.n / prev.n) * 100) : null;
              return (
                <li key={f.st}>
                  {drop !== null && (
                    <div className="grid grid-cols-[112px_1fr] gap-3 py-0.5">
                      <span />
                      <span className="font-mono text-[11px] text-ink-3">↓ {drop}% drop-off</span>
                    </div>
                  )}
                  <div className="grid grid-cols-[112px_minmax(0,1fr)_48px] items-center gap-3">
                    <span className="text-[12.5px] text-ink-2">{f.label}</span>
                    <span className={f.st === "won" ? "h-5 rounded-r-[4px] bg-ok" : "h-5 rounded-r-[4px] bg-ink"} style={{ width: `${Math.max(1.5, (f.n / (funnel[0]!.n || 1)) * 100)}%`, opacity: f.st === "won" ? 1 : 1 - i * 0.14 }} />
                    <span className="text-right font-mono text-[12px] tnum">{f.n}</span>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      </div>

      <section>
        <ChartHead
          title="Rep leaderboard"
          meta="All time · won value"
          onExport={() => downloadCsv("leaderboard", [["Rep", "Won (₹)", "Won deals", "Open (₹)", "Win %", "Median first reply (min)"], ...reps.map((r) => [r.m.name, r.wonValue / 100, r.wonCount, r.open / 100, r.rate ?? "", r.reply ?? ""])])}
        />
        <Table className="border-t border-line">
          <THead>
            <tr>
              <TH>Rep</TH>
              <TH align="right">Won</TH>
              <TH align="right">Deals</TH>
              <TH align="right">Open pipeline</TH>
              <TH align="right">Win rate</TH>
              <TH align="right" className="hidden sm:table-cell">First reply</TH>
            </tr>
          </THead>
          <TBody>
            {reps.map((r) => (
              <TR key={r.m.id} interactive={false}>
                <TD><span className="flex items-center gap-2.5"><Avatar name={r.m.name} me={r.m.id === ME_ID} /> {r.m.name}</span></TD>
                <TD align="right" numeric>{formatCompact(r.wonValue)}</TD>
                <TD align="right" numeric>{r.wonCount}</TD>
                <TD align="right" numeric className="text-ink-2">{formatCompact(r.open)}</TD>
                <TD align="right" numeric>{r.rate === null ? "—" : `${r.rate}%`}</TD>
                <TD align="right" numeric className="hidden text-ink-2 sm:table-cell">{r.reply} min</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </section>
    </div>
  );
}
