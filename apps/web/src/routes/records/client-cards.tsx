import { addDays, BUSINESS_LABEL, clientJourney, fmtDate, fmtDay, formatCompact, invoiceTotals, istDay, type Milestone } from "@pinnacle/shared";
import { Avatar, Button, Checkbox, cn, Pill, Sheet, toast } from "@pinnacle/ui";
import { ArrowRight, Camera, Check, ExternalLink, Flag, FolderKanban, MessageCircle, Phone } from "lucide-react";
import { motion } from "motion/react";
import { useRef, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router";
import { taskGroup } from "../../data/derive";
import { ME_ID } from "../../data/seed";
import { DoneBy } from "../../components/done-by";
import { useAccess, useCanEdit, useCrm } from "../../data/store";
import type { Company, Task } from "../../data/types";
import { api } from "../../lib/api";
import { IS_DEMO } from "../../lib/demo";

type State = ReturnType<typeof useCrm.getState>;

/** Everything a client's card and panel show, worked out from the records already loaded. */
export function clientSummary(c: Company, s: State, now = new Date()) {
  const today = istDay(now);
  const deals = s.deals.filter((d) => d.companyId === c.id);
  const won = deals.filter((d) => d.stage === "won").sort((a, b) => (b.wonAt ?? "").localeCompare(a.wonAt ?? ""));
  const deal = won[0] ?? deals.filter((d) => d.stage !== "lost").sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? deals[0];
  const projects = s.projects.filter((p) => p.companyId === c.id);
  const live = projects.filter((p) => p.status === "planning" || p.status === "active");
  const project = live.find((p) => p.dealId === deal?.id) ?? live[0] ?? projects.find((p) => p.dealId === deal?.id);
  const journey = clientJourney({ deal, project, invoices: s.invoices }, now);
  const next = journey.find((m) => m.current);

  const tasks = s.tasks.filter((t) => (t.companyId ?? s.projects.find((p) => p.id === t.projectId)?.companyId ?? s.deals.find((d) => d.id === t.dealId)?.companyId) === c.id);
  const open = tasks.filter((t) => !t.done).sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  const recentlyDone = tasks.filter((t) => t.done).sort((a, b) => (b.doneAt ?? "").localeCompare(a.doneAt ?? "")).slice(0, 5);
  const projectTasks = tasks.filter((t) => live.some((p) => p.id === t.projectId));
  const progress = projectTasks.length ? Math.round((projectTasks.filter((t) => t.done).length / projectTasks.length) * 100) : null;

  const invoices = s.invoices.filter((i) => i.companyId === c.id && i.sent && !i.cancelled);
  const due = invoices.reduce((a, i) => a + invoiceTotals(i).due, 0);
  const overdue = invoices.filter((i) => istDay(i.dueAt) < today).reduce((a, i) => a + invoiceTotals(i).due, 0);
  const money = overdue > 100 ? { text: `${formatCompact(overdue)} overdue`, tone: "risk" as const } : due > 100 ? { text: `${formatCompact(due)} due`, tone: "warn" as const } : invoices.length ? { text: "Paid up", tone: "ok" as const } : undefined;

  // The countdown on the photo: days to the next function, the retainer month, or where a prospect stands.
  const nextEvent = project?.events.filter((e) => e.date && e.date >= today).sort((a, b) => a.date!.localeCompare(b.date!))[0] ?? (deal?.eventDate && deal.eventDate >= today ? { name: "Event", date: deal.eventDate } : undefined);
  const days = nextEvent ? Math.round((Date.parse(nextEvent.date!) - Date.parse(today)) / 86_400_000) : undefined;
  const delivered = projects.length > 0 && !live.length;
  const isClient = !!c.clientSince || won.length > 0;
  const countdown = delivered
    ? "Delivered"
    : days !== undefined
      ? days === 0 ? `${nextEvent!.name} today` : days === 1 ? `${nextEvent!.name} tomorrow` : `${days} days to go`
      : project?.business === "marketing"
        ? project.cycles?.length ? `Month ${project.cycles.length}` : "Retainer"
        : isClient ? "In progress" : "Prospect";
  const week = addDays(today, 7);
  const thisWeek = !delivered && journey.some((m) => !m.done && m.date && m.date >= today && m.date <= week);
  const needsApproval = open.filter((t) => t.approval === "pending").length;
  return { deal, project, journey, next, open, recentlyDone, progress, money, due, overdue, countdown, days, thisWeek, delivered, needsApproval, isClient, nextEventDate: nextEvent?.date };
}

/** Shrinks a photo on the device to an 800×400 card crop (WebP, ~50 KB) before it's uploaded. */
async function cardImage(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Pick a photo (JPEG, PNG or WebP)");
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, fail) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => fail(new Error("That file couldn't be opened as a photo"));
      i.src = url;
    });
    const W = 800, H = 400;
    const scale = Math.max(W / img.naturalWidth, H / img.naturalHeight);
    const w = img.naturalWidth * scale, h = img.naturalHeight * scale;
    const canvas = Object.assign(document.createElement("canvas"), { width: W, height: H });
    canvas.getContext("2d")!.drawImage(img, (W - w) / 2, (H - h) * 0.35, w, h); // faces tend to sit in the upper part
    const webp = canvas.toDataURL("image/webp", 0.82);
    return webp.startsWith("data:image/webp") ? webp : canvas.toDataURL("image/jpeg", 0.85); // older Safari can't write WebP
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function uploadClientPhoto(c: Company, file: File) {
  try {
    const dataUrl = await cardImage(file);
    if (dataUrl.length > 540_000) throw new Error("That photo is too large even after shrinking");
    const saved = IS_DEMO ? { ...c, photo: dataUrl } : await api<Company>(`/companies/${c.id}/photo`, { method: "POST", body: { dataUrl } });
    useCrm.setState((st) => ({ companies: st.companies.map((x) => (x.id === c.id ? { ...x, photo: saved.photo } : x)) }));
    toast("Photo saved");
  } catch (e) {
    toast(`Couldn't save the photo — ${(e as Error).message}`);
  }
}

