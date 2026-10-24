import { fmtAgo, BUSINESS_LABEL, BUSINESSES, type Business, fmtDay } from "@pinnacle/shared";
import { Avatar, Button, Input, Menu, MenuContent, MenuItem, MenuTrigger, MoneyText, Select, Textarea, toast, Segmented } from "@pinnacle/ui";
import type { ColumnDef } from "@tanstack/react-table";
import { Building2, ChevronDown, LayoutGrid, List, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { BulkButton, DataTable } from "../../components/data-table";
import { EmptyState } from "../../components/empty-state";
import { PageHeader } from "../../components/page-header";
import { isOpen } from "../../data/derive";
import { ME_ID } from "../../data/seed";
import { useCanEdit, useCrm, useCanAssign } from "../../data/store";
import type { Company, Deal } from "../../data/types";
import { DealStage } from "../../components/deal/deal-stage";
import { runFor, stageRank } from "../../data/pipeline";
import { api, ApiError } from "../../lib/api";
import { useCreateAction, usePref } from "../../lib/hooks";
import { useUi } from "../../lib/ui-store";
import { ClientCard, ClientPanel, clientSummary } from "./client-cards";

type Row = Company & { isClient: boolean; best?: Deal; openValue: number; ownerName: string; last: number };
const TAGS = ["Priority", "Retainer", "Rebrand", "Films", "Packaging", "At risk"];

export const Monogram = ({ name, photo }: { name: string; photo?: string }) =>
  photo ? <img src={photo} alt="" className="size-8 shrink-0 rounded-control object-cover" /> : <span className="grid size-8 shrink-0 place-items-center rounded-control bg-sunken font-serif fs-16 text-ink-2">{name[0]}</span>;

export function CompaniesRoute() {
  const isManager = useCanAssign();
  const s = useCrm();
  const navigate = useNavigate();
  // Clients = at least one confirmed deal; prospects = not yet.
  const [show, setShow] = usePref<"clients" | "prospects" | "all">("clients.show", "clients");
  const [layout, setLayout] = usePref<"cards" | "table">("clients.layout", "cards");
  const [focus, setFocus] = usePref<"upcoming" | "payments" | "approval" | "delivered" | "name">("clients.focus", "upcoming");
  const [opened, setOpened] = useState<string>();
  useCreateAction(() => useUi.getState().openComposer("company"));

  const rows: Row[] = useMemo(
    () =>
      s.companies.map((c) => {
        const deals = s.deals.filter((d) => d.companyId === c.id);
        const open = deals.filter(isOpen);
        const best = [...(open.length ? open : deals)].sort((a, b) => stageRank(s.pipelines, b) - stageRank(s.pipelines, a) || b.valuePaise - a.valuePaise)[0];
        return {
          ...c,
          isClient: !!c.clientSince || deals.some((d) => d.stage === "won"),
          best,
          openValue: open.reduce((a, d) => a + d.valuePaise, 0),
          ownerName: s.members.find((m) => m.id === c.ownerId)?.name ?? "",
          last: +new Date(c.lastActivityAt),
        };
      }),
    [s.companies, s.deals, s.members],
  );

  const columns: ColumnDef<Row, unknown>[] = [
    {
      id: "name",
      header: "Client",
      accessorKey: "name",
      enableHiding: false,
      cell: ({ row: { original: c } }) => (
        <span className="flex items-center gap-3">
          <Monogram name={c.name} photo={c.photo} />
          <span className="leading-tight">
            <span className="block font-medium">{c.name}</span>
            <span className="font-mono fs-11 text-ink-3">{c.domain}</span>
          </span>
        </span>
      ),
    },
    { id: "since", header: "Client since", accessorFn: (r) => r.clientSince ?? "", cell: ({ row: { original: c } }) => (c.clientSince ? <span className="font-mono fs-12 text-ink-2">{fmtDay(c.clientSince)}</span> : <span className="text-ink-3">{c.isClient ? "—" : "Prospect"}</span>) },
    { id: "stage", header: "Best deal", accessorFn: (r) => (r.best ? stageRank(s.pipelines, r.best) : -1), cell: ({ row: { original: c } }) => (c.best ? <DealStage deal={c.best} /> : <span className="text-ink-3">—</span>) },
    { id: "value", header: "Open value", accessorKey: "openValue", meta: { align: "right" }, cell: ({ row: { original: c } }) => (c.openValue ? <MoneyText paise={c.openValue} /> : <span className="text-ink-3">—</span>) },
    { id: "owner", header: "Owner", accessorKey: "ownerName", cell: ({ row: { original: c } }) => <span className="flex items-center gap-2"><Avatar name={c.ownerName} me={c.ownerId === ME_ID} /> <span className="text-ink-2">{c.ownerName}</span></span> },
    { id: "last", header: "Last activity", accessorKey: "last", cell: ({ row: { original: c } }) => <span className="font-mono fs-12 text-ink-2">{fmtAgo(c.lastActivityAt)}</span> },
    { id: "city", header: "City", accessorKey: "city", cell: ({ getValue }) => <span className="text-ink-2">{String(getValue())}</span> },
    {
      id: "tags",
      header: "Tags",
      enableSorting: false,
      cell: ({ row: { original: c } }) => (
        <span className="flex gap-1">
          {c.tags.map((t) => <span key={t} className="rounded-[4px] border border-line px-1.5 py-px fs-11 text-ink-2">{t}</span>)}
        </span>
      ),
    },
  ];

  const visibleRows = rows.filter((r) => show === "all" || (show === "clients") === r.isClient);
  // Cards: filtered and ordered by what needs attention.
  const cards = visibleRows
    .map((r) => ({ r, x: clientSummary(r, s) }))
    .filter(({ x }) => (focus === "payments" ? x.due > 100 : focus === "approval" ? x.needsApproval > 0 : focus === "delivered" ? x.delivered : true))
    .sort((a, b) =>
      focus === "name"
        ? a.r.name.localeCompare(b.r.name)
        : focus === "payments"
          ? b.x.overdue - a.x.overdue || b.x.due - a.x.due
          : Number(a.x.delivered) - Number(b.x.delivered) || (a.x.nextEventDate ?? a.x.next?.date ?? "9999").localeCompare(b.x.nextEventDate ?? b.x.next?.date ?? "9999"),
    );

  return (
    <>
      <PageHeader
        eyebrow={`${rows.filter((r) => r.isClient).length} clients · ${rows.filter((r) => !r.isClient).length} prospects`}
        title="Clients"
        actions={
          <>
            <Segmented label="Show" value={show} onChange={setShow} options={[{ value: "clients", label: "Clients" }, { value: "prospects", label: "Prospects" }, { value: "all", label: "All" }]} />
            <Segmented label="Layout" value={layout} onChange={setLayout} options={[{ value: "cards", label: <><LayoutGrid strokeWidth={1.5} />Cards</> }, { value: "table", label: <><List strokeWidth={1.5} />Table</> }]} />
            <Button onClick={() => useUi.getState().openComposer("deal")}>New lead</Button>
            <Button variant="ink" onClick={() => useUi.getState().openComposer("company")}><Plus strokeWidth={1.5} /> New client</Button>
          </>
        }
      />
      {layout === "cards" ? (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Select aria-label="Show first" value={focus} onChange={(e) => setFocus(e.target.value as typeof focus)} className="w-[220px]">
              <option value="upcoming">Upcoming first</option>
              <option value="payments">Payments due</option>
              <option value="approval">Waiting on client approval</option>
              <option value="delivered">Delivered</option>
              <option value="name">A to Z</option>
            </Select>
            <span className="t-meta text-ink-3">{cards.length} shown · drop a photo on a card to add it</span>
          </div>
          {cards.length ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(290px,1fr))] gap-5">
              {cards.map(({ r }, i) => <ClientCard key={r.id} company={r} index={i} onOpen={() => setOpened(r.id)} />)}
            </div>
          ) : (
            <EmptyState icon={Building2} title="No clients here" body="Try another filter, or switch the top bar to Both businesses." />
          )}
          <ClientPanel company={s.companies.find((c) => c.id === opened)} onClose={() => setOpened(undefined)} />
        </>
      ) : (
      <DataTable
        data={visibleRows}
        columns={columns}
        noun={["client", "clients"]}
        searchPlaceholder="Search clients, couples, cities"
        initialSort={[{ id: "value", desc: true }]}
        onRowClick={(r) => navigate(`/clients/${r.id}`)}
        empty={<EmptyState icon={Building2} title="No companies match" body="Companies are created when you convert a lead or add a deal. Try a different search." />}
        bulkActions={!isManager ? undefined : (ids, clear) => (
          <>
            <Menu>
              <MenuTrigger asChild><BulkButton>Assign <ChevronDown size={13} strokeWidth={1.5} /></BulkButton></MenuTrigger>
              <MenuContent>
                {s.members.map((m) => (
                  <MenuItem key={m.id} onSelect={() => { s.reassignCompanies(ids, m.id); toast(`${ids.length} assigned to ${m.name}`); clear(); }}>{m.name}</MenuItem>
                ))}
              </MenuContent>
            </Menu>
            <Menu>
              <MenuTrigger asChild><BulkButton>Change stage <ChevronDown size={13} strokeWidth={1.5} /></BulkButton></MenuTrigger>
              <MenuContent>
                {s.businessView === "all" ? (
                  <p className="t-meta m-0 max-w-[240px] px-3 py-2 text-ink-3">Pick Photography or Marketing in the top bar first — each has its own stages.</p>
                ) : (
                  runFor(s.pipelines, s.businessView).map((st) => (
                    <MenuItem
                      key={st.id}
                      onSelect={() => {
                        const targets = rows.filter((r) => ids.includes(r.id) && r.best && isOpen(r.best));
                        targets.forEach((r) => useCrm.getState().moveDeal(r.best!.id, st.id));
                        toast(`${targets.length} best deals moved to ${st.label}`);
                        clear();
                      }}
                    >
                      {st.label}
                    </MenuItem>
                  ))
                )}
              </MenuContent>
            </Menu>
            <Menu>
              <MenuTrigger asChild><BulkButton>Tag <ChevronDown size={13} strokeWidth={1.5} /></BulkButton></MenuTrigger>
              <MenuContent>
                {TAGS.map((t) => (
                  <MenuItem key={t} onSelect={() => { s.tagCompanies(ids, t); toast(`Tagged ${ids.length} with ${t}`); clear(); }}>{t}</MenuItem>
                ))}
              </MenuContent>
            </Menu>
          </>
        )}
      />
      )}
    </>
  );
}

