import { CHANNEL_LABEL, fmtDate, fmtDay, formatFull, HEALTH_LABEL, lakh, rupees, BUSINESS_LABEL, BUSINESSES, type Business } from "@pinnacle/shared";
import {
  Avatar,
  Button,
  ChannelChip,
  cn,
  Input,
  Menu,
  MenuContent,
  MenuItem,
  MenuTrigger,
  MoneyText,
  Pill,
  Select,
  Textarea,
  toast,
} from "@pinnacle/ui";
import { FileText, MoreHorizontal, Paperclip } from "lucide-react";
import { motion } from "motion/react";
import { useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router";
import { invoiceStatus, invoiceTotals } from "../../data/derive";
import { probabilityOf } from "../../data/pipeline";
import { useCanEdit, useCrm, useIsManager } from "../../data/store";
import type { Deal } from "../../data/types";
import { changeStage } from "../../lib/actions";
import { useUi } from "../../lib/ui-store";
import { Timeline } from "./timeline";

const healthTone = { ok: "ok", warn: "warn", risk: "risk" } as const;
const statusTone = { draft: "mute", sent: "mute", partial: "warn", paid: "ok", overdue: "risk", cancelled: "mute", credited: "mute" } as const;
const FILES: Record<string, [string, string][]> = {
  "d-atlas": [["Retainer_Scope_v3.pdf", "PDF · 240 KB"], ["Brand_Guidelines_2025.pdf", "PDF · 3.1 MB"]],
  "d-northwind": [["Northwind_Launch_Film_Proposal.pdf", "PDF · 1.8 MB"]],
};

export function DealHeading({ deal, size = "sheet" }: { deal: Deal; size?: "sheet" | "page" }) {
  const company = useCrm((s) => s.companies.find((c) => c.id === deal.companyId));
  const value = deal.valuePaise / 100;
  const isCr = value >= 1_00_00_000;
  return (
    <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
      <div className="min-w-0 flex-1">
        <p className="t-eyebrow m-0 mb-2 flex items-center gap-2 text-ink-3">
          Deal <ChannelChip channel={deal.channel} />
        </p>
        <h1 className={cn("m-0", size === "page" ? "t-title" : "t-sheet")}>{company?.name}</h1>
        <p className="t-dense m-0 mt-1 text-ink-2">{deal.title}</p>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="font-mono text-[14px] text-ink-2">₹</span>
        <span className={cn("font-serif leading-none tnum", size === "page" ? "text-[44px]" : "text-[32px]")}>
          {isCr ? (value / 1_00_00_000).toFixed(2) : (value / 1_00_000).toFixed(1)}
        </span>
        <span className="font-mono text-[13px] text-ink-2">{isCr ? "Cr" : "L"}</span>
        <Pill tone={deal.stage === "lost" ? "mute" : healthTone[deal.health]} className="ml-2 self-center">
          {deal.stage === "lost" ? "Lost" : deal.stage === "won" ? "Won" : HEALTH_LABEL[deal.health]}
        </Pill>
      </div>
    </div>
  );
}

export function NextStep({ deal }: { deal: Deal }) {
  const update = useCrm((s) => s.updateDeal);
  const canEdit = useCanEdit(deal.ownerId);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(deal.nextStep ?? "");
  if (deal.stage === "won" || deal.stage === "lost") return null;
  return (
    <div className="rounded-card border border-signal p-4">
      <div className="mb-1.5 flex items-center">
        <span className="t-eyebrow text-signal">Next step</span>
        {!editing && canEdit && (
          <button className="ml-auto text-[12px] text-ink-3 hover:text-ink" onClick={() => setEditing(true)}>
            Edit
          </button>
        )}
      </div>
      {editing ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            update(deal.id, { nextStep: text.trim() });
            setEditing(false);
          }}
          className="flex flex-col gap-2"
        >
          <Textarea autoFocus value={text} onChange={(e) => setText(e.target.value)} className="min-h-[60px]" aria-label="Next step" />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>Cancel</Button>
            <Button type="submit" variant="ink" size="sm">Save</Button>
          </div>
        </form>
      ) : (
        <p className="t-dense m-0">{deal.nextStep || <span className="text-ink-3">No next step set. What happens next, and when?</span>}</p>
      )}
    </div>
  );
}

