import { adReturn, bySource, CHANNEL_LABEL, formatCompact, formatFull, lostReasons, seasons } from "@pinnacle/shared";
import { Button, ChannelChip, Table, TBody, TD, TH, THead, TR } from "@pinnacle/ui";
import { Download } from "lucide-react";
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useAccess, useCrm } from "../../data/store";
import { downloadCsv } from "../../lib/download";

const monthLabel = (m: string) => new Date(`${m}-01T12:00:00Z`).toLocaleDateString("en-IN", { month: "short", year: "2-digit" });

function Head({ title, meta, onExport }: { title: string; meta?: string; onExport?: () => void }) {
  return (
    <header className="mb-3 flex flex-wrap items-center gap-3">
      <h2 className="t-eyebrow m-0 text-ink-2">{title}</h2>
      {meta && <span className="t-meta text-ink-3">{meta}</span>}
      {onExport && <Button variant="ghost" size="sm" className="ml-auto" onClick={onExport}><Download strokeWidth={1.5} /> CSV</Button>}
    </header>
  );
}

/**
 * Growth reports: which sources bring bookings and revenue, the season month by month, why leads are lost, and
 * (owners and Finance) what ad spend buys. Follows the business switch and the page's date range.
 */
export function GrowthReports({ since, rangeLabel }: { since: number; rangeLabel: string }) {
  const s = useCrm();
  const seesCosts = useAccess("finance") === "edit";
  const deals = s.deals.filter((d) => +new Date(d.createdAt) >= since);
  const sources = bySource(deals, s.invoices);
  const season = seasons(s.deals);
  const reasons = lostReasons(deals);
  const ads = adReturn(deals, s.expenses.filter((e) => +new Date(`${e.date}T12:00:00+05:30`) >= since));
  const photography = s.businessView !== "marketing";

  return (
    <>
      <section>
        <Head
          title="Where bookings come from"
          meta={`${rangeLabel} · leads created in the period`}
          onExport={() =>
            downloadCsv("sources", [
              ["Source", "Leads", "Confirmed", "Lost", "Conversion %", "Confirmed (₹)", "Invoiced before GST (₹)", "Average booking (₹)", "Days to confirm"],
              ...sources.map((r) => [CHANNEL_LABEL[r.channel], r.leads, r.confirmed, r.lost, r.conversion ?? "", r.confirmedPaise / 100, r.invoicedPaise / 100, r.avgBookingPaise === null ? "" : r.avgBookingPaise / 100, r.avgDaysToConfirm ?? ""]),
            ])
          }
        />
        <Table className="border-t border-line">
          <THead>
            <TR interactive={false}>
              <TH>Source</TH>
              <TH align="right">Leads</TH>
              <TH align="right">Confirmed</TH>
              <TH align="right">Conversion</TH>
              <TH align="right">Confirmed value</TH>
              <TH align="right" className="hidden md:table-cell">Invoiced</TH>
              <TH align="right" className="hidden md:table-cell">Avg booking</TH>
              <TH align="right" className="hidden sm:table-cell">Days to confirm</TH>
            </TR>
          </THead>
          <TBody>
            {sources.map((r) => (
              <TR key={r.channel} interactive={false}>
                <TD><span className="flex items-center gap-2"><ChannelChip channel={r.channel} /> {CHANNEL_LABEL[r.channel]}</span></TD>
                <TD align="right" numeric>{r.leads}</TD>
                <TD align="right" numeric>{r.confirmed}</TD>
                <TD align="right" numeric>{r.conversion === null ? "—" : `${r.conversion}%`}</TD>
                <TD align="right" numeric>{formatCompact(r.confirmedPaise)}</TD>
                <TD align="right" numeric className="hidden text-ink-2 md:table-cell">{formatCompact(r.invoicedPaise)}</TD>
                <TD align="right" numeric className="hidden text-ink-2 md:table-cell">{r.avgBookingPaise === null ? "—" : formatCompact(r.avgBookingPaise)}</TD>
                <TD align="right" numeric className="hidden text-ink-2 sm:table-cell">{r.avgDaysToConfirm ?? "—"}</TD>
              </TR>
            ))}
            {!sources.length && <TR interactive={false}><TD colSpan={8} className="text-ink-3">No leads in this period.</TD></TR>}
          </TBody>
        </Table>
        <p className="t-meta m-0 mt-2 text-ink-3">Conversion = confirmed ÷ (confirmed + lost); leads still open don't count against a source.</p>
      </section>

      <section>
        <Head
          title="The season"
          meta="Last 12 months · enquiries and bookings by month they happened"
          onExport={() => downloadCsv("season", [["Month", "Enquiries", "Bookings confirmed", ...(photography ? ["Weddings booked for the month"] : [])], ...season.map((m) => [m.month, m.enquiries, m.confirmed, ...(photography ? [m.events] : [])])])}
        />
        <div className="h-[260px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={season.map((m) => ({ ...m, label: monthLabel(m.month) }))} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
              <CartesianGrid vertical={false} stroke="var(--line)" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "var(--ink-3)" }} />
              <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "var(--ink-3)" }} />
              <Tooltip contentStyle={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 8, fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="enquiries" name="Enquiries" fill="var(--ink-3)" radius={[3, 3, 0, 0]} />
              <Bar dataKey="confirmed" name="Bookings confirmed" fill="var(--ok)" radius={[3, 3, 0, 0]} />
              {photography && <Line dataKey="events" name="Weddings in the month" stroke="var(--signal)" strokeWidth={2} dot={{ r: 3 }} />}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-10 xl:grid-cols-2">
        <section>
          <Head title="Why leads were lost" meta={rangeLabel} />
          <Table className="border-t border-line">
            <TBody>
              {reasons.map((r) => (
                <TR key={r.reason} interactive={false}>
                  <TD>{r.reason}</TD>
                  <TD align="right" numeric>{r.count}</TD>
                </TR>
              ))}
              {!reasons.length && <TR interactive={false}><TD className="text-ink-3">No lost leads in this period.</TD></TR>}
            </TBody>
          </Table>
          <p className="t-meta m-0 mt-2 text-ink-3">Reasons come from what's typed when a lead is marked Lost.</p>
        </section>

        {seesCosts && (
          <section>
            <Head title="What ad spend buys" meta={`${rangeLabel} · blended, all sources`} />
            {ads.spendPaise ? (
              <dl className="m-0 grid grid-cols-2 gap-2">
                {[
                  ["Ad spend", formatFull(ads.spendPaise)],
                  ["Cost per lead", ads.costPerLeadPaise === null ? "—" : formatFull(ads.costPerLeadPaise)],
                  ["Cost per booking", ads.costPerBookingPaise === null ? "—" : formatFull(ads.costPerBookingPaise)],
                  ["Booked per ₹1 of ads", ads.returnMultiple === null ? "—" : `₹${ads.returnMultiple}`],
                ].map(([label, value]) => (
                  <div key={label} className="flex flex-col gap-0.5 rounded-card bg-sunken px-3 py-2">
                    <dt className="t-eyebrow text-ink-3">{label}</dt>
                    <dd className="m-0 font-mono fs-14 tnum">{value}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="t-dense m-0 text-ink-3">No ad spend recorded in this period. Add Meta or Google ad bills under Expenses with the category "Ad spend".</p>
            )}
            <p className="t-meta m-0 mt-2 text-ink-3">Ads can't be tied to single leads yet, so these are blended across all leads: read them as a trend.</p>
          </section>
        )}
      </div>
    </>
  );
}
