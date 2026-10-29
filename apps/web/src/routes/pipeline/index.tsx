import { CHANNEL_LABEL, CHANNELS, fmtDay, formatCompact, HEALTH_LABEL, type Channel, type Health, BUSINESS_LABEL, BUSINESSES, type Business } from "@pinnacle/shared";
import { Avatar, Button, ChannelChip, cn, HealthDot, Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger, MoneyText, Segmented, Table, TBody, TD, TH, THead, TR } from "@pinnacle/ui";
import { ChevronDown, Columns3, List, Plus, Users, X } from "lucide-react";
import { useMemo, useState } from "react";
import { PageHeader } from "../../components/page-header";
import { isOpen } from "../../data/derive";
import { probabilityOf, stageRank, stagesFor } from "../../data/pipeline";
import { DealStage } from "../../components/deal/deal-stage";
import { ME_ID } from "../../data/seed";
import { useCrm } from "../../data/store";
import type { Deal } from "../../data/types";
import { useCreateAction, useListNav, usePref } from "../../lib/hooks";
import { useUi } from "../../lib/ui-store";
import { Board } from "./board";
import { ClientPipeline } from "./clients";

export type Filters = { owner?: string; channel?: Channel; health?: Health; month?: "this" | "next" };

// A function so "My deals" uses the signed-in member's id, which is set after this module loads.
const VIEWS = (): { name: string; filters: Filters }[] => [
  { name: "All deals", filters: {} },
  { name: "My deals", filters: { owner: ME_ID } },
  { name: "Closing this month", filters: { month: "this" } },
  { name: "At risk", filters: { health: "risk" } },
];

const monthBounds = (offset: number) => {
  const a = new Date();
  a.setDate(1);
  a.setHours(0, 0, 0, 0);
  a.setMonth(a.getMonth() + offset);
  const b = new Date(a);
  b.setMonth(b.getMonth() + 1);
  return [a, b] as const;
};

export function applyFilters(deals: Deal[], f: Filters) {
  return deals.filter((d) => {
    if (f.owner && d.ownerId !== f.owner) return false;
    if (f.channel && d.channel !== f.channel) return false;
    if (f.health && d.health !== f.health) return false;
    if (f.month) {
      const [a, b] = monthBounds(f.month === "this" ? 0 : 1);
      const c = new Date(d.closeAt);
      if (c < a || c >= b) return false;
    }
    return true;
  });
}

function FilterChip<T extends string>({
  label,
  value,
  display,
  options,
  onChange,
}: {
  label: string;
  value?: T;
  display?: string;
  options: { value: T; label: string }[];
  onChange: (v?: T) => void;
}) {
  return (
    <Menu>
      <MenuTrigger asChild>
        <button
          className={cn(
            "inline-flex h-7 items-center gap-1.5 rounded-control border px-2.5 fs-12.5 transition-colors duration-150",
            value ? "border-line-2 bg-surface text-ink" : "border-dashed border-line-2 text-ink-2 hover:text-ink",
          )}
        >
          {label}
          {value && <span className="font-medium">{display}</span>}
          <ChevronDown size={13} strokeWidth={1.5} className="text-ink-3" />
        </button>
      </MenuTrigger>
      <MenuContent>
        {options.map((o) => (
          <MenuItem key={o.value} checked={value === o.value} onSelect={() => onChange(value === o.value ? undefined : o.value)}>
            {o.label}
          </MenuItem>
        ))}
        {value && (
          <>
            <MenuSeparator />
            <MenuItem onSelect={() => onChange(undefined)}>Clear</MenuItem>
          </>
        )}
      </MenuContent>
    </Menu>
  );
}