function Prop({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="flex h-[34px] items-center text-ink-3">{label}</dt>
      <dd className="m-0 flex min-h-[34px] min-w-0 items-center">{children}</dd>
    </>
  );
}

export function DealProperties({ deal }: { deal: Deal }) {
  const s = useCrm();
  const company = s.companies.find((c) => c.id === deal.companyId);
  const contact = s.contacts.find((c) => c.id === deal.contactId);
  const canEdit = useCanEdit(deal.ownerId);
  return (
    // A disabled fieldset disables every control inside: Members can't change other people's deals.
    <fieldset disabled={!canEdit} className="m-0 min-w-0 border-0 p-0" title={canEdit ? undefined : "Only the deal's owner or a manager can change it"}>
    <dl className="m-0 grid grid-cols-[110px_minmax(0,1fr)] gap-x-3 t-dense">
      <Prop label="Owner">
        <Select
          aria-label="Owner"
          value={deal.ownerId}
          onChange={(e) => {
            s.updateDeal(deal.id, { ownerId: e.target.value });
            toast(`Owner changed to ${s.members.find((m) => m.id === e.target.value)?.name}`);
          }}
        >
          {s.members.map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </Select>
      </Prop>
      <Prop label="Value">
        <label className="flex w-full items-center rounded-control bg-sunken pl-3 focus-within:bg-surface focus-within:ring-1 focus-within:ring-line-2">
          <span className="font-mono text-[12.5px] text-ink-3">₹</span>
          <input
            aria-label="Deal value in lakh"
            type="number"
            step="0.1"
            min="0"
            defaultValue={(deal.valuePaise / 1e7).toFixed(1)}
            onBlur={(e) => {
              const v = parseFloat(e.target.value);
              if (!Number.isNaN(v) && lakh(v) !== deal.valuePaise) s.updateDeal(deal.id, { valuePaise: lakh(v) });
            }}
            className="h-[34px] w-full bg-transparent px-1.5 font-mono text-[12.5px] tnum outline-none"
          />
          <span className="pr-3 font-mono text-[12.5px] text-ink-3">L</span>
        </label>
      </Prop>
      <Prop label="">
        <span className="font-mono text-[12px] text-ink-3 tnum">{formatFull(deal.valuePaise)} · {Math.round(probabilityOf(s.pipelines, deal) * 100)}% · weighted {formatFull(rupees(deal.valuePaise / 100 * probabilityOf(s.pipelines, deal)))}</span>
      </Prop>
      <Prop label="Close date">
        <input
          type="date"
          aria-label="Close date"
          defaultValue={deal.closeAt.slice(0, 10)}
          onChange={(e) => e.target.value && s.updateDeal(deal.id, { closeAt: new Date(e.target.value + "T10:00:00").toISOString() })}
          className="h-[34px] w-full rounded-control bg-sunken px-3 font-mono text-[12.5px] text-ink outline-none focus-visible:bg-surface"
        />
      </Prop>
      <Prop label="Health">
        <Select aria-label="Health" value={deal.health} onChange={(e) => s.updateDeal(deal.id, { health: e.target.value as Deal["health"] })}>
          <option value="ok">On track</option>
          <option value="warn">Watch</option>
          <option value="risk">At risk</option>
        </Select>
      </Prop>
      <Prop label="Business">
        <Select aria-label="Business" value={deal.business ?? ""} onChange={(e) => e.target.value && s.updateDeal(deal.id, { business: e.target.value as Business })}>
          {!deal.business && <option value="">Not set</option>}
          {BUSINESSES.map((b) => <option key={b} value={b}>{BUSINESS_LABEL[b]}</option>)}
        </Select>
      </Prop>
      <Prop label="Contact">
        {contact ? (
          <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5">
            <span className="truncate">{contact.name}</span>
            {contact.phone && <a href={`tel:${contact.phone.replace(/\s/g, "")}`} className="font-mono text-[12px] text-ink-2 hover:text-ink">{contact.phone}</a>}
            {contact.email && <a href={`mailto:${contact.email}`} className="truncate font-mono text-[12px] text-ink-2 hover:text-ink">{contact.email}</a>}
          </span>
        ) : (
          <span className="text-ink-3">—</span>
        )}
      </Prop>
      <Prop label="Next follow-up">
        <span className="flex items-center gap-2">
          <Input
            type="date"
            aria-label="Next follow-up"
            value={deal.nextFollowUpAt ? new Date(deal.nextFollowUpAt).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }) : ""}
            onChange={(e) => s.updateDeal(deal.id, { nextFollowUpAt: e.target.value ? `${e.target.value}T10:00:00+05:30` : null })}
            className={cn("h-8 w-[150px] font-mono", deal.nextFollowUpAt && +new Date(deal.nextFollowUpAt) < Date.now() && "text-risk")}
          />
          {deal.nextFollowUpAt && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                s.updateDeal(deal.id, { nextFollowUpAt: null });
                s.addActivity({ type: "call", dealId: deal.id, companyId: deal.companyId, text: "followed up" });
              }}
            >
              Done
            </Button>
          )}
        </span>
      </Prop>
      <Prop label="Service">
        <Input key={`svc-${deal.id}`} defaultValue={deal.service ?? ""} placeholder="—" onBlur={(e) => e.target.value.trim() !== (deal.service ?? "") && s.updateDeal(deal.id, { service: e.target.value.trim() })} className="h-8" />
      </Prop>
      <Prop label="Location">
        <Input key={`loc-${deal.id}`} defaultValue={deal.location ?? ""} placeholder="—" onBlur={(e) => e.target.value.trim() !== (deal.location ?? "") && s.updateDeal(deal.id, { location: e.target.value.trim() })} className="h-8" />
      </Prop>
      {(deal.business ?? "photography") === "photography" && (
        <Prop label="Event date">
          <Input type="date" aria-label="Event date" value={deal.eventDate ?? ""} onChange={(e) => e.target.value && s.updateDeal(deal.id, { eventDate: e.target.value })} className="h-8 w-[150px] font-mono" />
        </Prop>
      )}
      <Prop label="Requirements">
        <Textarea key={`req-${deal.id}`} rows={2} defaultValue={deal.requirements ?? ""} placeholder="—" onBlur={(e) => e.target.value.trim() !== (deal.requirements ?? "") && s.updateDeal(deal.id, { requirements: e.target.value.trim() })} />
      </Prop>
      <Prop label="Source">
        <span className="flex items-center gap-2"><ChannelChip channel={deal.channel} /> {CHANNEL_LABEL[deal.channel]}</span>
      </Prop>
      <Prop label="Client">
        {company ? (
          <Link to={`/clients/${company.id}`} onClick={() => useUi.getState().closeDeal()} className="truncate hover:underline">
            {company.name}
          </Link>
        ) : (
          <span className="text-ink-3">—</span>
        )}
      </Prop>
      <Prop label="City">{company?.city}</Prop>
      <Prop label="Created"><span className="font-mono text-[12.5px]">{fmtDate(deal.createdAt)}</span></Prop>
      {deal.lostReason && <Prop label="Lost reason">{deal.lostReason}</Prop>}
    </dl>
    </fieldset>
  );
}

