import {
  ACCOUNT_STATUS_LABEL,
  ACCOUNT_STATUSES,
  CLIENT_CATEGORIES,
  CONTENT_STATUS_LABEL,
  fmtDate,
  formatCompact,
  formatFull,
  invoiceTotals,
  istDay,
  parseRupees,
  PAYMENT_STATUS_LABEL,
  PAYMENT_STATUSES,
  TASK_STATUS_LABEL,
  type AccountStatus,
  type PaymentStatus,
} from "@pinnacle/shared";
import { Avatar, Button, cn, Input, Pill, Segmented, Select, toast, type PillTone } from "@pinnacle/ui";
import { ArrowLeft, ChevronRight, ExternalLink, FolderOpen, Mail, Megaphone, Phone, Plus, Search } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { AmountInput } from "../../components/amount-input";
import { tile } from "../../components/bento";
import { ClientPhoto } from "../../components/client-photo";
import { EmptyState } from "../../components/empty-state";
import { PageHeader } from "../../components/page-header";
import { useContentItems, type ContentItem } from "../../data/content";
import { invoiceStatus } from "../../data/derive";
import { ME_ID } from "../../data/seed";
import { useAccess, useCanEdit, useCrm } from "../../data/store";
import type { Company } from "../../data/types";
import { api } from "../../lib/api";
import { IS_DEMO } from "../../lib/demo";
import { useUi } from "../../lib/ui-store";
import { ContentCalendar, STATUS_STYLE } from "./content";

const STATUS_TONE: Record<AccountStatus, PillTone> = { active: "ok", onboarding: "warn", on_hold: "risk" };
const PAY_TONE: Record<PaymentStatus, PillTone> = { paid: "ok", pending: "warn", overdue: "risk" };
const IN_PRODUCTION = new Set(["planning", "shooting", "editing"]);
const TO_PUBLISH = new Set(["approval", "ready"]);

/** A client counts as a marketing client once it's tagged Marketing or has any workspace detail. */
const isMarketing = (c: Company) => c.business === "marketing" || !!c.accountStatus || !!c.category || !!c.subscription;
const statusOf = (c: Company): AccountStatus => c.accountStatus ?? (c.clientSince ? "active" : "onboarding");

/** Saves workspace fields on a client, showing them straight away. */
export async function saveCompany(c: Company, patch: Partial<Company>) {
  const prev = useCrm.getState().companies;
  useCrm.setState({ companies: prev.map((x) => (x.id === c.id ? { ...x, ...patch } : x)) });
  if (IS_DEMO) return;
  try {
    const body = Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, v === undefined ? null : v]));
    const saved = await api<Company>(`/companies/${c.id}`, { method: "PATCH", body });
    useCrm.setState((s) => ({ companies: s.companies.map((x) => (x.id === saved.id ? saved : x)) }));
  } catch (e) {
    useCrm.setState({ companies: prev });
    toast(`Couldn't save — ${(e as Error).message}`);
  }
}

/** Owners, the client's sales owner, and account managers (projects: edit) run a client's workspace. */
function useCanRun(c?: Company) {
  const sales = useCanEdit(c?.ownerId);
  return useAccess("projects") === "edit" || sales;
}

/** Each client's pending work: content in production, posts waiting to go out, open and late tasks. */
function useWork() {
  const content = useContentItems();
  const tasks = useCrm((s) => s.tasks);
  const projects = useCrm((s) => s.projects);
  const today = istDay(new Date().toISOString());
  return (id: string) => {
    const mine = content.filter((c) => c.companyId === id);
    const t = tasks.filter((x) => !x.done && (x.companyId === id || projects.some((p) => p.id === x.projectId && p.companyId === id)));
    return {
      content: mine,
      production: mine.filter((c) => IN_PRODUCTION.has(c.status)),
      toPublish: mine.filter((c) => TO_PUBLISH.has(c.status)),
      tasks: t,
      late: t.filter((x) => istDay(x.dueAt) < today).length,
    };
  };
}

/* ---------- The clients board ---------- */

