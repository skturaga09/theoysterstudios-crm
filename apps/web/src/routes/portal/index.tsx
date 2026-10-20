import { BUSINESS_LABEL, fmtDate, formatFull, PROJECT_STATUS_LABEL, type Business, type ProjectStatus } from "@pinnacle/shared";
import { Button, cn, Input, Pill, Textarea, toast } from "@pinnacle/ui";
import { CalendarDays, Check, ExternalLink, FileText, Mail, MessageCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { createBrowserRouter, Link, RouterProvider, useParams } from "react-router";
import { IS_DEMO } from "../../lib/demo";
import { TaxDocument, type PrintableDoc } from "../invoices/print";

type Approval = { id: string; title: string; dueAt?: string; approval: string; notes: { body: string; at: string; by?: string }[] };
type PortalInvoice = PrintableDoc & { totalPaise: number; duePaise: number; payUrl?: string };
export type PortalView = {
  studio: { name: string; email?: string; whatsapp?: string };
  client: { name: string };
  project: { name: string; business: Business; status: ProjectStatus; startDate?: string; dueDate?: string; events: { name: string; date?: string; venue?: string }[]; calendarUrl?: string; progress: { done: number; total: number } };
  approvals: Approval[];
  deliverables: { name: string; dueDate?: string; status: string; url?: string }[];
  schedule: { label: string; amountPaise: number; dueDate?: string; status: "paid" | "invoiced" | "due" | "upcoming" }[];
  invoices: PortalInvoice[];
};

/** What the portal shows in the demo build (no server): one wedding, mid-way. */
const SAMPLE: PortalView = {
  studio: { name: "The Oyster Studios", email: "hello@theoysterstudios.com", whatsapp: "+91 98765 43210" },
  client: { name: "Riya & Arjun" },
  project: {
    name: "Riya & Arjun — Udaipur wedding",
    business: "photography",
    status: "active",
    startDate: "2026-09-02",
    dueDate: "2026-12-12",
    events: [{ name: "Mehendi", date: "2026-12-10", venue: "Lake Pichola lawns" }, { name: "Sangeet", date: "2026-12-11", venue: "Ballroom" }, { name: "Wedding", date: "2026-12-12", venue: "Jagmandir" }],
    progress: { done: 5, total: 13 },
  },
  approvals: [
    { id: "a1", title: "Shot list and family groups", dueAt: "2026-12-05T18:00:00+05:30", approval: "pending", notes: [] },
    { id: "a2", title: "Pre-wedding shoot selects", approval: "approved", notes: [{ body: "Approved — love the sunset ones!", at: "2026-10-12T10:00:00+05:30", by: "Riya" }] },
  ],
  deliverables: [
    { name: "Pre-wedding photos", status: "delivered", dueDate: "2026-10-10", url: "https://example.com/gallery" },
    { name: "Edited photos", status: "pending", dueDate: "2026-12-26" },
    { name: "Highlight film", status: "pending", dueDate: "2027-01-11" },
    { name: "Album", status: "pending", dueDate: "2027-02-10" },
  ],
  schedule: [
    { label: "Booking advance", amountPaise: 90_000_00, dueDate: "2026-09-02", status: "paid" },
    { label: "Before the wedding", amountPaise: 1_50_000_00, dueDate: "2026-12-05", status: "invoiced" },
    { label: "On delivery", amountPaise: 60_000_00, dueDate: "2027-01-26", status: "upcoming" },
  ],
  invoices: [],
};

/** The client portal: its own small app at /portal/<link>, no sign-in. The link itself is the key. */
export function PortalApp() {
  const [router] = useState(() =>
    createBrowserRouter([
      { path: "/portal/:token", element: <PortalPage /> },
      { path: "/portal/:token/invoices/:invoiceId", element: <PortalInvoicePage /> },
      { path: "*", element: <Gone /> },
    ]),
  );
  return <RouterProvider router={router} />;
}

function usePortal(token?: string) {
  const [view, setView] = useState<PortalView | null>();
  const load = () => {
    if (IS_DEMO || token === "demo") return setView(SAMPLE);
    fetch(`/api/public/portal/${encodeURIComponent(token ?? "")}`)
      .then((r) => (r.ok ? (r.json() as Promise<PortalView>) : null))
      .then(setView, () => setView(null));
  };
  useEffect(load, [token]);
  return { view, reload: load, setView };
}

function Gone() {
  return (
    <main className="grid min-h-dvh place-items-center bg-bg px-4">
      <div className="max-w-[420px] text-center">
        <img src="/logo.png" alt="" className="mx-auto mb-6 h-16 w-auto" />
        <h1 className="t-sheet m-0">This link isn't active</h1>
        <p className="t-body mt-2 text-ink-2">It may have been replaced or turned off. Ask the studio to send you a new one.</p>
      </div>
    </main>
  );
}

const STATUS_TONE: Record<string, "ok" | "warn" | "mute" | "risk"> = { paid: "ok", invoiced: "warn", due: "risk", upcoming: "mute", delivered: "ok", in_progress: "warn", pending: "mute", approved: "ok", changes: "warn" };
const STATUS_TEXT: Record<string, string> = { paid: "Paid", invoiced: "Invoiced", due: "Due", upcoming: "Upcoming", delivered: "Ready", in_progress: "In progress", pending: "Coming", approved: "Approved", changes: "Changes asked" };

function PortalPage() {
  const { token } = useParams();
  const { view, setView } = usePortal(token);
  useEffect(() => {
    if (view) document.title = `${view.project.name} · ${view.studio.name}`;
  }, [view]);
  if (view === undefined) return <main className="min-h-dvh bg-bg" />;
  if (!view) return <Gone />;
  const { project, studio } = view;
  const pct = project.progress.total ? Math.round((project.progress.done / project.progress.total) * 100) : 0;
  const waiting = view.approvals.filter((a) => a.approval === "pending" || a.approval === "changes");
  const wa = studio.whatsapp?.replace(/\D/g, "");

  return (
    <main className="min-h-dvh bg-bg px-4 py-8">
      <div className="mx-auto flex max-w-[720px] flex-col gap-8">
        <header className="flex items-center gap-3">
          <img src="/logo.png" alt={studio.name} className="h-12 w-auto" />
          <span className="t-meta ml-auto text-ink-3">Shared with {view.client.name}</span>
        </header>

        <section>
          <p className="t-eyebrow m-0 text-ink-3">{BUSINESS_LABEL[project.business]}</p>
          <h1 className="t-title m-0 mt-1">{project.name}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Pill tone={project.status === "delivered" ? "ok" : "warn"}>{PROJECT_STATUS_LABEL[project.status]}</Pill>
            {project.dueDate && <span className="t-meta text-ink-2">{project.business === "photography" ? "Wedding" : "Due"} {fmtDate(project.dueDate)}</span>}
          </div>
          <div className="mt-4 flex items-center gap-3" aria-label={`${pct}% of the work done`}>
            <span className="h-2 flex-1 overflow-hidden rounded-full bg-sunken"><span className="block h-full bg-ink" style={{ width: `${pct}%` }} /></span>
            <span className="font-mono text-[12px] text-ink-2">{pct}% done</span>
          </div>
        </section>

        {waiting.length > 0 && (
          <section>
            <h2 className="t-sheet m-0 mb-3">Waiting for you · {waiting.length}</h2>
            <div className="flex flex-col gap-3">{waiting.map((a) => <ApprovalCard key={a.id} a={a} token={token!} onDone={(approval) => setView({ ...view, approvals: view.approvals.map((x) => (x.id === a.id ? { ...x, approval } : x)) })} />)}</div>
          </section>
        )}

        {project.events.length > 0 && (
          <section>
            <h2 className="t-eyebrow m-0 mb-2 text-ink-2">Your functions</h2>
            <ul className="m-0 list-none border-t border-line p-0">
              {project.events.map((e, i) => (
                <li key={i} className="flex flex-wrap items-baseline gap-x-3 border-b border-line py-2.5">
                  <span className="t-dense font-medium">{e.name}</span>
                  {e.venue && <span className="t-meta text-ink-3">{e.venue}</span>}
                  <span className="ml-auto font-mono text-[12px] text-ink-2">{e.date ? fmtDate(e.date) : "Date to confirm"}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {project.calendarUrl && (
          <section className="flex flex-wrap items-center gap-3 rounded-card bg-sunken p-4">
            <CalendarDays size={18} strokeWidth={1.5} className="text-ink-2" />
            <span className="t-dense min-w-0 flex-1">This month's content calendar</span>
            <Button asChild variant="ink" size="sm"><a href={project.calendarUrl} target="_blank" rel="noreferrer">Open calendar <ExternalLink strokeWidth={1.5} /></a></Button>
          </section>
        )}

        {view.deliverables.length > 0 && (
          <section>
            <h2 className="t-eyebrow m-0 mb-2 text-ink-2">What you'll receive</h2>
            <ul className="m-0 list-none border-t border-line p-0">
              {view.deliverables.map((d, i) => (
                <li key={i} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line py-2.5">
                  <span className="t-dense min-w-0 flex-1">{d.name}</span>
                  {d.dueDate && d.status !== "delivered" && <span className="font-mono text-[11.5px] text-ink-3">by {fmtDate(d.dueDate)}</span>}
                  <Pill tone={STATUS_TONE[d.status] ?? "mute"}>{STATUS_TEXT[d.status] ?? d.status}</Pill>
                  {d.url && <Button asChild size="sm"><a href={d.url} target="_blank" rel="noreferrer">Open <ExternalLink strokeWidth={1.5} /></a></Button>}
                </li>
              ))}
            </ul>
          </section>
        )}

        {(view.schedule.length > 0 || view.invoices.length > 0) && (
          <section>
            <h2 className="t-eyebrow m-0 mb-2 text-ink-2">Payments</h2>
            {view.schedule.length > 0 && (
              <ul className="m-0 list-none border-t border-line p-0">
                {view.schedule.map((m, i) => (
                  <li key={i} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line py-2.5">
                    <span className="t-dense min-w-0 flex-1">{m.label}{m.dueDate && <span className="text-[11.5px] text-ink-3"> · by {fmtDate(m.dueDate)}</span>}</span>
                    <span className="font-mono text-[12.5px]">{formatFull(m.amountPaise)} <span className="text-ink-3">+ GST</span></span>
                    <Pill tone={STATUS_TONE[m.status]}>{STATUS_TEXT[m.status]}</Pill>
                  </li>
                ))}
              </ul>
            )}
            {view.invoices.length > 0 && (
              <ul className="m-0 mt-4 list-none p-0">
                {view.invoices.map((inv) => (
                  <li key={inv.id} className="mb-2 flex flex-wrap items-center gap-3 rounded-card bg-sunken p-3">
                    <FileText size={16} strokeWidth={1.5} className="text-ink-3" />
                    <span className="min-w-0 flex-1">
                      <span className="block font-mono text-[12.5px]">{inv.number}</span>
                      <span className="text-[11.5px] text-ink-3">{formatFull(inv.totalPaise)} · {inv.duePaise > 100 ? `${formatFull(inv.duePaise)} due${inv.dueAt ? ` by ${fmtDate(inv.dueAt)}` : ""}` : "paid in full"}</span>
                    </span>
                    <Button asChild size="sm" variant="ghost"><Link to={`/portal/${token}/invoices/${inv.id}`}>View / PDF</Link></Button>
                    {inv.payUrl && <Button asChild size="sm" variant="ink"><a href={inv.payUrl} target="_blank" rel="noreferrer">Pay {formatFull(inv.duePaise)}</a></Button>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {view.approvals.some((a) => a.approval === "approved") && (
          <section>
            <h2 className="t-eyebrow m-0 mb-2 text-ink-2">Already approved</h2>
            <ul className="m-0 list-none border-t border-line p-0">
              {view.approvals.filter((a) => a.approval === "approved").map((a) => (
                <li key={a.id} className="flex items-center gap-2 border-b border-line py-2.5 t-dense text-ink-2"><Check size={14} strokeWidth={1.5} className="text-ok" /> {a.title}</li>
              ))}
            </ul>
          </section>
        )}

        <footer className="flex flex-wrap items-center gap-2 border-t border-line pt-5">
          <span className="t-meta mr-auto text-ink-3">Questions? Talk to {studio.name}.</span>
          {wa && <Button asChild size="sm"><a href={`https://wa.me/${wa.length === 10 ? `91${wa}` : wa}`} target="_blank" rel="noreferrer"><MessageCircle strokeWidth={1.5} /> WhatsApp</a></Button>}
          {studio.email && <Button asChild size="sm" variant="ghost"><a href={`mailto:${studio.email}`}><Mail strokeWidth={1.5} /> Email</a></Button>}
        </footer>
      </div>
    </main>
  );
}

/** One item for the client to sign off: approve, or say what to change. Their name is remembered on this device. */
function ApprovalCard({ a, token, onDone }: { a: Approval; token: string; onDone: (approval: string) => void }) {
  const [changing, setChanging] = useState(false);
  const [note, setNote] = useState("");
  const [name, setName] = useState(() => {
    try {
      return localStorage.getItem("oyster.portal.name") ?? "";
    } catch {
      return "";
    }
  });
  const [busy, setBusy] = useState(false);
  const decide = async (decision: "approved" | "changes") => {
    if (decision === "changes" && !note.trim()) return toast("Say what you'd like changed");
    setBusy(true);
    try {
      try {
        localStorage.setItem("oyster.portal.name", name.trim());
      } catch {
        // storage blocked: the name just isn't remembered
      }
      if (!IS_DEMO && token !== "demo") {
        const res = await fetch(`/api/public/portal/${encodeURIComponent(token)}/approvals/${a.id}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ decision, note: note.trim() || undefined, name: name.trim() || undefined }),
        });
        if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Please try again");
      }
      onDone(decision);
      toast(decision === "approved" ? "Approved — thank you!" : "Sent — the team will get back to you");
    } catch (e) {
      toast(`Couldn't send — ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };
  return (
    <article className="rounded-card border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="t-dense m-0 min-w-0 flex-1 font-medium">{a.title}</h3>
        {a.approval === "changes" && <Pill tone="warn">Changes asked</Pill>}
        {a.dueAt && <span className="font-mono text-[11.5px] text-ink-3">by {fmtDate(a.dueAt)}</span>}
      </div>
      {a.notes.length > 0 && (
        <ul className="m-0 mt-2 list-none p-0">
          {a.notes.map((n, i) => <li key={i} className="t-meta text-ink-2">“{n.body}”{n.by && ` — ${n.by}`}</li>)}
        </ul>
      )}
      {changing && <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What would you like changed?" className="mt-3" autoFocus />}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Input aria-label="Your name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" className="h-8 w-[160px]" />
        <span className="ml-auto flex gap-2">
          {changing ? (
            <>
              <Button size="sm" variant="ghost" onClick={() => setChanging(false)} disabled={busy}>Cancel</Button>
              <Button size="sm" variant="ink" onClick={() => void decide("changes")} disabled={busy}>Send changes</Button>
            </>
          ) : (
            <>
              <Button size="sm" onClick={() => setChanging(true)} disabled={busy}>Request changes</Button>
              <Button size="sm" variant="ink" onClick={() => void decide("approved")} disabled={busy}><Check strokeWidth={1.5} /> Approve</Button>
            </>
          )}
        </span>
      </div>
    </article>
  );
}

/** An invoice from the portal, laid out like the printed tax invoice (Save as PDF from the print dialog). */
function PortalInvoicePage() {
  const { token, invoiceId } = useParams();
  const { view } = usePortal(token);
  if (view === undefined) return <main className="min-h-dvh bg-bg" />;
  const inv = view?.invoices.find((i) => i.id === invoiceId);
  if (!inv) return <Gone />;
  return <div className={cn("bg-sunken")}><TaxDocument doc={inv} /></div>;
}