export function NoteComposer({ dealId }: { dealId: string }) {
  const addNote = useCrm((s) => s.addNote);
  const [text, setText] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!text.trim()) return;
        addNote(dealId, text.trim());
        setText("");
        toast("Note added");
      }}
      className="flex flex-col gap-2"
    >
      <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a note…" aria-label="Add a note" className="min-h-[64px]" />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={() => useUi.getState().openComposer("call", { dealId })}>Log call</Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => useUi.getState().openComposer("task", { dealId })}>Add task</Button>
        <Button type="submit" variant="ink" size="sm" disabled={!text.trim()}>Save note</Button>
      </div>
    </form>
  );
}

export function DealActivity({ deal }: { deal: Deal }) {
  const acts = useCrm((s) => s.activities).filter((a) => a.dealId === deal.id);
  return (
    <div className="flex flex-col gap-5">
      <NoteComposer dealId={deal.id} />
      <motion.div layout>
        <Timeline items={acts} />
      </motion.div>
    </div>
  );
}

export function DealSide({ deal }: { deal: Deal }) {
  const isManager = useIsManager();
  const s = useCrm();
  const contacts = s.contacts.filter((c) => c.companyId === deal.companyId);
  const invoices = s.invoices.filter((i) => i.dealId === deal.id);
  const files = FILES[deal.id] ?? [];
  return (
    <div className="flex flex-col gap-6">
      <section>
        <h3 className="t-eyebrow m-0 mb-2 text-ink-3">People · {contacts.length}</h3>
        <ul className="m-0 list-none p-0">
          {contacts.map((c) => (
            <li key={c.id} className="flex items-center gap-2.5 border-b border-line py-2 last:border-0">
              <Avatar name={c.name} size="md" />
              <div className="min-w-0 leading-tight">
                <div className="t-dense truncate font-medium">{c.name}{c.id === deal.contactId && <span className="ml-1.5 text-[11px] font-normal text-ink-3">primary</span>}</div>
                <div className="truncate text-[11.5px] text-ink-3">{c.title} · {c.email ?? c.phone ?? c.handle}</div>
              </div>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h3 className="t-eyebrow m-0 mb-2 text-ink-3">Invoices · {invoices.length}</h3>
        {invoices.length ? (
          <ul className="m-0 list-none p-0">
            {invoices.map((i) => {
              const st = invoiceStatus(i);
              return (
                <li key={i.id} className="flex items-center gap-2.5 border-b border-line py-2 last:border-0">
                  <FileText size={14} strokeWidth={1.5} className="text-ink-3" />
                  <span className="flex-1 truncate font-mono text-[12px]">{i.number}</span>
                  <MoneyText paise={invoiceTotals(i).total} className="text-[12px]" />
                  <Pill tone={statusTone[st]}>{st[0]!.toUpperCase() + st.slice(1)}</Pill>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="t-meta m-0 text-ink-3">None yet.{deal.stage !== "won" && " Raise one once the deal is won."}</p>
        )}
        {deal.stage === "won" && isManager && (
          <Button size="sm" className="mt-2" onClick={() => useUi.getState().openComposer("invoice", { dealId: deal.id })}>
            <FileText strokeWidth={1.5} /> Raise invoice
          </Button>
        )}
      </section>
      <section>
        <h3 className="t-eyebrow m-0 mb-2 text-ink-3">Files · {files.length}</h3>
        {files.length ? (
          <ul className="m-0 list-none p-0">
            {files.map(([n, meta]) => (
              <li key={n} className="flex items-center gap-2.5 border-b border-line py-2 last:border-0">
                <Paperclip size={14} strokeWidth={1.5} className="text-ink-3" />
                <span className="t-dense min-w-0 flex-1 truncate">{n}</span>
                <span className="font-mono text-[11px] text-ink-3">{meta}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="t-meta m-0 text-ink-3">Drop proposals, SOWs and contracts here (Cloud Storage, M3).</p>
        )}
      </section>
    </div>
  );
}

export function DealMenu({ deal }: { deal: Deal }) {
  const navigate = useNavigate();
  return (
    <Menu>
      <MenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="More actions">
          <MoreHorizontal strokeWidth={1.5} />
        </Button>
      </MenuTrigger>
      <MenuContent align="end">
        <MenuItem
          onSelect={() => {
            useUi.getState().closeDeal();
            navigate(`/deals/${deal.id}`, { viewTransition: true });
          }}
        >
          Open full record
        </MenuItem>
        {deal.stage !== "won" && <MenuItem onSelect={() => changeStage(deal.id, "won")}>Mark as won</MenuItem>}
        {deal.stage !== "lost" ? (
          <MenuItem tone="risk" onSelect={() => changeStage(deal.id, "lost")}>Mark as lost</MenuItem>
        ) : (
          <MenuItem onSelect={() => changeStage(deal.id, "new")}>Reopen in New</MenuItem>
        )}
      </MenuContent>
    </Menu>
  );
}

export const closeLabel = (d: Deal) => fmtDay(d.closeAt);