const EDITABLE = [
  { key: "name", label: "Name" },
  { key: "domain", label: "Website", mono: true },
  { key: "industry", label: "Industry" },
  { key: "city", label: "City" },
  { key: "gstin", label: "GSTIN", mono: true },
  { key: "address", label: "Billing address", multiline: true },
] as const;
type EditableKey = (typeof EDITABLE)[number]["key"];

/** A client's details with Edit (business, website, GSTIN, billing address…). Used on the client page. */
export function ClientDetails({ c }: { c: Company }) {
  const s = useCrm();
  const canEdit = useCanEdit(c.ownerId);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Record<EditableKey, string>>({ name: "", domain: "", industry: "", city: "", gstin: "", address: "" });
  const [business, setBusiness] = useState<Business | "">("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const ownerName = s.members.find((m) => m.id === c.ownerId)?.name ?? "Unassigned";
  const startEditing = () => {
    setForm(Object.fromEntries(EDITABLE.map((f) => [f.key, c[f.key] ?? ""])) as Record<EditableKey, string>);
    setBusiness(c.business ?? "");
    setError(undefined);
    setEditing(true);
  };

  if (editing)
    return (
      <form
        className="flex flex-col gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!form.name.trim()) return setError("The company needs a name.");
          if (s.companies.some((x) => x.id !== c.id && x.name.trim().toLowerCase() === form.name.trim().toLowerCase())) return setError(`Another company is already called ${form.name.trim()}.`);
          setBusy(true);
          try {
            const saved = await api<Company>(`/companies/${c.id}`, { method: "PATCH", body: { ...Object.fromEntries(EDITABLE.map((f) => [f.key, form[f.key].trim()])), ...(business && { business }) } });
            useCrm.setState((x) => ({ companies: x.companies.map((co) => (co.id === c.id ? saved : co)) }));
            toast(`Saved ${saved.name}`);
            setEditing(false);
          } catch (err) {
            setError(err instanceof ApiError && err.body && "issues" in err.body ? "Check the GSTIN — it should be 15 characters, like 29ABCDE1234F1Z5." : (err as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {EDITABLE.map((f) => (
          <label key={f.key} className="flex flex-col gap-1.5">
            <span className="fs-12.5 font-medium">{f.label}</span>
            {"multiline" in f ? (
              <Textarea rows={3} value={form[f.key]} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
            ) : (
              <Input value={form[f.key]} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} className={"mono" in f ? "font-mono" : undefined} />
            )}
          </label>
        ))}
        <label className="flex flex-col gap-1.5">
          <span className="fs-12.5 font-medium">Business</span>
          <Select value={business} onChange={(e) => setBusiness(e.target.value as Business | "")}>
            {!business && <option value="">Both / not set</option>}
            {BUSINESSES.map((b) => <option key={b} value={b}>{BUSINESS_LABEL[b]}</option>)}
          </Select>
        </label>
        {error && <p role="alert" className="t-meta m-0 text-risk">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
          <Button type="submit" variant="ink" disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
        </div>
      </form>
    );

  return (
    <div className="flex flex-col gap-6">
      <dl className="m-0 grid grid-cols-[110px_1fr] gap-y-2.5 t-dense">
        <dt className="text-ink-3">Business</dt><dd className="m-0">{c.business ? BUSINESS_LABEL[c.business] : "Both / not set"}</dd>
        <dt className="text-ink-3">Website</dt><dd className="m-0 font-mono fs-12.5">{c.domain || "—"}</dd>
        <dt className="text-ink-3">Industry</dt><dd className="m-0">{c.industry || "—"}</dd>
        <dt className="text-ink-3">City</dt><dd className="m-0">{c.city || "—"}</dd>
        <dt className="text-ink-3">GSTIN</dt><dd className="m-0 font-mono fs-12.5">{c.gstin || "Unregistered"}</dd>
        <dt className="text-ink-3">Billing address</dt><dd className="m-0 whitespace-pre-line">{c.address || <span className="text-ink-3">Not added yet</span>}</dd>
        <dt className="text-ink-3">Owner</dt><dd className="m-0">{ownerName}</dd>
      </dl>
      {canEdit && <Button size="sm" className="-mt-3 self-start" onClick={startEditing}>Edit details</Button>}
    </div>
  );
}
