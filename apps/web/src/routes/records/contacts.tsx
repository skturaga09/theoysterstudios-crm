import { CHANNEL_LABEL, fmtAgo } from "@pinnacle/shared";
import { Avatar, Button, ChannelChip, Menu, MenuContent, MenuItem, MenuTrigger, MoneyText, Sheet, StageMeter, toast } from "@pinnacle/ui";
import type { ColumnDef } from "@tanstack/react-table";
import { ChevronDown, Download, Plus, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { BulkButton, DataTable } from "../../components/data-table";
import { EmptyState } from "../../components/empty-state";
import { PageHeader } from "../../components/page-header";
import { ME_ID } from "../../data/seed";
import { useCrm } from "../../data/store";
import type { Contact } from "../../data/types";
import { api, save } from "../../lib/api";
import { useCreateAction } from "../../lib/hooks";
import { useUi } from "../../lib/ui-store";

type Row = Contact & { company: string; ownerName: string; reach: string; last: number };

export function ContactsRoute() {
  const s = useCrm();
  const navigate = useNavigate();
  const [openId, setOpenId] = useState<string>();
  useCreateAction(() => useUi.getState().openComposer("contact"));

  const rows: Row[] = useMemo(
    () =>
      s.contacts.map((c) => ({
        ...c,
        company: s.companies.find((x) => x.id === c.companyId)?.name ?? "—",
        ownerName: s.members.find((m) => m.id === c.ownerId)?.name ?? "",
        reach: c.email ?? c.phone ?? c.handle ?? "—",
        last: +new Date(c.lastActivityAt),
      })),
    [s.contacts, s.companies, s.members],
  );

  const columns: ColumnDef<Row, unknown>[] = [
    {
      id: "name",
      header: "Name",
      accessorKey: "name",
      enableHiding: false,
      cell: ({ row: { original: c } }) => (
        <span className="flex items-center gap-2.5">
          <Avatar name={c.name} size="lg" />
          <span className="leading-tight">
            <span className="block font-medium">{c.name}</span>
            <span className="text-[11.5px] text-ink-3">{c.title}</span>
          </span>
        </span>
      ),
    },
    { id: "company", header: "Company", accessorKey: "company" },
    { id: "reach", header: "Email / phone", accessorKey: "reach", cell: ({ getValue }) => <span className="font-mono text-[12px] text-ink-2">{String(getValue())}</span> },
    { id: "source", header: "Source", accessorKey: "source", cell: ({ row: { original: c } }) => <ChannelChip channel={c.source} /> },
    { id: "city", header: "City", accessorKey: "city", cell: ({ getValue }) => <span className="text-ink-2">{String(getValue())}</span> },
    { id: "owner", header: "Owner", accessorKey: "ownerName", cell: ({ row: { original: c } }) => <Avatar name={c.ownerName} me={c.ownerId === ME_ID} /> },
    { id: "last", header: "Last activity", accessorKey: "last", cell: ({ row: { original: c } }) => <span className="font-mono text-[12px] text-ink-2">{fmtAgo(c.lastActivityAt)}</span> },
  ];

  const open = rows.find((r) => r.id === openId);
  const deals = s.deals.filter((d) => open && d.contactId === open.id);
  const convs = s.conversations.filter((c) => open && c.contactId === open.id);

  return (
    <>
      <PageHeader
        eyebrow={`${rows.length} people`}
        title="Contacts"
        actions={
          <>
            <Button onClick={() => useUi.getState().openComposer("deal")}>New deal</Button>
            <Button variant="ink" onClick={() => useUi.getState().openComposer("contact")}><Plus strokeWidth={1.5} /> New contact</Button>
          </>
        }
      />
      <DataTable
        data={rows}
        columns={columns}
        noun={["person", "people"]}
        searchPlaceholder="Search names, companies, emails"
        initialSort={[{ id: "last", desc: true }]}
        onRowClick={(r) => setOpenId(r.id)}
        empty={<EmptyState icon={Users} title="No one matches" body="People are added when a lead is converted or a deal names a contact." />}
        bulkActions={(ids, clear) => (
          <>
            <Menu>
              <MenuTrigger asChild><BulkButton>Assign <ChevronDown size={13} strokeWidth={1.5} /></BulkButton></MenuTrigger>
              <MenuContent>
                {s.members.map((m) => (
                  <MenuItem
                    key={m.id}
                    onSelect={() => {
                      const prev = useCrm.getState().contacts;
                      useCrm.setState({ contacts: prev.map((c) => (ids.includes(c.id) ? { ...c, ownerId: m.id } : c)) });
                      save(Promise.all(ids.map((id) => api(`/contacts/${id}`, { method: "PATCH", body: { ownerId: m.id } }))), () => useCrm.setState({ contacts: prev }));
                      toast(`${ids.length} assigned to ${m.name}`);
                      clear();
                    }}
                  >
                    {m.name}
                  </MenuItem>
                ))}
              </MenuContent>
            </Menu>
            <BulkButton onClick={() => { toast(`Export of ${ids.length} people queued (CSV, DPDP-ready) — M6`); clear(); }}>
              <Download size={13} strokeWidth={1.5} /> Export
            </BulkButton>
          </>
        )}
      />
      <Sheet open={!!open} onOpenChange={(o) => !o && setOpenId(undefined)} eyebrow="Contact" title={open?.name ?? ""}>
        {open && (
          <div className="flex flex-col gap-6">
            <dl className="m-0 grid grid-cols-[110px_1fr] gap-y-2.5 t-dense">
              <dt className="text-ink-3">Title</dt><dd className="m-0">{open.title}</dd>
              <dt className="text-ink-3">Company</dt><dd className="m-0">{open.company}</dd>
              {open.email && <><dt className="text-ink-3">Email</dt><dd className="m-0 font-mono text-[12.5px]">{open.email}</dd></>}
              {open.phone && <><dt className="text-ink-3">Phone</dt><dd className="m-0 font-mono text-[12.5px]">{open.phone}</dd></>}
              {open.handle && <><dt className="text-ink-3">Handle</dt><dd className="m-0 font-mono text-[12.5px]">{open.handle}</dd></>}
              <dt className="text-ink-3">City</dt><dd className="m-0">{open.city}</dd>
              <dt className="text-ink-3">Source</dt><dd className="m-0 flex items-center gap-2"><ChannelChip channel={open.source} />{CHANNEL_LABEL[open.source]}</dd>
              <dt className="text-ink-3">Consent</dt><dd className="m-0 text-ink-2">Captured from {CHANNEL_LABEL[open.source]} enquiry · {fmtAgo(open.lastActivityAt)}</dd>
            </dl>
            <section>
              <h3 className="t-eyebrow m-0 mb-2 text-ink-3">Deals · {deals.length}</h3>
              {deals.map((d) => (
                <button key={d.id} onClick={() => useUi.getState().openDeal(d.id)} className="flex w-full items-center gap-3 border-b border-line py-2.5 text-left hover:bg-hover">
                  <span className="min-w-0 flex-1"><span className="t-dense block font-medium">{d.title}</span><StageMeter stage={d.stage} /></span>
                  <MoneyText paise={d.valuePaise} />
                </button>
              ))}
              {!deals.length && <p className="t-meta m-0 text-ink-3">No deals yet.</p>}
            </section>
            <section>
              <h3 className="t-eyebrow m-0 mb-2 text-ink-3">Conversations · {convs.length}</h3>
              {convs.map((c) => (
                <button key={c.id} onClick={() => { setOpenId(undefined); navigate(`/inbox/${c.id}`); }} className="flex w-full items-center gap-3 border-b border-line py-2.5 text-left hover:bg-hover">
                  <ChannelChip channel={c.channel} />
                  <span className="t-dense min-w-0 flex-1 truncate">{c.messages[c.messages.length - 1]?.body}</span>
                  <span className="font-mono text-[11px] text-ink-3">{fmtAgo(c.lastMessageAt)}</span>
                </button>
              ))}
              {!convs.length && <p className="t-meta m-0 text-ink-3">No linked conversations.</p>}
            </section>
          </div>
        )}
      </Sheet>
    </>
  );
}
