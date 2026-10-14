import { fmtAgo, STAGE_LABEL, STAGES, type Stage } from "@pinnacle/shared";
import { Avatar, Button, ChannelChip, Input, Menu, MenuContent, MenuItem, MenuTrigger, MoneyText, Sheet, StageMeter, Textarea, toast } from "@pinnacle/ui";
import type { ColumnDef } from "@tanstack/react-table";
import { Building2, ChevronDown, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { BulkButton, DataTable } from "../../components/data-table";
import { Timeline } from "../../components/deal/timeline";
import { EmptyState } from "../../components/empty-state";
import { PageHeader } from "../../components/page-header";
import { isOpen } from "../../data/derive";
import { ME_ID } from "../../data/seed";
import { useCrm } from "../../data/store";
import type { Company, Deal } from "../../data/types";
import { changeStage } from "../../lib/actions";
import { api, ApiError } from "../../lib/api";
import { useCreateAction } from "../../lib/hooks";
import { useUi } from "../../lib/ui-store";

type Row = Company & { best?: Deal; openValue: number; ownerName: string; last: number };
const STAGE_RANK: Record<Stage, number> = { new: 1, qualified: 2, proposal: 3, negotiation: 4, won: 5, lost: 0 };
const TAGS = ["Priority", "Retainer", "Rebrand", "Films", "Packaging", "At risk"];

export const Monogram = ({ name }: { name: string }) => (
  <span className="grid size-8 shrink-0 place-items-center rounded-control bg-sunken font-serif text-[16px] text-ink-2">{name[0]}</span>
);

export function CompaniesRoute() {
  const s = useCrm();
  const [openId, setOpenId] = useState<string>();
  useCreateAction(() => useUi.getState().openComposer("company"));

  const rows: Row[] = useMemo(
    () =>
      s.companies.map((c) => {
        const deals = s.deals.filter((d) => d.companyId === c.id);
        const open = deals.filter(isOpen);
        const best = [...(open.length ? open : deals)].sort((a, b) => STAGE_RANK[b.stage] - STAGE_RANK[a.stage] || b.valuePaise - a.valuePaise)[0];
        return {
          ...c,
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
      header: "Company",
      accessorKey: "name",
      enableHiding: false,
      cell: ({ row: { original: c } }) => (
        <span className="flex items-center gap-3">
          <Monogram name={c.name} />
          <span className="leading-tight">
            <span className="block font-medium">{c.name}</span>
            <span className="font-mono text-[11px] text-ink-3">{c.domain}</span>
          </span>
        </span>
      ),
    },
    { id: "stage", header: "Best deal", accessorFn: (r) => (r.best ? STAGE_RANK[r.best.stage] : -1), cell: ({ row: { original: c } }) => (c.best ? <StageMeter stage={c.best.stage} /> : <span className="text-ink-3">—</span>) },
    { id: "value", header: "Open value", accessorKey: "openValue", meta: { align: "right" }, cell: ({ row: { original: c } }) => (c.openValue ? <MoneyText paise={c.openValue} /> : <span className="text-ink-3">—</span>) },
    { id: "owner", header: "Owner", accessorKey: "ownerName", cell: ({ row: { original: c } }) => <span className="flex items-center gap-2"><Avatar name={c.ownerName} me={c.ownerId === ME_ID} /> <span className="text-ink-2">{c.ownerName}</span></span> },
    { id: "last", header: "Last activity", accessorKey: "last", cell: ({ row: { original: c } }) => <span className="font-mono text-[12px] text-ink-2">{fmtAgo(c.lastActivityAt)}</span> },
    { id: "city", header: "City", accessorKey: "city", cell: ({ getValue }) => <span className="text-ink-2">{String(getValue())}</span> },
    {
      id: "tags",
      header: "Tags",
      enableSorting: false,
      cell: ({ row: { original: c } }) => (
        <span className="flex gap-1">
          {c.tags.map((t) => <span key={t} className="rounded-[4px] border border-line px-1.5 py-px text-[11px] text-ink-2">{t}</span>)}
        </span>
      ),
    },
  ];

  const open = rows.find((r) => r.id === openId);

  return (
    <>
      <PageHeader
        eyebrow={`${rows.length} accounts`}
        title="Companies"
        actions={
          <>
            <Button onClick={() => useUi.getState().openComposer("deal")}>New deal</Button>
            <Button variant="ink" onClick={() => useUi.getState().openComposer("company")}><Plus strokeWidth={1.5} /> New company</Button>
          </>
        }
      />
      <DataTable
        data={rows}
        columns={columns}
        noun={["company", "companies"]}
        searchPlaceholder="Search companies, domains, cities"
        initialSort={[{ id: "value", desc: true }]}
        onRowClick={(r) => setOpenId(r.id)}
        empty={<EmptyState icon={Building2} title="No companies match" body="Companies are created when you convert a lead or add a deal. Try a different search." />}
        bulkActions={(ids, clear) => (
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
                {STAGES.map((st) => (
                  <MenuItem
                    key={st}
                    onSelect={() => {
                      const targets = rows.filter((r) => ids.includes(r.id) && r.best && isOpen(r.best));
                      targets.forEach((r) => useCrm.getState().moveDeal(r.best!.id, st));
                      toast(`${targets.length} best deals moved to ${STAGE_LABEL[st]}`);
                      clear();
                    }}
                  >
                    {STAGE_LABEL[st]}
                  </MenuItem>
                ))}
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

      <Sheet open={!!open} onOpenChange={(o) => !o && setOpenId(undefined)} eyebrow="Company" title={open?.name ?? ""}>
        {open && <CompanyDetail c={open} />}
      </Sheet>
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

function CompanyDetail({ c }: { c: Row }) {
  const s = useCrm();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Record<EditableKey, string>>({ name: "", domain: "", industry: "", city: "", gstin: "", address: "" });
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const deals = s.deals.filter((d) => d.companyId === c.id);
  const contacts = s.contacts.filter((x) => x.companyId === c.id);
  const acts = s.activities.filter((a) => a.companyId === c.id);
  const startEditing = () => {
    setForm(Object.fromEntries(EDITABLE.map((f) => [f.key, c[f.key] ?? ""])) as Record<EditableKey, string>);
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
            const saved = await api<Company>(`/companies/${c.id}`, { method: "PATCH", body: Object.fromEntries(EDITABLE.map((f) => [f.key, form[f.key].trim()])) });
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
            <span className="text-[12.5px] font-medium">{f.label}</span>
            {"multiline" in f ? (
              <Textarea rows={3} value={form[f.key]} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
            ) : (
              <Input value={form[f.key]} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} className={"mono" in f ? "font-mono" : undefined} />
            )}
          </label>
        ))}
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
        <dt className="text-ink-3">Website</dt><dd className="m-0 font-mono text-[12.5px]">{c.domain || "—"}</dd>
        <dt className="text-ink-3">Industry</dt><dd className="m-0">{c.industry || "—"}</dd>
        <dt className="text-ink-3">City</dt><dd className="m-0">{c.city || "—"}</dd>
        <dt className="text-ink-3">GSTIN</dt><dd className="m-0 font-mono text-[12.5px]">{c.gstin || "Unregistered"}</dd>
        <dt className="text-ink-3">Billing address</dt><dd className="m-0 whitespace-pre-line">{c.address || <span className="text-ink-3">Not added yet</span>}</dd>
        <dt className="text-ink-3">Owner</dt><dd className="m-0">{c.ownerName}</dd>
      </dl>
      <Button size="sm" className="-mt-3 self-start" onClick={startEditing}>Edit details</Button>
      <section>
        <h3 className="t-eyebrow m-0 mb-2 text-ink-3">Deals · {deals.length}</h3>
        <ul className="m-0 list-none p-0">
          {deals.map((d) => (
            <li key={d.id}>
              <button onClick={() => useUi.getState().openDeal(d.id)} className="flex w-full items-center gap-3 border-b border-line py-2.5 text-left hover:bg-hover">
                <span className="min-w-0 flex-1">
                  <span className="t-dense block font-medium">{d.title}</span>
                  <StageMeter stage={d.stage} />
                </span>
                <ChannelChip channel={d.channel} />
                <MoneyText paise={d.valuePaise} />
              </button>
            </li>
          ))}
        </ul>
        {deals.some(isOpen) && (
          <Button size="sm" variant="ghost" className="mt-2" onClick={() => changeStage(deals.find(isOpen)!.id, "won")}>Mark best open deal as won</Button>
        )}
      </section>
      <section>
        <h3 className="t-eyebrow m-0 mb-2 text-ink-3">People · {contacts.length}</h3>
        <ul className="m-0 list-none p-0">
          {contacts.map((p) => (
            <li key={p.id} className="flex items-center gap-2.5 border-b border-line py-2 last:border-0">
              <Avatar name={p.name} />
              <span className="t-dense">{p.name}</span>
              <span className="text-[11.5px] text-ink-3">{p.title}</span>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h3 className="t-eyebrow m-0 mb-3 text-ink-3">Activity</h3>
        <Timeline items={acts} showSubject />
      </section>
    </div>
  );
}
