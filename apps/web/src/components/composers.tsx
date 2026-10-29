import { parseRupees, ROLE_LABEL, roleOf, BUSINESS_LABEL, BUSINESSES, CHANNEL_LABEL, CHANNELS, formatCompact, formatFull, gstState, invoiceTotals, rupees, type Business, type Channel, type Stage, SERVICES, stageIn } from "@pinnacle/shared";
import { Segmented, Button, Input, Select, Sheet, Textarea, toast } from "@pinnacle/ui";
import { Plus, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { Link } from "react-router";
import { ME_ID } from "../data/seed";
import { AmountInput } from "./amount-input";
import { defaultBusiness, defaultOwnerId, useAccess, useCrm, useCanAssign, useMe } from "../data/store";
import type { Company, Contact, Deal, Invoice } from "../data/types";
import { api, save } from "../lib/api";
import { useUi } from "../lib/ui-store";
import { runFor } from "../data/pipeline";

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="fs-12.5 font-medium">{label}</span>
      {children}
      {hint && <span className="fs-11.5 text-ink-3">{hint}</span>}
    </label>
  );
}

const plusDays = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

/** New lead, laid out like the client's brief. Creates the client (company or couple) and contact with it. */
function NewDealForm({ stage, business: initialBusiness, onDone }: { stage?: string; business?: Business; onDone: () => void }) {
  const isManager = useCanAssign();
  const s = useCrm();
  const [business, setBusiness] = useState<Business>(initialBusiness ?? defaultBusiness());
  const run = runFor(s.pipelines, business);
  const [f, setF] = useState({ client: "", person: "", phone: "", email: "", service: "", value: "", location: "", eventDate: "", requirements: "", followUp: plusDays(1) });
  const [st, setSt] = useState<Stage>(stage ?? "new");
  const [owner, setOwner] = useState(defaultOwnerId);
  const [channel, setChannel] = useState<Channel>("instagram");
  const [close, setClose] = useState(plusDays(30));
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const photo = business === "photography";
  // A stage from the other business's list isn't valid here: fall back to its first stage.
  const stageId = run.some((x) => x.id === st) ? st : run[0]!.id;

  return (
    <form
      id="composer-form"
      className="flex flex-col gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy) return;
        const v = f.value.trim() ? parseRupees(f.value) : 0;
        if (!f.client.trim()) return setError(photo ? "Add the couple's or client's name." : "Add the client's name.");
        if (!f.phone.trim() && !f.email.trim()) return setError("Add a phone number or an email so the team can follow up.");
        if (v === undefined) return setError("Enter the budget in rupees, for example 58,950 or 2,50,000 — or leave it blank.");
        setBusy(true);
        const created: string[] = [];
        try {
          let co = s.companies.find((c) => c.name.toLowerCase() === f.client.trim().toLowerCase());
          const newCompany = !co;
          if (!co) {
            co = await api<Company>("/companies", { method: "POST", body: { name: f.client.trim(), domain: "", industry: photo ? "Wedding" : "", city: f.location.trim(), ownerId: owner, tags: ["New"], business } });
            created.push(`/companies/${co.id}`);
          }
          const email = f.email.trim().toLowerCase();
          let contact = email ? s.contacts.find((c) => c.email === email) : undefined;
          let newContact: Contact | undefined;
          if (!contact) {
            contact = newContact = await api<Contact>("/contacts", {
              method: "POST",
              body: { name: f.person.trim() || f.client.trim(), companyId: co.id, title: "", city: f.location.trim(), ownerId: owner, source: channel, business, ...(email && { email }), ...(f.phone.trim() && { phone: f.phone.trim() }) },
            });
            created.push(`/contacts/${contact.id}`);
          }
          const deal = await api<Deal>("/deals", {
            method: "POST",
            body: {
              title: f.service.trim() || (photo ? "Wedding enquiry" : "Enquiry"),
              companyId: co.id,
              contactId: contact.id,
              stage: stageId,
              valuePaise: v,
              closeAt: new Date(`${photo && f.eventDate ? f.eventDate : close}T10:00:00`).toISOString(),
              ownerId: owner,
              channel,
              health: "ok",
              position: s.deals.filter((d) => d.stage === stageId).length,
              business,
              ...(f.service.trim() && { service: f.service.trim() }),
              ...(f.location.trim() && { location: f.location.trim() }),
              ...(photo && f.eventDate && { eventDate: f.eventDate }),
              ...(f.requirements.trim() && { requirements: f.requirements.trim() }),
              ...(f.followUp && { nextFollowUpAt: `${f.followUp}T10:00:00+05:30` }),
            },
          });
          useCrm.setState((x) => ({
            companies: newCompany ? [co!, ...x.companies] : x.companies,
            contacts: newContact ? [newContact, ...x.contacts] : x.contacts,
            deals: [...x.deals, deal],
          }));
          const undo = () => {
            const before = useCrm.getState();
            useCrm.setState((x) => ({ deals: x.deals.filter((d) => d.id !== deal.id), companies: x.companies.filter((c) => !created.includes(`/companies/${c.id}`)), contacts: x.contacts.filter((c) => !created.includes(`/contacts/${c.id}`)) }));
            save(Promise.all([api(`/deals/${deal.id}`, { method: "DELETE" }), ...[...created].reverse().map((p) => api(p, { method: "DELETE" }))]), () =>
              useCrm.setState({ deals: before.deals, companies: before.companies, contacts: before.contacts }),
            );
          };
          toast(`Lead added in ${run.find((x) => x.id === stageId)?.label ?? stageId}${v ? ` · ${formatCompact(deal.valuePaise)}` : ""}`, { action: { label: "Undo", onClick: undo } });
          onDone();
        } catch (err) {
          await Promise.all([...created].reverse().map((p) => api(p, { method: "DELETE" }).catch(() => {})));
          setError(`Couldn't add the lead — ${(err as Error).message}`);
        } finally {
          setBusy(false);
        }
      }}
    >
      <Field label="Business">
        <Select value={business} onChange={(e) => setBusiness(e.target.value as Business)}>
          {BUSINESSES.map((b) => <option key={b} value={b}>{BUSINESS_LABEL[b]}</option>)}
        </Select>
      </Field>
      <Field label={photo ? "Couple or client" : "Client / company"} hint="Pick an existing client or type a new name.">
        <Input list="company-options" value={f.client} onChange={set("client")} autoFocus placeholder={photo ? "Riya & Arjun" : "Halcyon Hotels"} />
        <datalist id="company-options">{s.companies.map((c) => <option key={c.id} value={c.name} />)}</datalist>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Contact person"><Input value={f.person} onChange={set("person")} placeholder={photo ? "Riya Mehta" : "Name"} /></Field>
        <Field label="Phone"><Input type="tel" value={f.phone} onChange={set("phone")} placeholder="+91 98765 43210" className="font-mono" /></Field>
        <Field label="Email"><Input type="email" value={f.email} onChange={set("email")} placeholder="riya@gmail.com" className="font-mono" /></Field>
        <Field label="Location"><Input value={f.location} onChange={set("location")} placeholder={photo ? "Udaipur" : "Bengaluru"} /></Field>
        <Field label="Service">
          <Input list="service-options" value={f.service} onChange={set("service")} placeholder={SERVICES[business][0]} />
          <datalist id="service-options">{SERVICES[business].map((x) => <option key={x} value={x} />)}</datalist>
        </Field>
        <Field label="Budget"><AmountInput value={f.value} onValue={(value) => setF({ ...f, value })} placeholder="58,950" aria-label="Budget in rupees" /></Field>
        {photo ? (
          <Field label="Event date"><Input type="date" value={f.eventDate} onChange={set("eventDate")} className="font-mono" /></Field>
        ) : (
          <Field label="Decision expected by"><Input type="date" value={close} onChange={(e) => setClose(e.target.value)} className="font-mono" /></Field>
        )}
        <Field label="Next follow-up"><Input type="date" value={f.followUp} onChange={set("followUp")} className="font-mono" /></Field>
        <Field label="Source">
          <Select value={channel} onChange={(e) => setChannel(e.target.value as Channel)}>
            {CHANNELS.map((c) => <option key={c} value={c}>{CHANNEL_LABEL[c]}</option>)}
          </Select>
        </Field>
        <Field label="Stage">
          <Select value={stageId} onChange={(e) => setSt(e.target.value)}>
            {run.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
          </Select>
        </Field>
      </div>
      <Field label="Assigned to">
        <Select value={owner} onChange={(e) => setOwner(e.target.value)} disabled={!isManager} title={isManager ? undefined : "Only admins can assign to someone else"}>
          {s.members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </Select>
      </Field>
      <Field label="Requirements">
        <Textarea rows={3} value={f.requirements} onChange={set("requirements")} placeholder={photo ? "Functions, number of guests, style they like…" : "Goals, channels, timeline…"} />
      </Field>
      {error && <p role="alert" className="t-meta m-0 text-risk">{error}</p>}
    </form>
  );
}

