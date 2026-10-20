import { BUSINESS_LABEL, CHANNEL_LABEL, fmtDate, fmtDay, formatFull } from "@pinnacle/shared";
import { Avatar, Button, ChannelChip, Input, MoneyText, Pill, Textarea, toast } from "@pinnacle/ui";
import { ArrowLeft, ExternalLink, Link2, Trash2, UserRound } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { DealStage } from "../../components/deal/deal-stage";
import { Timeline } from "../../components/deal/timeline";
import { EmptyState } from "../../components/empty-state";
import { PageHeader } from "../../components/page-header";
import { invoiceStatus, invoiceTotals, isOpen, sum } from "../../data/derive";
import { ME_ID } from "../../data/seed";
import { useAccess, useCanEdit, useCrm } from "../../data/store";
import { Cover } from "./client-cards";
import type { Activity, Company } from "../../data/types";
import { api } from "../../lib/api";
import { useUi } from "../../lib/ui-store";
import { ProjectList } from "../projects/index";
import { ClientDetails } from "./companies";

/**
 * One client, everything connected: their details and contacts, what they've bought, money in and out,
 * open work, files, and the full history from the first enquiry to the last payment.
 */
export function ClientRoute() {
  const { id } = useParams();
  const navigate = useNavigate();
  const s = useCrm();
  const c = s.companies.find((x) => x.id === id);
  const canEdit = useCanEdit(c?.ownerId);
  const runsProjects = useAccess("projects") === "edit";
  if (!c)
    return (
      <EmptyState
        icon={UserRound}
        title="Client not found"
        body={s.businessView !== "all" ? "They may belong to the other business — switch the top bar to Both." : "They may have been removed, or the link is old."}
        action={<Button asChild><Link to="/clients">All clients</Link></Button>}
      />
    );

  const deals = s.deals.filter((d) => d.companyId === c.id);
  const dealIds = new Set(deals.map((d) => d.id));
  const confirmed = deals.filter((d) => d.stage === "won");
  const open = deals.filter(isOpen);
  const projects = s.projects.filter((p) => p.companyId === c.id);
  const quotes = s.quotes.filter((q) => q.companyId === c.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const contacts = s.contacts.filter((x) => x.companyId === c.id);
  const contactIds = new Set(contacts.map((x) => x.id));
  const invoices = s.invoices.filter((i) => i.companyId === c.id && !i.cancelled).sort((a, b) => +new Date(b.issuedAt) - +new Date(a.issuedAt));
  const totals = invoices.map((i) => ({ i, t: invoiceTotals(i), st: invoiceStatus(i) }));
  const pending = totals.filter((x) => x.i.sent && x.t.due > 0);
  const nextDue = [...pending].sort((a, b) => +new Date(a.i.dueAt) - +new Date(b.i.dueAt))[0];
  const tasks = s.tasks.filter((t) => !t.done && (t.companyId === c.id || (t.dealId && dealIds.has(t.dealId)))).sort((a, b) => +new Date(a.dueAt) - +new Date(b.dueAt));
  const conversations = s.conversations.filter((x) => (x.contactId && contactIds.has(x.contactId)) || (x.dealId && dealIds.has(x.dealId)));
  const teamIds = new Set([c.ownerId, ...deals.map((d) => d.ownerId), ...tasks.map((t) => t.assigneeId)]);
  const team = s.members.filter((m) => teamIds.has(m.id));
  const isClient = !!c.clientSince || confirmed.length > 0;

  // The full story, newest first: enquiries, first messages, everything logged, payments and credits.
  const history: Activity[] = [
    ...s.activities.filter((a) => a.companyId === c.id || (a.dealId && dealIds.has(a.dealId))),
    ...deals.map((d): Activity => ({ id: `enq-${d.id}`, type: "lead", dealId: d.id, actorId: "client", text: `enquired about ${d.title} via ${CHANNEL_LABEL[d.channel]}`, at: d.createdAt })),
    ...conversations.flatMap((x): Activity[] => {
      const first = x.messages.find((m) => m.direction === "in");
      return first ? [{ id: `msg-${x.id}`, type: x.channel === "gmail" ? "email" : "lead", actorId: "client", text: `first wrote on ${CHANNEL_LABEL[x.channel]}`, body: first.body.slice(0, 280), at: first.at }] : [];
    }),
    ...invoices.flatMap((i) => [
      ...i.payments.map((p, k): Activity => ({ id: `pay-${i.id}-${k}`, type: "invoice", dealId: i.dealId, actorId: "system", text: `Payment of ${formatFull(p.amountPaise)} received against ${i.number}`, at: p.at })),
      ...(i.credits ?? []).map((cr): Activity => ({ id: `cn-${cr.creditNoteId}`, type: "invoice", dealId: i.dealId, actorId: "system", text: `Credit note ${cr.number} · ${formatFull(cr.totalPaise)}`, at: cr.at })),
    ]),
  ].sort((a, b) => +new Date(b.at) - +new Date(a.at));

  const stat = (label: string, paise: number, hint?: string, tone?: string) => (
    <div className="flex flex-col gap-1 py-3 pr-4">
      <span className="t-eyebrow text-ink-3">{label}</span>
      <MoneyText paise={paise} className={`text-[20px] ${tone ?? ""}`} />
      {hint && <span className="font-mono text-[11px] text-ink-3">{hint}</span>}
    </div>
  );

  return (
    <>
      <button onClick={() => navigate(-1)} className="t-meta mb-2 inline-flex items-center gap-1 text-ink-3 hover:text-ink-2">
        <ArrowLeft size={13} strokeWidth={1.5} /> Back
      </button>
      <Cover company={c} canUpload={canEdit || runsProjects} className="mb-6 h-[160px] rounded-card md:h-[200px]" />
      <PageHeader
        eyebrow={[c.business ? BUSINESS_LABEL[c.business] : "Both businesses", isClient ? (c.clientSince ? `client since ${fmtDay(c.clientSince)}` : "client") : "prospect"].join(" · ")}
        title={c.name}
        actions={<Button onClick={() => useUi.getState().openComposer("deal", { business: c.business })}>New lead for them</Button>}
      />

      <section aria-label="Money" className="mb-8 grid grid-cols-2 border-y border-line md:grid-cols-4">
        {stat("Confirmed business", sum(confirmed.map((d) => d.valuePaise)), `${confirmed.length} confirmed ${confirmed.length === 1 ? "deal" : "deals"}`)}
        {stat("Invoiced", sum(totals.map((x) => x.t.total)), `${invoices.length} ${invoices.length === 1 ? "invoice" : "invoices"}`)}
        {stat("Received", sum(totals.map((x) => x.t.paid)), undefined, "text-ok")}
        {stat("Pending", sum(pending.map((x) => x.t.due)), nextDue ? `next due ${fmtDay(nextDue.i.dueAt)}` : "nothing due", pending.some((x) => x.st === "overdue") ? "text-risk" : undefined)}
      </section>

      <div className="grid grid-cols-1 gap-10 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-10">
          <section>
            <h2 className="t-eyebrow m-0 mb-2 text-ink-3">Services purchased · {confirmed.length}</h2>
            <DealList deals={confirmed} empty="Nothing confirmed yet." />
          </section>
          <section>
            <h2 className="t-eyebrow m-0 mb-2 text-ink-3">Projects · {projects.length}</h2>
            <ProjectList projects={projects} />
          </section>
          <section>
            <h2 className="t-eyebrow m-0 mb-2 text-ink-3">Quotations & agreements · {quotes.length}</h2>
            {quotes.length ? (
              <ul className="m-0 list-none border-t border-line p-0">
                {quotes.map((q) => (
                  <li key={q.id} className="flex flex-wrap items-center gap-3 border-b border-line py-2.5">
                    <Link to={`/quotes/${q.id}`} className="font-mono text-[12.5px] hover:underline">{q.number}</Link>
                    <span className="min-w-0 flex-1 truncate text-[11.5px] text-ink-3">
                      {q.signature ? `signed online by ${q.signature.name} · ${fmtDay(q.signature.at)}` : `valid until ${fmtDay(q.validUntil)}`}
                    </span>
                    <MoneyText paise={invoiceTotals({ ...q, payments: [] }).total} />
                    <Pill tone={q.status === "accepted" ? "ok" : q.status === "declined" ? "risk" : q.status === "sent" ? "warn" : "mute"}>{q.status[0]!.toUpperCase() + q.status.slice(1)}</Pill>
                    {q.status === "accepted" && <Link to={`/quotes/${q.id}/agreement`} className="t-meta text-ink-2 hover:underline">Agreement</Link>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="t-dense m-0 text-ink-3">No quotations yet — start one from a lead.</p>
            )}
          </section>
          <section>
            <h2 className="t-eyebrow m-0 mb-2 text-ink-3">Open leads · {open.length}</h2>
            <DealList deals={open} empty="No open leads." />
          </section>
          <section>
            <h2 className="t-eyebrow m-0 mb-2 text-ink-3">Invoices · {invoices.length}</h2>
            {invoices.length ? (
              <ul className="m-0 list-none border-t border-line p-0">
                {totals.map(({ i, t, st }) => (
                  <li key={i.id}>
                    <Link to={`/invoices?open=${i.id}`} className="flex flex-wrap items-center gap-3 border-b border-line py-2.5 hover:bg-hover">
                      <span className="font-mono text-[12.5px]">{i.number}</span>
                      <span className="font-mono text-[11.5px] text-ink-3">{fmtDay(i.issuedAt)}</span>
                      <span className="ml-auto"><MoneyText paise={t.total} /></span>
                      <span className="w-24 text-right">{t.due > 0 && i.sent ? <MoneyText paise={t.due} className="text-ink-2" /> : <span className="text-ink-3">—</span>}</span>
                      <Pill tone={st === "overdue" ? "risk" : st === "paid" ? "ok" : st === "partial" ? "warn" : "mute"}>{st[0]!.toUpperCase() + st.slice(1)}</Pill>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="t-dense m-0 text-ink-3">No invoices yet.</p>
            )}
          </section>
          <section>
            <h2 className="t-eyebrow m-0 mb-2 text-ink-3">Open tasks · {tasks.length}</h2>
            {tasks.length ? (
              <ul className="m-0 list-none border-t border-line p-0">
                {tasks.map((t) => {
                  const who = s.members.find((m) => m.id === t.assigneeId);
                  return (
                    <li key={t.id} className="flex items-center gap-3 border-b border-line py-2">
                      <span className="t-dense min-w-0 flex-1 truncate">{t.title}</span>
                      <span className={`font-mono text-[11.5px] ${+new Date(t.dueAt) < Date.now() ? "text-risk" : "text-ink-3"}`}>{fmtDay(t.dueAt)}</span>
                      {who && <Avatar name={who.name} me={who.id === ME_ID} size="sm" />}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="t-dense m-0 text-ink-3">No open tasks.</p>
            )}
          </section>
          <section>
            <h2 className="t-eyebrow m-0 mb-3 text-ink-3">History</h2>
            <ClientNote company={c} />
            <Timeline items={history} showSubject actorName={(a) => (a === "client" ? c.name : a === "system" ? "" : undefined)} />
          </section>
        </div>

        <aside className="flex min-w-0 flex-col gap-8">
          <section>
            <h2 className="t-eyebrow m-0 mb-2 text-ink-3">People · {contacts.length}</h2>
            <ul className="m-0 list-none p-0">
              {contacts.map((p) => (
                <li key={p.id} className="flex items-start gap-2.5 border-b border-line py-2.5 last:border-0">
                  <Avatar name={p.name} />
                  <div className="min-w-0 flex-1 leading-tight">
                    <div className="t-dense">{p.name} {p.title && p.title !== "—" && <span className="text-[11.5px] text-ink-3">· {p.title}</span>}</div>
                    <div className="mt-0.5 flex flex-wrap gap-x-3 font-mono text-[11.5px] text-ink-2">
                      {p.phone && <a href={`tel:${p.phone.replace(/\s/g, "")}`} className="hover:text-ink">{p.phone}</a>}
                      {p.email && <a href={`mailto:${p.email}`} className="hover:text-ink">{p.email}</a>}
                      {p.handle && <span>{p.handle}</span>}
                    </div>
                  </div>
                  <ChannelChip channel={p.source} />
                </li>
              ))}
              {!contacts.length && <li className="t-dense text-ink-3">No contacts yet.</li>}
            </ul>
          </section>
          <section>
            <h2 className="t-eyebrow m-0 mb-3 text-ink-3">Details</h2>
            <ClientDetails c={c} />
          </section>
          <section>
            <h2 className="t-eyebrow m-0 mb-2 text-ink-3">Team</h2>
            <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
              {team.map((m) => (
                <li key={m.id} className="flex items-center gap-1.5 rounded-control bg-sunken px-2 py-1">
                  <Avatar name={m.name} me={m.id === ME_ID} size="sm" />
                  <span className="text-[12.5px]">{m.name}</span>
                </li>
              ))}
            </ul>
          </section>
          <ClientLinks company={c} canEdit={canEdit} />
        </aside>
      </div>
    </>
  );
}

function DealList({ deals, empty }: { deals: import("../../data/types").Deal[]; empty: string }) {
  if (!deals.length) return <p className="t-dense m-0 text-ink-3">{empty}</p>;
  return (
    <ul className="m-0 list-none border-t border-line p-0">
      {deals.map((d) => (
        <li key={d.id}>
          <button onClick={() => useUi.getState().openDeal(d.id)} className="flex w-full items-center gap-3 border-b border-line py-2.5 text-left hover:bg-hover">
            <span className="min-w-0 flex-1">
              <span className="t-dense block truncate font-medium">{d.service || d.title}</span>
              <span className="flex flex-wrap items-center gap-x-3">
                <DealStage deal={d} />
                {d.eventDate && <span className="font-mono text-[11px] text-ink-3">event {fmtDate(d.eventDate)}</span>}
              </span>
            </span>
            <ChannelChip channel={d.channel} />
            <MoneyText paise={d.valuePaise} />
          </button>
        </li>
      ))}
    </ul>
  );
}

/** A note on the client (not tied to one deal). */
function ClientNote({ company }: { company: Company }) {
  const [text, setText] = useState("");
  return (
    <form
      className="mb-5 flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!text.trim()) return;
        useCrm.getState().addActivity({ type: "note", companyId: company.id, text: "added a note", body: text.trim() });
        setText("");
        toast("Note added");
      }}
    >
      <Textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder={`A note about ${company.name}…`} />
      {text.trim() && <Button type="submit" size="sm" variant="ink" className="self-end">Add note</Button>}
    </form>
  );
}

/** Links to files kept elsewhere: Drive folders, contracts, briefs, shot lists, deliverables. */
function ClientLinks({ company, canEdit }: { company: Company; canEdit: boolean }) {
  const links = company.links ?? [];
  const [draft, setDraft] = useState({ label: "", url: "" });
  const [busy, setBusy] = useState(false);
  const save = async (next: { label: string; url: string }[], done: string) => {
    setBusy(true);
    try {
      const saved = await api<Company>(`/companies/${company.id}`, { method: "PATCH", body: { links: next } });
      useCrm.setState((s) => ({ companies: s.companies.map((x) => (x.id === saved.id ? saved : x)) }));
      toast(done);
      return true;
    } catch (e) {
      const issues = (e as { body?: { issues?: { message: string }[] } }).body?.issues;
      toast(issues?.[0]?.message ?? `Couldn't save — ${(e as Error).message}`);
      return false;
    } finally {
      setBusy(false);
    }
  };
  return (
    <section>
      <h2 className="t-eyebrow m-0 mb-2 text-ink-3">Files & documents · {links.length}</h2>
      <ul className="m-0 list-none p-0">
        {links.map((l, i) => (
          <li key={`${l.url}-${i}`} className="flex items-center gap-2 border-b border-line py-2">
            <Link2 size={14} strokeWidth={1.5} className="shrink-0 text-ink-3" />
            <a href={l.url} target="_blank" rel="noreferrer" className="t-dense min-w-0 flex-1 truncate hover:underline">{l.label}</a>
            <ExternalLink size={12} strokeWidth={1.5} className="text-ink-3" />
            {canEdit && (
              <Button size="icon-sm" variant="ghost" aria-label={`Remove ${l.label}`} disabled={busy} onClick={() => void save(links.filter((_, k) => k !== i), "Link removed")}>
                <Trash2 strokeWidth={1.5} />
              </Button>
            )}
          </li>
        ))}
        {!links.length && <li className="t-meta text-ink-3">Add links to Drive folders, contracts, briefs or deliverables — big files stay where they are.</li>}
      </ul>
      {canEdit && (
        <form
          className="mt-3 flex flex-col gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!draft.label.trim() || !draft.url.trim()) return toast("Add a name and a link");
            if (await save([...links, { label: draft.label.trim(), url: draft.url.trim() }], "Link added")) setDraft({ label: "", url: "" });
          }}
        >
          <Input value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} placeholder="Name, e.g. Wedding photos (Drive)" />
          <Input value={draft.url} onChange={(e) => setDraft({ ...draft, url: e.target.value })} placeholder="https://drive.google.com/…" className="font-mono" />
          <Button type="submit" size="sm" disabled={busy} className="self-end">Add link</Button>
        </form>
      )}
    </section>
  );
}