/** "Riya & Arjun" → "R & A"; "Brewhouse 27" → "B2". */
function initials(name: string) {
  const couple = name.split("&").map((p) => p.trim()).filter(Boolean);
  if (couple.length > 1) return couple.slice(0, 2).map((p) => p[0]!.toUpperCase()).join(" & ");
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");
}

/** The photo strip: the client's picture, or their initials on the business colour. Drop a file on it to upload. */
/** A rich colour panel for clients without a photo (wedding: the studio's rose; marketing: teal). */
const panelColour = (c: Company) =>
  c.business === "marketing"
    ? "linear-gradient(135deg, color-mix(in srgb, var(--ok) 85%, black), color-mix(in srgb, var(--ok) 45%, black))"
    : "linear-gradient(135deg, color-mix(in srgb, var(--signal) 90%, black), color-mix(in srgb, var(--signal) 45%, black))";

/**
 * The photo strip: the client's picture (fades in, zooms slowly on hover), or their initials on the business
 * colour. Drop a file on it — or use the camera button — to upload.
 */
export function Cover({ company, canUpload, className, children, hoverZoom }: { company: Company; canUpload: boolean; className?: string; children?: ReactNode; hoverZoom?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [loaded, setLoaded] = useState(false);
  return (
    <div
      className={cn("group/cover relative overflow-hidden", over && "ring-2 ring-inset ring-ink", className)}
      style={company.photo ? undefined : { background: panelColour(company) }}
      onDragOver={(e) => {
        if (!canUpload) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const f = e.dataTransfer.files[0];
        if (canUpload && f) void uploadClientPhoto(company, f);
      }}
    >
      {company.photo ? (
        <img
          key={company.photo}
          src={company.photo}
          alt=""
          onLoad={() => setLoaded(true)}
          className={cn(
            "absolute inset-0 size-full object-cover",
            "motion-safe:transition-[opacity,transform] motion-safe:duration-[900ms] motion-safe:ease-out",
            loaded ? "scale-100 opacity-100" : "scale-[1.06] opacity-0",
            hoverZoom && "motion-safe:group-hover/card:scale-[1.07] motion-safe:group-hover/card:duration-[2400ms]",
          )}
        />
      ) : (
        <span aria-hidden className={cn("absolute inset-0 grid place-items-center font-serif text-[56px] tracking-wide text-white/25 select-none", hoverZoom && "motion-safe:transition-transform motion-safe:duration-[1200ms] motion-safe:group-hover/card:scale-110")}>
          {initials(company.name)}
        </span>
      )}
      {canUpload && (
        <>
          <input ref={input} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadClientPhoto(company, f); e.target.value = ""; }} />
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); input.current?.click(); }}
            className={cn(
              "absolute top-3 left-3 z-[2] flex items-center gap-1.5 rounded-full bg-black/45 px-3 py-1.5 text-[12px] text-white backdrop-blur-sm transition-opacity hover:bg-black/60",
              company.photo ? "opacity-0 group-hover/cover:opacity-100 focus-visible:opacity-100" : "opacity-90",
            )}
          >
            <Camera size={14} strokeWidth={1.5} /> {company.photo ? "Change photo" : "Add photo"}
          </button>
        </>
      )}
      {children}
    </div>
  );
}