function NewTaskForm({ dealId, onDone }: { dealId?: string; onDone: () => void }) {
  const s = useCrm();
  const [title, setTitle] = useState("");
  const [due, setDue] = useState(plusDays(1));
  const [time, setTime] = useState("11:00");
  // Only admins and project managers give tasks to someone else.
  const canAssign = useAccess("projects") === "edit";
  const [assignee, setAssignee] = useState(() => (canAssign ? defaultOwnerId() : ME_ID));
  const [deal, setDeal] = useState(dealId ?? "");
  return (
    <form
      id="composer-form"
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!title.trim()) return;
        const d = s.deals.find((x) => x.id === deal);
        const view = useCrm.getState().businessView;
        s.addTask({ title: title.trim(), dueAt: new Date(`${due}T${time}:00`).toISOString(), assigneeId: assignee, dealId: d?.id, companyId: d?.companyId, business: d?.business ?? (view === "all" ? undefined : view) });
        toast("Task added");
        onDone();
      }}
    >
      <Field label="Task">
        <Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Send revised SOW" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Due">
          <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="font-mono" />
        </Field>
        <Field label="Time (IST)">
          <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="font-mono" />
        </Field>
      </div>
      <Field label="Assignee">
        <Select value={assignee} onChange={(e) => setAssignee(e.target.value)} disabled={!canAssign} title={canAssign ? undefined : "Only admins and project managers give tasks to someone else"}>
          {s.members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </Select>
      </Field>
      <Field label="Linked deal">
        <Select value={deal} onChange={(e) => setDeal(e.target.value)}>
          <option value="">None</option>
          {s.deals.map((d) => <option key={d.id} value={d.id}>{s.companies.find((c) => c.id === d.companyId)?.name} — {d.title}</option>)}
        </Select>
      </Field>
    </form>
  );
}