export function PipelineRoute() {
  const deals = useCrm((s) => s.deals);
  const members = useCrm((s) => s.members);
  // Client by client is the default; the board and the table are still a click away.
  const [view, setView] = usePref<"clients" | "board" | "table">("pipeline.layout", "clients");
  const [filters, setFilters] = useState<Filters>({});
  const [viewName, setViewName] = useState("All deals");
  useCreateAction(() => useUi.getState().openComposer("deal"));

  const visible = useMemo(() => applyFilters(deals, filters), [deals, filters]);
  const open = visible.filter(isOpen);
  const pipeline = open.reduce((a, d) => a + d.valuePaise, 0);
  const pipelines = useCrm((s) => s.pipelines);
  const weighted = open.reduce((a, d) => a + d.valuePaise * probabilityOf(pipelines, d), 0);
  // The board shows one business's stages: the one being viewed, or the tab picked here when viewing both.
  const businessView = useCrm((s) => s.businessView);
  const [boardTab, setBoardTab] = usePref<Business>("pipeline.business", "photography");
  const boardBusiness: Business = businessView === "all" ? boardTab : businessView;
  const boardDeals = visible.filter((d) => (d.business ?? "photography") === boardBusiness);
  const set = (patch: Filters) => {
    setFilters((f) => ({ ...f, ...patch }));
    setViewName("Custom");
  };
  const anyFilter = Object.values(filters).some(Boolean);

  return (
    <>
      <PageHeader
        title="Pipeline"
        stats={[
          { label: "Open leads", value: open.length },
          { label: "Pipeline", value: pipeline, format: formatCompact, tone: "signal" },
          { label: "Weighted", value: Math.round(weighted), format: formatCompact, tone: "ok" },
        ]}
        actions={
          <>
            <Segmented
              label="Layout"
              value={view}
              onChange={setView}
              options={[
                { value: "clients", label: <><Users strokeWidth={1.5} />Clients</> },
                { value: "board", label: <><Columns3 strokeWidth={1.5} />Board</> },
                { value: "table", label: <><List strokeWidth={1.5} />Table</> },
              ]}
            />
            <Button variant="ink" onClick={() => useUi.getState().openComposer("deal")}>
              <Plus strokeWidth={1.5} /> New lead
            </Button>
          </>
        }
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Menu>
          <MenuTrigger asChild>
            <button className="inline-flex h-7 items-center gap-1.5 rounded-control px-1.5 fs-13 font-medium hover:bg-hover">
              {viewName} <ChevronDown size={13} strokeWidth={1.5} className="text-ink-3" />
            </button>
          </MenuTrigger>
          <MenuContent>
            <MenuLabel>Saved views</MenuLabel>
            {VIEWS().map((v) => (
              <MenuItem key={v.name} checked={viewName === v.name} onSelect={() => { setFilters(v.filters); setViewName(v.name); }}>
                {v.name}
              </MenuItem>
            ))}
          </MenuContent>
        </Menu>
        <span className="mx-1 h-4 w-px bg-line" />
        <FilterChip
          label="Owner"
          value={filters.owner}
          display={members.find((m) => m.id === filters.owner)?.name.split(" ")[0]}
          options={members.map((m) => ({ value: m.id, label: m.name }))}
          onChange={(owner) => set({ owner })}
        />
        <FilterChip
          label="Source"
          value={filters.channel}
          display={filters.channel && CHANNEL_LABEL[filters.channel]}
          options={CHANNELS.map((c) => ({ value: c, label: CHANNEL_LABEL[c] }))}
          onChange={(channel) => set({ channel })}
        />
        <FilterChip
          label="Close"
          value={filters.month}
          display={filters.month === "this" ? "This month" : "Next month"}
          options={[{ value: "this", label: "This month" }, { value: "next", label: "Next month" }]}
          onChange={(month) => set({ month })}
        />
        <FilterChip
          label="Health"
          value={filters.health}
          display={filters.health && HEALTH_LABEL[filters.health]}
          options={(["ok", "warn", "risk"] as const).map((h) => ({ value: h, label: HEALTH_LABEL[h] }))}
          onChange={(health) => set({ health })}
        />
        {anyFilter && (
          <Button variant="ghost" size="sm" onClick={() => { setFilters({}); setViewName("All deals"); }}>
            <X strokeWidth={1.5} /> Clear
          </Button>
        )}
        {view !== "table" && businessView === "all" && (
          <Segmented label="Board for" value={boardTab} onChange={setBoardTab} options={BUSINESSES.map((b) => ({ value: b, label: BUSINESS_LABEL[b] }))} className="ml-auto" />
        )}
      </div>

      {view === "clients" ? (
        <ClientPipeline key={boardBusiness} deals={boardDeals} stages={stagesFor(pipelines, boardBusiness)} business={boardBusiness} />
      ) : view === "board" ? (
        <Board deals={boardDeals} stages={stagesFor(pipelines, boardBusiness)} business={boardBusiness} />
      ) : (
        <DealTable deals={visible} />
      )}
    </>
  );
}

