import { CHANNEL_LABEL, CHANNELS, formatCompact, formatFull, gstState, invoiceTotals, lakh, rupees, STAGE_LABEL, STAGES, type Channel, type Stage } from "@pinnacle/shared";
import { Button, Input, Select, Sheet, Textarea, toast } from "@pinnacle/ui";
import { Plus, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { Link } from "react-router";
import { defaultOwnerId, useCrm, useIsManager } from "../data/store";
import type { Company, Contact, Deal, Invoice } from "../data/types";
import { api, save } from "../lib/api";
import { useUi } from "../lib/ui-store";

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[12.5px] font-medium">{label}</span>
      {children}
      {hint && <span className="text-[11.5px] text-ink-3">{hint}</span>}
    </label>
  );
}

const plusDays = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

function NewDealForm({ stage, onDone }: { stage?: string; onDone: () => void }) {
  const isManager = useIsManager();
  const s = useCrm();
  const [company, setCompany] = useState("");
  const [title, setTitle] = useState("");
  const [value, setValue] = useState("");
  const [st, setSt] = useState<Stage>((stage as Stage) ?? "new");
  const [owner, setOwner] = useState(defaultOwnerId);
  const [channel, setChannel] = useState<Channel>("referral");
  const [close, setClose] = useState(plusDays(30));
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  return (
    <form
      id="composer-form"
      className="flex flex-col gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy) return;
        const v = parseFloat(value);
        if (!company.trim() || !title.trim()) return setError("Add a company and a deal name.");
        if (Number.isNaN(v) || v <= 0) return setError("Enter the deal value in lakh, for example 7 or 7.5.");
        setBusy(true);
        let newCompany: Company | undefined;
        try {
          let co = s.companies.find((c) => c.name.toLowerCase() === company.trim().toLowerCase());
          if (!co) co = newCompany = await api<Company>("/companies", { method: "POST", body: { name: company.trim(), domain: "—", industry: "—", city: "—", ownerId: owner, tags: ["New"] } });
          const deal = await api<Deal>("/deals", {
            method: "POST",
            body: {
              title: title.trim(),
              companyId: co.id,
              stage: st,
              valuePaise: lakh(v),
              closeAt: new Date(close + "T10:00:00").toISOString(),
              ownerId: owner,
              channel,
              health: "ok",
              position: s.deals.filter((d) => d.stage === st).length,
            },
          });
          useCrm.setState((x) => ({ companies: newCompany ? [newCompany, ...x.companies] : x.companies, deals: [...x.deals, deal] }));
          const undo = () => {
            const before = useCrm.getState();
            useCrm.setState((x) => ({ deals: x.deals.filter((d) => d.id !== deal.id), companies: x.companies.filter((c) => c.id !== newCompany?.id) }));
            save(
              Promise.all([api(`/deals/${deal.id}`, { method: "DELETE" }), newCompany && api(`/companies/${newCompany.id}`, { method: "DELETE" })]),
              () => useCrm.setState({ deals: before.deals, companies: before.companies }),
            );
          };
          toast(`Deal created in ${STAGE_LABEL[st]} · ${formatCompact(deal.valuePaise)}`, { action: { label: "Undo", onClick: undo } });
          onDone();
        } catch (err) {
          if (newCompany) void api(`/companies/${newCompany.id}`, { method: "DELETE" }).catch(() => {});
          setError(`Couldn't create the deal — ${(err as Error).message}`);
        } finally {
          setBusy(false);
        }
      }}
    >
      <Field label="Company" hint="Pick an existing company or type a new name.">
        <Input list="company-options" value={company} onChange={(e) => setCompany(e.target.value)} autoFocus placeholder="Atlas Athletic" />
        <datalist id="company-options">
          {s.companies.map((c) => <option key={c.id} value={c.name} />)}
        </datalist>
      </Field>
      <Field label="Deal name">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Brand refresh" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Value (₹ lakh)">
          <Input inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} placeholder="7.0" className="font-mono" />
        </Field>
        <Field label="Expected close">
          <Input type="date" value={close} onChange={(e) => setClose(e.target.value)} className="font-mono" />
        </Field>
        <Field label="Stage">
          <Select value={st} onChange={(e) => setSt(e.target.value as Stage)}>
            {STAGES.map((x) => <option key={x} value={x}>{STAGE_LABEL[x]}</option>)}
          </Select>
        </Field>
        <Field label="Owner">
          <Select value={owner} onChange={(e) => setOwner(e.target.value)} disabled={!isManager} title={isManager ? undefined : "Only admins and managers can assign to someone else"}>
            {s.members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </Select>
        </Field>
      </div>
      <Field label="Source">
        <Select value={channel} onChange={(e) => setChannel(e.target.value as Channel)}>
          {CHANNELS.map((c) => <option key={c} value={c}>{CHANNEL_LABEL[c]}</option>)}
        </Select>
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
  const [assignee, setAssignee] = useState(defaultOwnerId);
  const [deal, setDeal] = useState(dealId ?? "");
  return (
    <form
      id="composer-form"
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!title.trim()) return;
        const d = s.deals.find((x) => x.id === deal);
        s.addTask({ title: title.trim(), dueAt: new Date(`${due}T${time}:00`).toISOString(), assigneeId: assignee, dealId: d?.id, companyId: d?.companyId });
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
        <Select value={assignee} onChange={(e) => setAssignee(e.target.value)}>
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
  return (
    <form
      id="composer-form"
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        const d = s.deals.find((x) => x.id === deal);
        if (!d) return;
        s.addActivity({ type: "call", dealId: d.id, companyId: d.companyId, text: `logged a call · ${mins} min`, body: notes.trim() || undefined });
        toast("Call logged");
        onDone();
      }}
    >
      <Field label="Deal">
        <Select value={deal} onChange={(e) => setDeal(e.target.value)}>
          {s.deals.map((d) => <option key={d.id} value={d.id}>{s.companies.find((c) => c.id === d.companyId)?.name} — {d.title}</option>)}
        </Select>
      </Field>
      <Field label="Duration (minutes)">
        <Input inputMode="numeric" value={mins} onChange={(e) => setMins(e.target.value)} className="font-mono" />
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
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const co = s.companies.find((c) => c.id === companyId);
  // Same state code as our GSTIN → CGST + SGST; otherwise IGST. Without a client GSTIN, the user decides.
  const autoSupply = co?.gstin && ws.gstin ? (co.gstin.slice(0, 2) === ws.gstin.slice(0, 2) ? "intra" : "inter") : undefined;
  const supply = supplyChoice ?? autoSupply ?? "intra";
  const parsed = lines.map((l) => ({ desc: l.desc.trim(), sac: l.sac.trim(), qty: num(l.qty), ratePaise: rupees(num(l.rate)) }));
  const t = invoiceTotals({ supply, lines: parsed.map((l) => ({ qty: l.qty || 0, ratePaise: l.ratePaise || 0 })), payments: [] });
  const setLine = (i: number, patch: Partial<LineDraft>) => setLines((xs) => xs.map((l, k) => (k === i ? { ...l, ...patch } : l)));

  return (
    <form
      id="composer-form"
      className="flex flex-col gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy) return;
        if (!ws.legalName || !ws.gstin) return setError("Add the studio's legal name and GSTIN in Settings → Workspace first.");
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
      {(!ws.legalName || !ws.gstin) && (
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
          {s.deals.filter((d) => d.companyId === companyId).map((d) => <option key={d.id} value={d.id}>{d.title} · {STAGE_LABEL[d.stage]}</option>)}
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
        <legend className="mb-1.5 text-[12.5px] font-medium">Items</legend>
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

      <Field label="Tax" hint={autoSupply ? "Set from the client's GSTIN state." : "No client GSTIN — choose where the client is."}>
        <Select value={supply} onChange={(e) => setSupplyChoice(e.target.value as "intra" | "inter")}>
          <option value="intra">Same state{ourState ? ` (${ourState})` : ""} — CGST 9% + SGST 9%</option>
          <option value="inter">Other state — IGST 18%</option>
        </Select>
      </Field>

      <dl className="m-0 grid grid-cols-[1fr_auto] gap-y-1 border-t border-line pt-3 font-mono text-[12.5px]">
        <dt className="text-ink-2">Taxable value</dt><dd className="m-0 text-right">{formatFull(t.subtotal)}</dd>
        {supply === "intra" ? (
          <>
            <dt className="text-ink-2">CGST 9%</dt><dd className="m-0 text-right">{formatFull(t.cgst)}</dd>
            <dt className="text-ink-2">SGST 9%</dt><dd className="m-0 text-right">{formatFull(t.sgst)}</dd>
          </>
        ) : (
          <><dt className="text-ink-2">IGST 18%</dt><dd className="m-0 text-right">{formatFull(t.igst)}</dd></>
        )}
        <dt className="font-sans font-medium">Total</dt><dd className="m-0 text-right font-medium">{formatFull(t.total)}</dd>
      </dl>
      <p className="t-meta m-0 text-ink-3">Saved as a draft with the next invoice number. Mark it sent when it goes to the client.</p>
      {error && <p role="alert" className="t-meta m-0 text-risk">{error}</p>}
    </form>
  );
}

/* ---------- New company / New contact ---------- */
/** Removes blank optional fields so the API's "optional" checks see them as absent. */
const compact = (o: Record<string, string | undefined>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v?.trim()]).filter(([, v]) => v));