function LogCallForm({ dealId, onDone }: { dealId?: string; onDone: () => void }) {
  const s = useCrm();
  const [deal, setDeal] = useState(dealId ?? s.deals[0]?.id ?? "");
  const [mins, setMins] = useState("20");
  const [notes, setNotes] = useState("");
  const [kind, setKind] = useState<"call" | "whatsapp" | "email">("call");
  const [next, setNext] = useState(plusDays(3));
  return (
    <form
      id="composer-form"
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        const d = s.deals.find((x) => x.id === deal);
        if (!d) return;
        const what = kind === "call" ? `logged a call · ${mins} min` : kind === "whatsapp" ? "logged a WhatsApp conversation" : "logged an email";
        s.addActivity({ type: kind === "email" ? "email" : "call", dealId: d.id, companyId: d.companyId, text: what, body: notes.trim() || undefined });
        // The next follow-up replaces the one just done; clearing the date means none is planned.
        s.updateDeal(d.id, { nextFollowUpAt: next ? `${next}T10:00:00+05:30` : null });
        toast(next ? `Logged · next follow-up ${next.split("-").reverse().slice(0, 2).join("/")}` : "Logged");
        onDone();
      }}
    >
      <Field label="Deal">
        <Select value={deal} onChange={(e) => setDeal(e.target.value)}>
          {s.deals.map((d) => <option key={d.id} value={d.id}>{s.companies.find((c) => c.id === d.companyId)?.name} — {d.title}</option>)}
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="How">
          <Select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
            <option value="call">Phone call</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="email">Email</option>
          </Select>
        </Field>
        {kind === "call" ? (
          <Field label="Duration (minutes)">
            <Input inputMode="numeric" value={mins} onChange={(e) => setMins(e.target.value)} className="font-mono" />
          </Field>
        ) : <span />}
      </div>
      <Field label="Next follow-up" hint="Clear it if no follow-up is planned.">
        <Input type="date" value={next} onChange={(e) => setNext(e.target.value)} className="font-mono" />
      </Field>
      <Field label="Notes">
        <Textarea autoFocus value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What was agreed, and what happens next?" />
      </Field>
    </form>
  );
}