type SortKey = "company" | "stage" | "value" | "close" | "owner";

function DealTable({ deals }: { deals: Deal[] }) {
  const companies = useCrm((s) => s.companies);
  const members = useCrm((s) => s.members);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "close", dir: 1 });
  const name = (d: Deal) => companies.find((c) => c.id === d.companyId)?.name ?? "";
  const pipelines = useCrm((s) => s.pipelines);
  const rows = useMemo(() => {
    const val = (d: Deal) =>
      sort.key === "company" ? name(d) : sort.key === "stage" ? stageRank(pipelines, d) : sort.key === "value" ? d.valuePaise : sort.key === "owner" ? d.ownerId : +new Date(d.closeAt);
    return [...deals].sort((a, b) => (val(a) > val(b) ? 1 : val(a) < val(b) ? -1 : 0) * sort.dir);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deals, sort, companies]);
  const [active] = useListNav(rows.length, (i) => useUi.getState().openDeal(rows[i]!.id));
  const H = ({ k, children, align }: { k: SortKey; children: string; align?: "right" }) => (
    <TH align={align} aria-sort={sort.key === k ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
      <button className="uppercase hover:text-ink" onClick={() => setSort((s) => ({ key: k, dir: s.key === k ? (s.dir === 1 ? -1 : 1) : 1 }))}>
        {children} {sort.key === k ? (sort.dir === 1 ? "↑" : "↓") : ""}
      </button>
    </TH>
  );
  return (
    <div className="border-t border-line">
      <Table>
        <THead>
          <tr>
            <H k="company">Deal</H>
            <H k="stage">Stage</H>
            <H k="value" align="right">Value</H>
            <H k="close">Close</H>
            <TH className="hidden md:table-cell">Source</TH>
            <H k="owner">Owner</H>
            <TH className="w-6"><span className="sr-only">Health</span></TH>
          </tr>
        </THead>
        <TBody>
          {rows.map((d, i) => {
            const owner = members.find((m) => m.id === d.ownerId);
            return (
              <TR key={d.id} data-nav-index={i} onClick={() => useUi.getState().openDeal(d.id)} className={cn(active === i && "bg-hover")}>
                <TD>
                  <div className="font-medium">{name(d)}</div>
                  <div className="fs-11.5 text-ink-3">{d.title}</div>
                </TD>
                <TD><DealStage deal={d} /></TD>
                <TD align="right"><MoneyText paise={d.valuePaise} /></TD>
                <TD numeric className="text-ink-2">{fmtDay(d.closeAt)}</TD>
                <TD className="hidden md:table-cell"><ChannelChip channel={d.channel} /></TD>
                <TD>{owner && <span className="flex items-center gap-2"><Avatar name={owner.name} me={owner.id === ME_ID} /> <span className="hidden text-ink-2 lg:inline">{owner.name}</span></span>}</TD>
                <TD><HealthDot health={d.health} /></TD>
              </TR>
            );
          })}
        </TBody>
      </Table>
      {!rows.length && <p className="t-dense py-8 text-ink-3">No deals match these filters. Clear a filter or create a deal with C.</p>}
      <p className="m-0 mt-3 font-mono fs-11 text-ink-3">{rows.length} deals · {formatCompact(rows.reduce((a, d) => a + d.valuePaise, 0))} · J / K to move · Enter to open</p>
    </div>
  );
}