function NewCompanyForm({ onDone }: { onDone: () => void }) {
  const isManager = useIsManager();
  const s = useCrm();
  const [f, setF] = useState({ name: "", domain: "", industry: "", city: "", gstin: "", address: "" });
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
          const co = await api<Company>("/companies", { method: "POST", body: { ...compact(f), ownerId: owner, tags: [] } });
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
      <div className="grid grid-cols-2 gap-3">
        <Field label="Website"><Input value={f.domain} onChange={set("domain")} placeholder="halcyon.in" className="font-mono" /></Field>
        <Field label="City"><Input value={f.city} onChange={set("city")} placeholder="Goa" /></Field>
        <Field label="Industry"><Input value={f.industry} onChange={set("industry")} placeholder="Hospitality" /></Field>
        <Field label="Owner">
          <Select value={owner} onChange={(e) => setOwner(e.target.value)} disabled={!isManager} title={isManager ? undefined : "Only admins and managers can assign to someone else"}>
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
  const isManager = useIsManager();
  const s = useCrm();
  const [f, setF] = useState({ name: "", company: "", title: "", email: "", phone: "", handle: "", city: "" });
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
          if (name && !co) co = newCompany = await api<Company>("/companies", { method: "POST", body: { name, domain: "", industry: "", city: f.city.trim(), ownerId: owner, tags: [] } });
          const { company: _, ...fields } = f;
          const contact = await api<Contact>("/contacts", { method: "POST", body: { ...compact(fields), companyId: co?.id, ownerId: owner, source } });
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
        <Select value={owner} onChange={(e) => setOwner(e.target.value)} disabled={!isManager} title={isManager ? undefined : "Only admins and managers can assign to someone else"}>
          {s.members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </Select>
      </Field>
      {error && <p role="alert" className="t-meta m-0 text-risk">{error}</p>}
    </form>
  );
}