/* ---------- New invoice ---------- */
const DEFAULT_SAC = "998391"; // advertising / creative services
type LineDraft = { desc: string; sac: string; qty: string; rate: string };
const blankLine = (): LineDraft => ({ desc: "", sac: DEFAULT_SAC, qty: "1", rate: "" });
const num = (v: string) => (v.trim() === "" ? NaN : Number(v.replace(/,/g, "")));

const istDate = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

function NewInvoiceForm({ dealId, invoiceId, onDone }: { dealId?: string; invoiceId?: string; onDone: () => void }) {
  const s = useCrm();
  const ws = s.workspace;
  const ourState = gstState(ws.gstin);
  const navigate = useNavigate();
  const fromDeal = s.deals.find((d) => d.id === dealId);
  const editing = s.invoices.find((i) => i.id === invoiceId);
  const [companyId, setCompanyId] = useState(editing?.companyId ?? fromDeal?.companyId ?? "");
  const [deal, setDeal] = useState(editing ? (editing.dealId ?? "") : (fromDeal?.id ?? ""));
  const [issued, setIssued] = useState(editing ? istDate(editing.issuedAt) : plusDays(0));
  const [due, setDue] = useState(editing ? istDate(editing.dueAt) : plusDays(30));
  const [lines, setLines] = useState<LineDraft[]>(() =>
    editing
      ? editing.lines.map((l) => ({ desc: l.desc, sac: l.sac, qty: String(l.qty), rate: String(l.ratePaise / 100) }))
      : fromDeal
        ? [{ desc: fromDeal.title, sac: DEFAULT_SAC, qty: "1", rate: String(fromDeal.valuePaise / 100) }]
        : [blankLine()],
  );
  const [supplyChoice, setSupplyChoice] = useState<"intra" | "inter" | undefined>(editing?.supply);
  const [kind, setKind] = useState<"tax" | "cash">(editing?.kind ?? "tax");
  const cash = kind === "cash";
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const co = s.companies.find((c) => c.id === companyId);
  // Same state code as our GSTIN → CGST + SGST; otherwise IGST. Without a client GSTIN, the user decides.
  const autoSupply = co?.gstin && ws.gstin ? (co.gstin.slice(0, 2) === ws.gstin.slice(0, 2) ? "intra" : "inter") : undefined;
  const supply = supplyChoice ?? autoSupply ?? "intra";
  const parsed = lines.map((l) => ({ desc: l.desc.trim(), sac: l.sac.trim(), qty: num(l.qty), ratePaise: rupees(num(l.rate)) }));
  const t = invoiceTotals({ kind, supply, lines: parsed.map((l) => ({ qty: l.qty || 0, ratePaise: l.ratePaise || 0 })), payments: [] });
  const setLine = (i: number, patch: Partial<LineDraft>) => setLines((xs) => xs.map((l, k) => (k === i ? { ...l, ...patch } : l)));

  return (
    <form
      id="composer-form"
      className="flex flex-col gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy) return;
        if (!ws.legalName || (!cash && !ws.gstin)) return setError("Add the studio's legal name and GSTIN in Settings → Workspace first.");
        if (!co) return setError("Choose the company you're billing.");
        const bad = parsed.findIndex((l) => !l.desc || !/^\d{4,8}$/.test(l.sac) || !(l.qty > 0) || !(l.ratePaise >= 0));
        if (bad >= 0) return setError(`Line ${bad + 1}: add a description, a 4–8 digit SAC code, a quantity above 0 and a rate in rupees.`);
        if (t.subtotal <= 0) return setError("The invoice total must be more than ₹0.");
        if (due < issued) return setError("The due date can't be before the issue date.");
        setBusy(true);
        setError(undefined);
        try {
          if (editing) {
            const saved = await api<Invoice>(`/invoices/${editing.id}`, { method: "PATCH", body: { dealId: deal || undefined, dueAt: `${due}T00:00:00+05:30`, supply, lines: parsed } });
            useCrm.setState((x) => ({ invoices: x.invoices.map((i) => (i.id === saved.id ? saved : i)) }));
            toast(`Saved ${saved.number} · ${formatFull(t.total)}`);
            return onDone();
          }
          const inv = await api<Invoice>("/invoices", {
            method: "POST",
            body: {
              kind,
              companyId: co.id,
              dealId: deal || undefined,
              issuedAt: `${issued}T12:00:00+05:30`,
              dueAt: `${due}T00:00:00+05:30`,
              supply,
              lines: parsed,
            },
          });
          useCrm.setState((x) => ({ invoices: [inv, ...x.invoices] }));
          s.addActivity({ type: "invoice", dealId: inv.dealId, companyId: inv.companyId, text: `raised ${inv.number} · ${formatFull(t.total)}` });
          toast(`Created ${inv.number} as a draft · ${formatFull(t.total)}`);
          onDone();
          navigate(`/invoices?open=${inv.id}`);
        } catch (err) {
          setError(`Couldn't create the invoice — ${(err as Error).message}`);
        } finally {
          setBusy(false);
        }
      }}
    >
      <Field label="Type" hint={editing ? "Fixed once created: each type has its own number series." : cash ? "No GST. Numbered TOS/CB/…, separate from GST invoices, and left out of the GST register." : "A GST tax invoice, numbered TOS/…"}>
        <Segmented label="Bill type" value={kind} onChange={editing ? () => {} : setKind} options={[{ value: "tax", label: "GST invoice" }, { value: "cash", label: "Cash bill (no GST)" }]} />
      </Field>
      {(!ws.legalName || (!cash && !ws.gstin)) && (
        <p className="t-meta m-0 rounded-card bg-warn-wash px-3 py-2 text-ink">
          Invoices need the studio's legal name and GSTIN.{" "}
          <Link to="/settings/workspace" onClick={onDone} className="font-medium underline">Add them in Settings → Workspace</Link>
        </p>
      )}
      <Field
        label="Bill to"
        hint={
          co
            ? [co.gstin ? `GSTIN ${co.gstin}` : "No GSTIN on file — billed as unregistered.", !co.address && "No billing address yet — add it on the company."].filter(Boolean).join(" ")
            : "Add the company first (Companies → New company) if it isn't listed."
        }
      >
        <Select value={companyId} disabled={!!editing} onChange={(e) => { setCompanyId(e.target.value); setDeal(""); setSupplyChoice(undefined); }} autoFocus={!fromDeal && !editing}>
          <option value="">Choose a company…</option>
          {[...s.companies].sort((a, b) => a.name.localeCompare(b.name)).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
      </Field>
      <Field label="Deal" hint="Optional. Links the invoice to the deal's page.">
        <Select value={deal} onChange={(e) => setDeal(e.target.value)} disabled={!co}>
          <option value="">None</option>
          {s.deals.filter((d) => d.companyId === companyId).map((d) => <option key={d.id} value={d.id}>{d.title} · {stageIn(s.pipelines, d.business, d.stage).label}</option>)}
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Issue date">
          <Input type="date" value={issued} disabled={!!editing} title={editing ? "The number belongs to this date's financial year" : undefined} onChange={(e) => setIssued(e.target.value)} className="font-mono" />
        </Field>
        <Field label="Due date">
          <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="font-mono" />
        </Field>
      </div>

      <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
        <legend className="mb-1.5 fs-12.5 font-medium">Items</legend>
        {lines.map((l, i) => (
          <div key={i} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 rounded-card border border-line p-2.5">
            <Input aria-label={`Item ${i + 1} description`} placeholder="Product shoot — 2 days" value={l.desc} onChange={(e) => setLine(i, { desc: e.target.value })} />
            <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove item ${i + 1}`} disabled={lines.length === 1} onClick={() => setLines((xs) => xs.filter((_, k) => k !== i))}>
              <X strokeWidth={1.5} />
            </Button>
            <div className="col-span-2 grid grid-cols-[90px_64px_minmax(0,1fr)] gap-2">
              <Input aria-label={`Item ${i + 1} SAC code`} inputMode="numeric" value={l.sac} onChange={(e) => setLine(i, { sac: e.target.value })} className="font-mono" title="SAC code" />
              <Input aria-label={`Item ${i + 1} quantity`} inputMode="decimal" value={l.qty} onChange={(e) => setLine(i, { qty: e.target.value })} className="font-mono" title="Quantity" />
              <Input aria-label={`Item ${i + 1} rate in rupees`} inputMode="decimal" placeholder="Rate ₹ (before GST)" value={l.rate} onChange={(e) => setLine(i, { rate: e.target.value })} className="font-mono" />
            </div>
          </div>
        ))}
        <Button type="button" variant="ghost" size="sm" className="self-start" onClick={() => setLines((xs) => [...xs, blankLine()])}>
          <Plus strokeWidth={1.5} /> Add item
        </Button>
      </fieldset>

      {!cash && (
        <Field label="Tax" hint={autoSupply ? "Set from the client's GSTIN state." : "No client GSTIN — choose where the client is."}>
          <Select value={supply} onChange={(e) => setSupplyChoice(e.target.value as "intra" | "inter")}>
            <option value="intra">Same state{ourState ? ` (${ourState})` : ""} — CGST 9% + SGST 9%</option>
            <option value="inter">Other state — IGST 18%</option>
          </Select>
        </Field>
      )}

      <dl className="m-0 grid grid-cols-[1fr_auto] gap-y-1 border-t border-line pt-3 font-mono fs-12.5">
        {!cash && <><dt className="text-ink-2">Taxable value</dt><dd className="m-0 text-right">{formatFull(t.subtotal)}</dd></>}
        {cash ? null : supply === "intra" ? (
          <>
            <dt className="text-ink-2">CGST 9%</dt><dd className="m-0 text-right">{formatFull(t.cgst)}</dd>
            <dt className="text-ink-2">SGST 9%</dt><dd className="m-0 text-right">{formatFull(t.sgst)}</dd>
          </>
        ) : (
          <><dt className="text-ink-2">IGST 18%</dt><dd className="m-0 text-right">{formatFull(t.igst)}</dd></>
        )}
        <dt className="font-sans font-medium">Total</dt><dd className="m-0 text-right font-medium">{formatFull(t.total)}</dd>
      </dl>
      <p className="t-meta m-0 text-ink-3">Saved as a draft with the next {cash ? "cash bill" : "invoice"} number. Mark it sent when it goes to the client.</p>
      {error && <p role="alert" className="t-meta m-0 text-risk">{error}</p>}
    </form>
  );
}

/* ---------- New company / New contact ---------- */
/** Removes blank optional fields so the API's "optional" checks see them as absent. */
const compact = (o: Record<string, string | undefined>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v?.trim()]).filter(([, v]) => v));

function NewCompanyForm({ onDone }: { onDone: () => void }) {
  const isManager = useCanAssign();
  const s = useCrm();
  const [f, setF] = useState({ name: "", domain: "", industry: "", city: "", gstin: "", address: "" });
  const [business, setBusiness] = useState<Business | "">(() => (useCrm.getState().businessView === "all" ? "" : defaultBusiness()));
  const [owner, setOwner] = useState(defaultOwnerId);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  return (
    <form
      id="composer-form"
      className="flex flex-col gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy) return;
        if (!f.name.trim()) return setError("Add the company name.");
        if (s.companies.some((c) => c.name.trim().toLowerCase() === f.name.trim().toLowerCase())) return setError(`${f.name.trim()} is already in Companies.`);
        setBusy(true);
        try {
          const co = await api<Company>("/companies", { method: "POST", body: { ...compact(f), ownerId: owner, tags: [], ...(business && { business }) } });
          useCrm.setState((x) => ({ companies: [co, ...x.companies] }));
          toast(`Added ${co.name}`);
          onDone();
        } catch (err) {
          setError(`Couldn't add the company — ${(err as Error).message}`);
        } finally {
          setBusy(false);
        }
      }}
    >
      <Field label="Company name"><Input value={f.name} onChange={set("name")} autoFocus placeholder="Halcyon Hotels" /></Field>
      <Field label="Business" hint="Leave as Both if they buy from both businesses.">
        <Select value={business} onChange={(e) => setBusiness(e.target.value as Business | "")}>
          <option value="">Both</option>
          {BUSINESSES.map((b) => <option key={b} value={b}>{BUSINESS_LABEL[b]}</option>)}
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Website"><Input value={f.domain} onChange={set("domain")} placeholder="halcyon.in" className="font-mono" /></Field>
        <Field label="City"><Input value={f.city} onChange={set("city")} placeholder="Goa" /></Field>
        <Field label="Industry"><Input value={f.industry} onChange={set("industry")} placeholder="Hospitality" /></Field>
        <Field label="Owner">
          <Select value={owner} onChange={(e) => setOwner(e.target.value)} disabled={!isManager} title={isManager ? undefined : "Only admins can assign to someone else"}>
            {s.members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </Select>
        </Field>
      </div>
      <Field label="GSTIN" hint="Optional. Needed on their tax invoices; decides CGST + SGST or IGST.">
        <Input value={f.gstin} onChange={set("gstin")} placeholder="30ABCDE1234F1Z5" className="font-mono" />
      </Field>
      <Field label="Billing address" hint="Printed under “Bill to” on their invoices.">
        <Textarea value={f.address} onChange={set("address")} rows={3} placeholder={"2nd Floor, 14 Church Street\nBengaluru 560001"} />
      </Field>
      {error && <p role="alert" className="t-meta m-0 text-risk">{error}</p>}
    </form>
  );
}