export function MarketingClientsRoute() {
  const companies = useCrm((s) => s.companies);
  const contacts = useCrm((s) => s.contacts);
  const navigate = useNavigate();
  const work = useWork();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [over, setOver] = useState<AccountStatus>();
  const q = query.trim().toLowerCase();
  const clients = companies.filter(isMarketing).filter((c) => (category === "all" || c.category === category) && (!q || c.name.toLowerCase().includes(q)));
  const person = (id: string) => contacts.find((x) => x.companyId === id)?.name;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Marketing clients"
        sub="Every retainer client, with their content, subscription and pending work. Drag a card to change where the account stands."
        stats={ACCOUNT_STATUSES.map((st) => ({ label: ACCOUNT_STATUS_LABEL[st], value: clients.filter((c) => statusOf(c) === st).length, tone: st === "active" ? ("ok" as const) : st === "on_hold" ? ("risk" as const) : ("signal" as const) }))}
        actions={<Button variant="ink" onClick={() => useUi.getState().openComposer("company", { business: "marketing" })}><Plus strokeWidth={1.5} /> Add client</Button>}
      />
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative w-full max-w-[280px]">
          <Search size={14} strokeWidth={1.5} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-3" />
          <Input aria-label="Search clients" placeholder="Search clients" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-8" />
        </label>
        <Select aria-label="Category" value={category} onChange={(e) => setCategory(e.target.value)} className="w-[230px]">
          <option value="all">All categories</option>
          {CLIENT_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
        </Select>
      </div>
      {!companies.some(isMarketing) ? (
        <EmptyState icon={Megaphone} title="No marketing clients yet" body="Add a client, or confirm a Marketing lead: they appear here with their own workspace." />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {ACCOUNT_STATUSES.map((st) => {
            const list = clients.filter((c) => statusOf(c) === st);
            return (
              <section
                key={st}
                aria-label={`${ACCOUNT_STATUS_LABEL[st]}: ${list.length}`}
                onDragOver={(e) => { e.preventDefault(); setOver(st); }}
                onDragLeave={() => setOver(undefined)}
                onDrop={(e) => {
                  e.preventDefault();
                  setOver(undefined);
                  const c = companies.find((x) => x.id === e.dataTransfer.getData("text/plain"));
                  if (c && statusOf(c) !== st) {
                    void saveCompany(c, { accountStatus: st });
                    toast(`${c.name} · ${ACCOUNT_STATUS_LABEL[st]}`);
                  }
                }}
                className={cn("flex min-h-[200px] flex-col gap-3 rounded-[20px] bg-sunken p-3 transition-shadow", over === st && "shadow-[inset_0_0_0_1.5px_var(--signal)]")}
              >
                <header className="flex items-center gap-2 px-1">
                  <span className={cn("size-2 rounded-full", st === "active" ? "bg-ok" : st === "on_hold" ? "bg-risk" : "bg-warn")} />
                  <h2 className="m-0 fs-13 font-medium">{ACCOUNT_STATUS_LABEL[st]}</h2>
                  <span className="font-mono fs-11 text-ink-3">{list.length}</span>
                </header>
                {list.map((c, i) => {
                  const w = work(c.id);
                  return (
                    <motion.div key={c.id} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 8) * 0.04 }}>
                    <button
                      draggable
                      onDragStart={(e) => e.dataTransfer.setData("text/plain", c.id)}
                      onClick={() => navigate(`/marketing/${c.id}`)}
                      className="flex w-full cursor-pointer items-center gap-3 rounded-[16px] bg-surface p-3 text-left shadow-rest transition-shadow hover:shadow-pop"
                    >
                      <ClientPhoto company={c} size="lg" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-serif fs-18 leading-tight">{c.name}</span>
                        <span className="block truncate fs-12 text-ink-3">{[c.category ?? c.industry, person(c.id)].filter(Boolean).join(" · ") || "Category not set"}</span>
                        <span className="mt-1.5 flex flex-wrap gap-1.5">
                          <Pill tone={STATUS_TONE[st]}>{ACCOUNT_STATUS_LABEL[st]}</Pill>
                          {w.production.length > 0 && <Pill tone="mute">{w.production.length} in production</Pill>}
                          {w.toPublish.length > 0 && <Pill tone="new">{w.toPublish.length} to publish</Pill>}
                          {w.late > 0 && <Pill tone="risk">{w.late} late</Pill>}
                          {c.subscription?.paymentStatus === "overdue" && <Pill tone="risk">Payment overdue</Pill>}
                        </span>
                      </span>
                      <ChevronRight size={16} strokeWidth={1.5} className="shrink-0 text-ink-3" />
                    </button>
                    </motion.div>
                  );
                })}
                {!list.length && <p className="m-0 rounded-[14px] border border-dashed border-line-2 px-3 py-6 text-center fs-12 text-ink-3">Drop a client here</p>}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ---------- One client's workspace: Overview, Subscription, Content calendar ---------- */

type Tab = "overview" | "subscription" | "content";

export function MarketingClientRoute() {
  const { id } = useParams();
  const navigate = useNavigate();
  const c = useCrm((s) => s.companies.find((x) => x.id === id));
  const contact = useCrm((s) => s.contacts.find((x) => x.companyId === id));
  const canRun = useCanRun(c);
  const canContent = useAccess("projects") === "edit";
  const [params, setParams] = useSearchParams();
  const tab = (params.get("tab") as Tab) || "overview";
  if (!c) return <EmptyState icon={Megaphone} title="Client not found" body="It may have been removed, or the link is old." action={<Button asChild><Link to="/marketing">All marketing clients</Link></Button>} />;
  const st = statusOf(c);
  return (
    <div className="flex flex-col gap-5">
      <button onClick={() => navigate("/marketing")} className="t-meta inline-flex items-center gap-1 self-start text-ink-3 hover:text-ink-2">
        <ArrowLeft size={13} strokeWidth={1.5} /> Back to clients
      </button>
      <header className="flex flex-wrap items-center gap-4">
        <ClientPhoto company={c} size="lg" className="size-16 fs-22" />
        <div className="min-w-0 flex-1">
          <h1 className="t-title m-0 flex flex-wrap items-center gap-3 font-semibold">{c.name} <Pill tone={STATUS_TONE[st]}>{ACCOUNT_STATUS_LABEL[st]}</Pill></h1>
          <p className="t-meta m-0 mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-ink-2">
            <span>{c.category ?? c.industry ?? "Category not set"}</span>
            {contact?.phone && <a href={`tel:${contact.phone}`} className="inline-flex items-center gap-1 hover:text-ink"><Phone size={13} strokeWidth={1.5} />{contact.phone}</a>}
            {contact?.email && <a href={`mailto:${contact.email}`} className="inline-flex items-center gap-1 hover:text-ink"><Mail size={13} strokeWidth={1.5} />{contact.email}</a>}
            <Link to={`/clients/${c.id}`} className="text-ink-3 hover:text-ink">Full client record →</Link>
          </p>
        </div>
      </header>
      <Segmented
        label="Workspace"
        value={tab}
        onChange={(t) => setParams(t === "overview" ? {} : { tab: t }, { replace: true })}
        className="self-start"
        options={[{ value: "overview", label: "Overview" }, { value: "subscription", label: "Subscription" }, { value: "content", label: "Content calendar" }]}
      />
      {tab === "overview" ? <Overview c={c} canRun={canRun} /> : tab === "subscription" ? <Subscription key={c.id} c={c} canRun={canRun} /> : <ContentCalendar companyId={c.id} canEdit={canContent} />}
    </div>
  );
}

function Card({ title, link, children, className }: { title: string; link?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn(tile, className)}>
      <div className="mb-3 flex items-baseline justify-between gap-2"><h2 className="t-eyebrow m-0 text-ink-3">{title}</h2>{link}</div>
      {children}
    </section>
  );
}

function Overview({ c, canRun }: { c: Company; canRun: boolean }) {
  const s = useCrm();
  const contact = s.contacts.find((x) => x.companyId === c.id);
  const w = useWork()(c.id);
  const [, setParams] = useSearchParams();
  const toContent = <button onClick={() => setParams({ tab: "content" })} className="t-meta text-ink-3 hover:text-ink">Content calendar →</button>;
  const row = "grid grid-cols-[120px_minmax(0,1fr)] items-center gap-2 py-1.5 fs-12.5";
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <div className="flex flex-col gap-4">
        <Card title="Client information" link={<Link to={`/clients/${c.id}`} className="t-meta text-ink-3 hover:text-ink">Edit details →</Link>}>
          <div className={row}><span className="text-ink-3">Business type</span>
            <Select aria-label="Business type" disabled={!canRun} value={c.category ?? ""} onChange={(e) => void saveCompany(c, { category: e.target.value || undefined })} className="h-8">
              <option value="">Not set</option>{CLIENT_CATEGORIES.map((x) => <option key={x}>{x}</option>)}
            </Select>
          </div>
          <div className={row}><span className="text-ink-3">Account</span>
            <Select aria-label="Account status" disabled={!canRun} value={statusOf(c)} onChange={(e) => void saveCompany(c, { accountStatus: e.target.value as AccountStatus })} className="h-8">
              {ACCOUNT_STATUSES.map((x) => <option key={x} value={x}>{ACCOUNT_STATUS_LABEL[x]}</option>)}
            </Select>
          </div>
          <div className={row}><span className="text-ink-3">Contact person</span><span>{contact?.name ?? "—"}</span></div>
          <div className={row}><span className="text-ink-3">Phone</span><span className="font-mono">{contact?.phone ?? "—"}</span></div>
          <div className={row}><span className="text-ink-3">Email</span><span className="truncate">{contact?.email ?? "—"}</span></div>
          <div className={row}><span className="text-ink-3">Website</span>{c.domain ? <a href={`https://${c.domain}`} target="_blank" rel="noreferrer" className="truncate text-signal hover:underline">{c.domain}</a> : <span>—</span>}</div>
          <div className={row}><span className="text-ink-3">City</span><span>{c.city || "—"}</span></div>
        </Card>

        <Card title="Brand assets">
          {c.brandAssetsUrl && <a href={c.brandAssetsUrl} target="_blank" rel="noreferrer" className="mb-2 inline-flex items-center gap-2 rounded-full bg-signal-wash px-3 py-1.5 fs-12.5 font-medium text-signal hover:opacity-80"><FolderOpen size={15} strokeWidth={1.5} /> Open the Drive folder <ExternalLink size={12} strokeWidth={1.5} /></a>}
          {canRun && (
            <Input
              key={c.brandAssetsUrl ?? ""}
              aria-label="Brand assets folder link"
              placeholder="Paste the Google Drive folder link (logos, photos, brand guide)"
              defaultValue={c.brandAssetsUrl ?? ""}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v === (c.brandAssetsUrl ?? "")) return;
                if (v && !/^https?:\/\/\S+$/.test(v)) return toast("Paste a full link, starting https://");
                void saveCompany(c, { brandAssetsUrl: v || undefined });
              }}
            />
          )}
          {!c.brandAssetsUrl && !canRun && <p className="t-meta m-0 text-ink-3">No folder linked yet.</p>}
        </Card>

        <TaskList c={c} tasks={w.tasks} />
      </div>

      <div className="flex flex-col gap-4">
        <Card title={`Pending production · ${w.production.length}`} link={toContent}>
          <ContentList items={w.production} empty="Nothing waiting for a shoot or an edit." date="shootDate" />
        </Card>
        <Card title={`Pending content · ${w.toPublish.length}`} link={toContent}>
          <ContentList items={w.toPublish} empty="Nothing waiting for approval or publishing." date="publishDate" />
        </Card>
        {c.subscription && (
          <Card title="Subscription" link={<button onClick={() => setParams({ tab: "subscription" })} className="t-meta text-ink-3 hover:text-ink">Details →</button>}>
            <p className="m-0 flex flex-wrap items-center gap-2 fs-12.5">
              <b className="font-medium">{c.subscription.plan === "quarterly" ? "Quarterly" : "Monthly"}</b>
              {c.subscription.retainerPaise ? <span className="font-mono">{formatFull(c.subscription.retainerPaise)}</span> : null}
              {c.subscription.renewalDate && <span className="text-ink-3">· renews {fmtDate(c.subscription.renewalDate)}</span>}
              <Pill tone={PAY_TONE[c.subscription.paymentStatus]}>{PAYMENT_STATUS_LABEL[c.subscription.paymentStatus]}</Pill>
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}

function ContentList({ items, empty, date }: { items: ContentItem[]; empty: string; date: "shootDate" | "publishDate" }) {
  const [, setParams] = useSearchParams();
  if (!items.length) return <p className="t-meta m-0 text-ink-3">{empty}</p>;
  return (
    <ul className="m-0 flex list-none flex-col gap-1 p-0">
      {items.map((c) => (
        <li key={c.id}>
          <button onClick={() => setParams({ tab: "content" })} className="flex w-full items-center gap-3 rounded-control px-1 py-1.5 text-left hover:bg-hover">
            <span className="min-w-0 flex-1">
              <span className="t-dense block truncate font-medium">{c.title}</span>
              <span className="block fs-11.5 text-ink-3">{[c.type, c.person, c[date] && `${date === "shootDate" ? "Shoot" : "Publish"} ${fmtDate(c[date]!)}`].filter(Boolean).join(" · ")}</span>
            </span>
            <span className={cn("shrink-0 rounded-full px-2 py-0.5 fs-11 font-medium", STATUS_STYLE[c.status])}>{CONTENT_STATUS_LABEL[c.status]}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function TaskList({ c, tasks }: { c: Company; tasks: ReturnType<ReturnType<typeof useWork>>["tasks"] }) {
  const members = useCrm((s) => s.members);
  const [title, setTitle] = useState("");
  const [who, setWho] = useState(ME_ID);
  const [due, setDue] = useState(istDay(new Date().toISOString()));
  const today = istDay(new Date().toISOString());
  const sorted = [...tasks].sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  return (
    <Card title={`Task list · ${tasks.length}`} link={<Link to="/tasks" className="t-meta text-ink-3 hover:text-ink">All tasks →</Link>}>
      <ul className="m-0 flex list-none flex-col p-0">
        {sorted.slice(0, 8).map((t) => {
          const m = members.find((x) => x.id === t.assigneeId);
          const late = istDay(t.dueAt) < today;
          const st = t.status ?? "todo";
          return (
            <li key={t.id} className="flex items-center gap-2.5 border-b border-line py-2 last:border-0">
              <span className="t-dense min-w-0 flex-1 truncate">{t.title}</span>
              {m && <Avatar name={m.name} me={m.id === ME_ID} size="sm" />}
              <span className={cn("shrink-0 text-right font-mono fs-11 whitespace-nowrap", late ? "text-risk" : "text-ink-3")}>{new Date(t.dueAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" })}</span>
              <Pill tone={st === "in_progress" ? "new" : st === "review" ? "warn" : st === "pending" ? "risk" : "mute"}>{TASK_STATUS_LABEL[st]}</Pill>
            </li>
          );
        })}
        {!tasks.length && <li className="t-meta py-1 text-ink-3">No open tasks.</li>}
      </ul>
      <form
        className="mt-3 flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!title.trim()) return;
          useCrm.getState().addTask({ title: title.trim(), dueAt: `${due}T18:00:00+05:30`, assigneeId: who, companyId: c.id, business: "marketing", status: "todo", priority: "normal", approval: "none" });
          setTitle("");
          toast("Task added");
        }}
      >
        <Input aria-label="New task" placeholder="Add a task…" value={title} onChange={(e) => setTitle(e.target.value)} className="h-8 min-w-0 flex-1 basis-[160px]" />
        <Select aria-label="Assign to" value={who} onChange={(e) => setWho(e.target.value)} className="w-[130px]">{members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</Select>
        <Input type="date" aria-label="Due" value={due} onChange={(e) => setDue(e.target.value)} className="h-8 w-[140px]" />
        <Button type="submit" size="sm" disabled={!title.trim()}>Add</Button>
      </form>
    </Card>
  );
}

/** Adds months to a day, for "renews in a month / a quarter". */
const plusMonths = (day: string, n: number) => {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
};

function Subscription({ c, canRun }: { c: Company; canRun: boolean }) {
  const invoices = useCrm((s) => s.invoices).filter((i) => i.companyId === c.id && i.sent && !i.cancelled);
  const sub = c.subscription;
  const [draft, setDraft] = useState({
    plan: sub?.plan ?? ("monthly" as "monthly" | "quarterly"),
    services: (sub?.services ?? []).join(", "),
    startDate: sub?.startDate ?? "",
    renewalDate: sub?.renewalDate ?? "",
    retainer: sub?.retainerPaise ? String(sub.retainerPaise / 100) : "",
    paymentStatus: sub?.paymentStatus ?? ("pending" as PaymentStatus),
  });
  const put = (patch: Partial<typeof draft>) => setDraft({ ...draft, ...patch });
  const due = invoices.reduce((a, i) => a + invoiceTotals(i).due, 0);
  const overdue = invoices.filter((i) => invoiceStatus(i) === "overdue");
  const field = "flex flex-col gap-1";
  const lab = "t-meta text-ink-3";
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
      <form
        className={cn(tile, "flex flex-col gap-4")}
        onSubmit={(e) => {
          e.preventDefault();
          const retainerPaise = draft.retainer.trim() ? parseRupees(draft.retainer) : undefined;
          if (draft.retainer.trim() && retainerPaise === undefined) return toast("Enter the retainer like 60,000");
          void saveCompany(c, {
            subscription: {
              plan: draft.plan,
              services: draft.services.split(",").map((x) => x.trim()).filter(Boolean),
              ...(draft.startDate && { startDate: draft.startDate }),
              ...(draft.renewalDate && { renewalDate: draft.renewalDate }),
              ...(retainerPaise !== undefined && { retainerPaise }),
              paymentStatus: draft.paymentStatus,
            },
          });
          toast("Subscription saved");
        }}
      >
        <fieldset disabled={!canRun} className="m-0 flex flex-col gap-4 border-0 p-0">
          <label className={field}><span className={lab}>Plan</span>
            <Segmented label="Plan" value={draft.plan} onChange={(plan) => put({ plan, ...(draft.startDate && !draft.renewalDate && { renewalDate: plusMonths(draft.startDate, plan === "quarterly" ? 3 : 1) }) })} options={[{ value: "monthly", label: "Monthly" }, { value: "quarterly", label: "Quarterly" }]} className="self-start" />
          </label>
          <label className={field}><span className={lab}>Services included (separate with commas)</span>
            <Input value={draft.services} onChange={(e) => put({ services: e.target.value })} placeholder="8 reels, 4 carousels, Meta ads, monthly report" />
          </label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className={field}><span className={lab}>Start date</span>
              <Input type="date" value={draft.startDate} onChange={(e) => put({ startDate: e.target.value, ...(e.target.value && !draft.renewalDate && { renewalDate: plusMonths(e.target.value, draft.plan === "quarterly" ? 3 : 1) }) })} />
            </label>
            <label className={field}><span className={lab}>Renewal date</span>
              <Input type="date" value={draft.renewalDate} onChange={(e) => put({ renewalDate: e.target.value })} />
            </label>
            <label className={field}><span className={lab}>{draft.plan === "quarterly" ? "Retainer per quarter" : "Monthly retainer"}</span>
              <AmountInput value={draft.retainer} onValue={(retainer) => put({ retainer })} placeholder="60,000" />
            </label>
          </div>
          <label className={field}><span className={lab}>Payment status</span>
            <Segmented label="Payment status" value={draft.paymentStatus} onChange={(paymentStatus) => put({ paymentStatus })} options={PAYMENT_STATUSES.map((p) => ({ value: p, label: PAYMENT_STATUS_LABEL[p] }))} className="self-start" />
          </label>
          {canRun && <Button type="submit" variant="ink" className="self-start">Save subscription</Button>}
        </fieldset>
      </form>

      <section className={cn(tile, "flex flex-col gap-3")}>
        <h2 className="t-eyebrow m-0 text-ink-3">From their invoices</h2>
        <p className="m-0 font-serif fs-30 leading-none tnum">{formatCompact(due)}</p>
        <p className="t-meta m-0 text-ink-3">still to collect, across {invoices.length} sent {invoices.length === 1 ? "invoice" : "invoices"}</p>
        {overdue.length > 0 && <p className="t-meta m-0 text-risk">{overdue.length} overdue — set the payment status to Overdue</p>}
        {draft.renewalDate && draft.renewalDate <= plusMonths(istDay(new Date().toISOString()), 0).slice(0, 10) && <p className="t-meta m-0 text-warn">The renewal date has passed: renew or update it.</p>}
        <Link to="/invoices" className="t-meta text-ink-3 hover:text-ink">Invoices →</Link>
      </section>
    </div>
  );
}