/** Progress ring that draws itself when the card appears. */
function Ring({ pct }: { pct: number }) {
  const r = 17, len = 2 * Math.PI * r;
  return (
    <svg width="44" height="44" viewBox="0 0 44 44" role="img" aria-label={`${pct}% of the work done`} className="shrink-0">
      <circle cx="22" cy="22" r={r} fill="none" stroke="var(--line)" strokeWidth="4" />
      <motion.circle
        cx="22" cy="22" r={r} fill="none" stroke="var(--ok)" strokeWidth="4" strokeLinecap="round" transform="rotate(-90 22 22)"
        strokeDasharray={len}
        initial={{ strokeDashoffset: len }}
        animate={{ strokeDashoffset: len - (len * pct) / 100 }}
        transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1], delay: 0.25 }}
      />
      <text x="22" y="26" textAnchor="middle" fontSize="11" fontWeight="500" fill="var(--ink)">{pct}%</text>
    </svg>
  );
}

/** One client as a card: photo with their name, countdown, progress, next milestone and money. Click → their panel. */
export function ClientCard({ company, onOpen, index = 0 }: { company: Company; onOpen: () => void; index?: number }) {
  const s = useCrm();
  const canEditClient = useCanEdit(company.ownerId);
  const runsProjects = useAccess("projects") === "edit";
  const canUpload = canEditClient || runsProjects;
  const x = clientSummary(company, s);
  const owner = s.members.find((m) => m.id === company.ownerId);
  return (
    <motion.div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } }}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1], delay: Math.min(index, 12) * 0.05 }}
      whileHover={{ y: -4 }}
      className={cn(
        "group/card flex cursor-pointer flex-col overflow-hidden rounded-[16px] border border-line bg-surface text-left shadow-rest transition-shadow duration-300 hover:shadow-pop focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
        x.delivered && "opacity-85",
      )}
    >
      <Cover company={company} canUpload={canUpload} hoverZoom className="h-[220px]">
        {/* A soft fade so the name reads on any photo. */}
        <span aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-[62%] bg-gradient-to-t from-black/75 via-black/30 to-transparent" />
        <span className="absolute top-3 right-3 z-[1] flex flex-col items-end gap-1.5">
          <span className="rounded-full bg-black/45 px-2.5 py-1 font-mono text-[11px] text-white backdrop-blur-sm">{x.countdown}</span>
          {x.thisWeek && <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-black motion-safe:animate-pulse">This week</span>}
        </span>
        <span className="absolute inset-x-4 bottom-3.5 z-[1] text-white">
          <span className="block truncate font-serif text-[22px] leading-tight drop-shadow-sm">{company.name}</span>
          <span className="block truncate text-[12px] text-white/80">{[company.business && BUSINESS_LABEL[company.business], x.nextEventDate && fmtDate(x.nextEventDate), company.city].filter(Boolean).join(" · ") || " "}</span>
        </span>
      </Cover>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-center gap-3">
          <span className="min-w-0 flex-1">
            <span className="t-eyebrow block text-ink-3">{x.next ? (x.next.late ? "Late" : "Next") : x.delivered ? "Delivered" : "Status"}</span>
            {x.next ? (
              <span className={cn("t-dense mt-0.5 flex items-start gap-1.5", x.next.late ? "text-risk" : "text-ink")}>
                <Flag size={14} strokeWidth={1.5} className="mt-0.5 shrink-0" />
                <span className="min-w-0">{x.next.label}{x.next.date && <span className="text-ink-3"> · {fmtDay(x.next.date)}</span>}</span>
              </span>
            ) : (
              <span className="t-dense mt-0.5 block text-ink-2">{x.isClient ? "All caught up" : "Lead in progress"}</span>
            )}
          </span>
          {x.progress !== null && <Ring pct={x.progress} />}
        </div>
        <span className="flex flex-wrap gap-1.5">
          {x.money && <Pill tone={x.money.tone}>{x.money.text}</Pill>}
          {x.needsApproval > 0 && <Pill tone="warn">{x.needsApproval} awaiting client</Pill>}
          {x.open.length > 0 && <Pill tone="mute">{x.open.length} open {x.open.length === 1 ? "task" : "tasks"}</Pill>}
        </span>
        <span className="mt-auto flex items-center gap-2 border-t border-line pt-3 text-[12px] text-ink-3">
          {owner && <Avatar name={owner.name} me={owner.id === ME_ID} size="sm" />}
          <span className="min-w-0 flex-1 truncate">{owner?.name ?? "Unassigned"}</span>
          <span className="flex items-center gap-1 text-ink-2 opacity-0 transition-all duration-300 group-hover/card:translate-x-0.5 group-hover/card:opacity-100">
            Journey <ArrowRight size={13} strokeWidth={1.5} />
          </span>
        </span>
      </div>
    </motion.div>
  );
}