function NewContactForm({ onDone }: { onDone: () => void }) {
  const isManager = useCanAssign();
  const s = useCrm();
  const [f, setF] = useState({ name: "", company: "", title: "", email: "", phone: "", handle: "", city: "" });
  const [business, setBusiness] = useState<Business | "">(() => (useCrm.getState().businessView === "all" ? "" : defaultBusiness()));
  const [source, setSource] = useState<Channel>("referral");
  const [owner, setOwner] = useState(defaultOwnerId);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  return (
    <form
      id="composer-form"
      className="flex flex-col gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy) return;
        if (!f.name.trim()) return setError("Add the person's name.");
        if (!f.email.trim() && !f.phone.trim() && !f.handle.trim()) return setError("Add at least one way to reach them: email, phone or Instagram.");
        setBusy(true);
        let newCompany: Company | undefined;
        try {
          const name = f.company.trim();
          let co = name ? s.companies.find((c) => c.name.toLowerCase() === name.toLowerCase()) : undefined;
          if (name && !co) co = newCompany = await api<Company>("/companies", { method: "POST", body: { name, domain: "", industry: "", city: f.city.trim(), ownerId: owner, tags: [], ...(business && { business }) } });
          const { company: _, ...fields } = f;
          const contact = await api<Contact>("/contacts", { method: "POST", body: { ...compact(fields), companyId: co?.id, ownerId: owner, source, ...(business && { business }) } });
          useCrm.setState((x) => ({ companies: newCompany ? [newCompany, ...x.companies] : x.companies, contacts: [contact, ...x.contacts] }));
          toast(`Added ${contact.name}${newCompany ? ` and ${newCompany.name}` : ""}`);
          onDone();
        } catch (err) {
          if (newCompany) void api(`/companies/${newCompany.id}`, { method: "DELETE" }).catch(() => {});
          setError(`Couldn't add the contact — ${(err as Error).message}`);
        } finally {
          setBusy(false);
        }
      }}
    >
      <Field label="Name"><Input value={f.name} onChange={set("name")} autoFocus placeholder="Riya Mehta" /></Field>
      <Field label="Business">
        <Select value={business} onChange={(e) => setBusiness(e.target.value as Business | "")}>
          <option value="">Both</option>
          {BUSINESSES.map((b) => <option key={b} value={b}>{BUSINESS_LABEL[b]}</option>)}
        </Select>
      </Field>
      <Field label="Company" hint="Pick an existing company or type a new name. Optional.">
        <Input list="contact-company-options" value={f.company} onChange={set("company")} placeholder="Halcyon Hotels" />
        <datalist id="contact-company-options">{s.companies.map((c) => <option key={c.id} value={c.name} />)}</datalist>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Email"><Input type="email" value={f.email} onChange={set("email")} placeholder="riya@halcyon.in" className="font-mono" /></Field>
        <Field label="Phone"><Input type="tel" value={f.phone} onChange={set("phone")} placeholder="+91 98765 43210" className="font-mono" /></Field>
        <Field label="Instagram"><Input value={f.handle} onChange={set("handle")} placeholder="@riya.m" className="font-mono" /></Field>
        <Field label="Title"><Input value={f.title} onChange={set("title")} placeholder="Marketing head" /></Field>
        <Field label="City"><Input value={f.city} onChange={set("city")} placeholder="Goa" /></Field>
        <Field label="Source">
          <Select value={source} onChange={(e) => setSource(e.target.value as Channel)}>
            {CHANNELS.map((c) => <option key={c} value={c}>{CHANNEL_LABEL[c]}</option>)}
          </Select>
        </Field>
      </div>
      <Field label="Owner">
        <Select value={owner} onChange={(e) => setOwner(e.target.value)} disabled={!isManager} title={isManager ? undefined : "Only admins can assign to someone else"}>
          {s.members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </Select>
      </Field>
      {error && <p role="alert" className="t-meta m-0 text-risk">{error}</p>}
    </form>
  );
}