const TITLES = { deal: "New deal", task: "Add task", call: "Log call", invoice: "New invoice", company: "New company", contact: "New contact" } as const;
const SUBMIT = { deal: "Create deal", task: "Add task", call: "Log call", invoice: "Create draft invoice", company: "Add company", contact: "Add contact" } as const;

export function Composers() {
  const c = useUi((s) => s.composer);
  const close = () => useUi.getState().closeComposer();
  return (
    <Sheet
      open={!!c}
      onOpenChange={(o) => !o && close()}
      title={c ? (c.invoiceId ? "Edit draft invoice" : TITLES[c.kind]) : ""}
      footer={
        c && (
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={close}>Cancel</Button>
            <Button variant="ink" type="submit" form="composer-form">{c.invoiceId ? "Save draft" : SUBMIT[c.kind]}</Button>
          </div>
        )
      }
    >
      {c?.kind === "deal" && <NewDealForm stage={c.stage} onDone={close} />}
      {c?.kind === "task" && <NewTaskForm dealId={c.dealId} onDone={close} />}
      {c?.kind === "call" && <LogCallForm dealId={c.dealId} onDone={close} />}
      {c?.kind === "invoice" && <NewInvoiceForm key={c.invoiceId ?? "new"} dealId={c.dealId} invoiceId={c.invoiceId} onDone={close} />}
      {c?.kind === "company" && <NewCompanyForm onDone={close} />}
      {c?.kind === "contact" && <NewContactForm onDone={close} />}
    </Sheet>
  );
}