const KIND_LABEL: Record<Milestone["kind"], string> = { lead: "Enquiry", booking: "Booking", payment: "Payment", event: "Function", deliverable: "Deliverable", month: "Month" };

/** The client at a glance: their journey (milestones that tick themselves off) and open tasks, with quick actions. */
export function ClientPanel({ company, onClose }: { company?: Company; onClose: () => void }) {
  const s = useCrm();
  const navigate = useNavigate();
  const canEditClient = useCanEdit(company?.ownerId);
  const runsProjects = useAccess("projects") === "edit";
  const canUpload = canEditClient || runsProjects;
  if (!company) return <Sheet open={false} onOpenChange={() => {}} title="">{null}</Sheet>;
  const x = clientSummary(company, s);
  const contact = s.contacts.find((p) => p.id === x.deal?.contactId) ?? s.contacts.find((p) => p.companyId === company.id && p.phone) ?? s.contacts.find((p) => p.companyId === company.id);
  const phone = contact?.phone?.replace(/\D/g, "");
  const wa = phone && (phone.length === 10 ? `91${phone}` : phone);
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()} eyebrow={[company.business && BUSINESS_LABEL[company.business], x.countdown].filter(Boolean).join(" · ")} title={company.name}>
      <div className="flex flex-col gap-6">
        <Cover company={company} canUpload={canUpload} className="h-[150px] rounded-card" />
        <div className="flex flex-wrap gap-2">
          {wa && <Button size="sm" asChild><a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer"><MessageCircle strokeWidth={1.5} /> WhatsApp</a></Button>}
          {phone && <Button size="sm" variant="ghost" asChild><a href={`tel:+${wa}`}><Phone strokeWidth={1.5} /> Call</a></Button>}
          {x.project && <Button size="sm" variant="ghost" onClick={() => { onClose(); navigate(`/projects/${x.project!.id}`); }}><FolderKanban strokeWidth={1.5} /> Project</Button>}
          <Button size="sm" variant="ghost" onClick={() => { onClose(); navigate(`/clients/${company.id}`); }}><ExternalLink strokeWidth={1.5} /> Full page</Button>
        </div>

        <section>
          <h3 className="t-eyebrow m-0 mb-2 text-ink-3">Journey</h3>
          {x.journey.length ? (
            <ol className="m-0 list-none p-0">
              {x.journey.map((m, i) => (
                <li key={m.key} className="relative flex gap-3 pb-3 last:pb-0">
                  {i < x.journey.length - 1 && <span aria-hidden className={cn("absolute top-5 left-[9px] h-[calc(100%-12px)] w-[2px]", m.done ? "bg-ok" : "bg-line")} />}
                  <span aria-hidden className={cn("relative z-[1] mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border-2", m.done ? "border-ok bg-ok text-on-ink" : m.current ? (m.late ? "border-risk bg-risk-wash" : "border-ink bg-surface") : "border-line-2 bg-surface")}>
                    {m.done && <Check size={11} strokeWidth={3} />}
                  </span>
                  <span className="min-w-0 flex-1 leading-tight">
                    <span className={cn("t-dense block", m.current && "font-medium", m.late && "text-risk")}>{m.label}</span>
                    <span className="text-[11.5px] text-ink-3">{KIND_LABEL[m.kind]}{m.date && ` · ${fmtDate(m.date)}`}{m.late && " · late"}{m.current && !m.late && " · next"}</span>
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="t-dense m-0 text-ink-3">The journey starts with their first lead.</p>
          )}
        </section>

        <section>
          <h3 className="t-eyebrow m-0 mb-2 text-ink-3">Open tasks · {x.open.length}</h3>
          <ul className="m-0 list-none border-t border-line p-0">
            {x.open.map((t: Task) => {
              const who = s.members.find((m) => m.id === t.assigneeId);
              return (
                <li key={t.id} className="flex items-center gap-2.5 border-b border-line py-2">
                  <Checkbox checked={t.done} label={t.title} onCheckedChange={() => useCrm.getState().toggleTask(t.id)} />
                  <span className="min-w-0 flex-1 leading-tight">
                    <span className="t-dense block truncate">{t.title}</span>
                    {t.approval === "pending" && <span className="text-[11px] text-warn">Awaiting client approval</span>}
                  </span>
                  <span className={cn("font-mono text-[11.5px]", taskGroup(t) === "overdue" ? "text-risk" : "text-ink-3")}>{fmtDay(t.dueAt)}</span>
                  {who && <Avatar name={who.name} me={who.id === ME_ID} size="sm" />}
                </li>
              );
            })}
            {!x.open.length && <li className="t-dense py-2 text-ink-3">Nothing open.</li>}
          </ul>
        </section>
        {x.recentlyDone.length > 0 && (
          <section>
            <h3 className="t-eyebrow m-0 mb-2 text-ink-3">Recently completed</h3>
            <ul className="m-0 list-none border-t border-line p-0">
              {x.recentlyDone.map((t) => (
                <li key={t.id} className="flex items-center gap-2.5 border-b border-line py-2">
                  <Check size={14} strokeWidth={2} className="shrink-0 text-ok" />
                  <span className="t-dense min-w-0 flex-1 truncate text-ink-2">{t.title}</span>
                  <DoneBy t={t} short />
                </li>
              ))}
            </ul>
          </section>
        )}
        <Link to={`/clients/${company.id}`} onClick={onClose} className="t-meta text-ink-3 hover:text-ink">Everything about {company.name} — history, invoices, files →</Link>
      </div>
    </Sheet>
  );
}