const TITLES = { deal: "New lead", task: "Add task", call: "Log a conversation", invoice: "New invoice", company: "New company", contact: "New contact" } as const;
const SUBMIT = { deal: "Add lead", task: "Add task", call: "Log call", invoice: "Create draft invoice", company: "Add company", contact: "Add contact" } as const;

export function Composers() {
  const c = useUi((s) => s.composer);
  const me = useMe();
  const sales = useAccess("sales");
  const finance = useAccess("finance");
  const close = () => useUi.getState().closeComposer();
  // The API refuses these for the role anyway; say so up front instead of after filling the form in.
  const blocked = c && ((["deal", "company", "contact", "call"].includes(c.kind) && sales !== "edit" && sales !== "own") || (c.kind === "invoice" && finance !== "edit"));
  return (
    <Sheet
      open={!!c}
      onOpenChange={(o) => !o && close()}
      title={c ? (c.invoiceId ? "Edit draft invoice" : TITLES[c.kind]) : ""}
      footer={
        c && !blocked && (
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={close}>Cancel</Button>
            <Button variant="ink" type="submit" form="composer-form">{c.invoiceId ? "Save draft" : SUBMIT[c.kind]}</Button>
          </div>
        )
      }
    >
      {blocked && <p className="t-body m-0 text-ink-2">Your role ({ROLE_LABEL[roleOf(me.role)]}) can look at {c.kind === "invoice" ? "invoices" : "leads and clients"} but not add or change them. Ask an admin if that should change.</p>}
      {blocked ? null : c?.kind === "deal" && <NewDealForm stage={c.stage} business={c.business} onDone={close} />}
      {!blocked && c?.kind === "task" && <NewTaskForm dealId={c.dealId} onDone={close} />}
      {!blocked && c?.kind === "call" && <LogCallForm dealId={c.dealId} onDone={close} />}
      {!blocked && c?.kind === "invoice" && <NewInvoiceForm key={c.invoiceId ?? "new"} dealId={c.dealId} invoiceId={c.invoiceId} onDone={close} />}
      {!blocked && c?.kind === "company" && <NewCompanyForm onDone={close} />}
      {!blocked && c?.kind === "contact" && <NewContactForm onDone={close} />}
    </Sheet>
  );
}
