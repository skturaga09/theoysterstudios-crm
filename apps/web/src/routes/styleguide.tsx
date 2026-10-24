import { CHANNELS, crore, fmtDay, lakh, type Health, type Stage } from "@pinnacle/shared";
import {
  Avatar,
  Button,
  Card,
  ChannelChip,
  Checkbox,
  cn,
  HealthDot,
  Input,
  Kbd,
  Ledger,
  MoneyText,
  Pill,
  Sheet,
  StageMeter,
  StrikeText,
  Table,
  TBody,
  TD,
  TH,
  THead,
  toast,
  TR,
  useCommandMenu,
  type LedgerCell,
} from "@pinnacle/ui";
import { ArrowRight, Calendar, Command, Plus, RotateCcw, Search } from "lucide-react";
import { useState, type ReactNode } from "react";
import { PageHeader } from "../components/page-header";
import { companyById, DEALS, MEMBERS } from "../data/seed";

// The styleguide always shows the sample team; "sr" is the sample "me".
const ME_ID = "sr";

const ME = MEMBERS.find((m) => m.id === ME_ID)!;
const person = (id: string) => ({ ...(MEMBERS.find((m) => m.id === id) ?? ME), me: id === ME_ID });

/* ------------------------------------------------------------------ */
/* Layout helpers                                                      */
/* ------------------------------------------------------------------ */

function Section({ n, title, note, children }: { n: string; title: string; note?: ReactNode; children: ReactNode }) {
  return (
    <section id={title.toLowerCase().replace(/\W+/g, "-")} className="scroll-mt-6 border-t border-ink pt-5 pb-14">
      <div className="mb-6 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className="font-mono fs-11 text-ink-3">{n}</span>
        <h2 className="t-sheet m-0">{title}</h2>
        {note && <p className="t-meta m-0 basis-full text-ink-2 md:ml-auto md:basis-auto">{note}</p>}
      </div>
      {children}
    </section>
  );
}

/** Renders the same specimen in a forced-light and forced-dark subtree. */
function ThemePair({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      {(["light", "dark"] as const).map((t) => (
        <div key={t} data-theme={t} className={cn("min-w-0 rounded-panel border border-line p-5 md:p-6", className)}>
          <div className="t-eyebrow mb-5 text-ink-3">{t}</div>
          {children}
        </div>
      ))}
    </div>
  );
}

function Label({ children }: { children: ReactNode }) {
  return <div className="font-mono fs-10.5 tracking-[0.04em] text-ink-3">{children}</div>;
}

/* ------------------------------------------------------------------ */
/* Data                                                                */
/* ------------------------------------------------------------------ */

const COLORS: { token: string; light: string; dark: string; use: string }[] = [
  { token: "bg", light: "#F5F5F2", dark: "#0F1012", use: "App background" },
  { token: "surface", light: "#FFFFFF", dark: "#16171A", use: "Panels, cards, sheet" },
  { token: "sunken", light: "#EDEDE9", dark: "#1D1E22", use: "Board columns, inputs" },
  { token: "hover", light: "#F0F0EC", dark: "#1B1C20", use: "Row hover" },
  { token: "ink", light: "#16181B", dark: "#ECECE7", use: "Text, primary button" },
  { token: "ink-2", light: "#5A5E65", dark: "#A2A5AB", use: "Secondary text" },
  { token: "ink-3", light: "#8E9299", dark: "#6C7077", use: "Labels, axes" },
  { token: "line", light: "#E2E2DC", dark: "#25272B", use: "Hairlines" },
  { token: "line-2", light: "#CFCFC8", dark: "#34373C", use: "Strong borders, empty meter" },
  { token: "signal", light: "#F2551C", dark: "#FF7444", use: "The accent. New, current, act-now, focus" },
  { token: "signal-wash", light: "#FDE8DE", dark: "#3A1D11", use: "New-item flash, drop target" },
  { token: "ok", light: "#1E7F55", dark: "#4FBF8A", use: "Won, on track, paid" },
  { token: "warn", light: "#A86A12", dark: "#D9A04A", use: "Watch, due soon" },
  { token: "risk", light: "#C23B32", dark: "#F06A5E", use: "At risk, overdue, lost" },
];

const TYPE: { name: string; cls: string; spec: string; sample: ReactNode }[] = [
  { name: "Greeting", cls: "t-greeting", spec: "Newsreader 42/1.05", sample: <>Good evening, <em className="text-grad">Saksham</em>.</> },
  { name: "KPI numeral", cls: "t-kpi", spec: "Newsreader 44/1 · tabular", sample: "1.24" },
  { name: "Page title", cls: "t-title", spec: "Newsreader 34/1.05", sample: "Pipeline" },
  { name: "Sheet subtitle", cls: "t-sheet", spec: "Newsreader 22/1.1", sample: "Atlas Athletic" },
  { name: "Body", cls: "t-body", spec: "Geist 14/1.45", sample: "Three unread leads since 2 pm. Two asked for a quote and are waiting on a reply." },
  { name: "Dense UI", cls: "t-dense", spec: "Geist 13/1.45", sample: "Annual retainer · Negotiation · closes 22 Oct" },
  { name: "Meta", cls: "t-meta text-ink-2", spec: "Geist 12.5/1.45", sample: "Last activity 32m ago by Saksham" },
  { name: "Eyebrow", cls: "t-eyebrow text-ink-3", spec: "Geist Mono 11 · upper · +0.08em", sample: "Wednesday · 14 October 2026" },
  { name: "Mono figure", cls: "font-mono fs-13 tnum", spec: "Geist Mono 13 · tabular", sample: "₹13,00,000 · 14:20 IST" },
];

const LEDGER: LedgerCell[] = [
  { label: "Open pipeline", paise: crore(1.24), delta: "+8.2% vs Sep", deltaTone: "ok", spark: [30, 34, 32, 40, 44, 42, 50, 58] },
  { label: "Weighted forecast", paise: lakh(58), delta: "goal ₹70.0 L", deltaTone: "mute", spark: [40, 41, 44, 43, 47, 52, 55, 58] },
  { label: "Won this month", paise: lakh(22), delta: "6 deals", deltaTone: "ok", spark: [8, 10, 9, 14, 12, 16, 18, 22] },
  { label: "Median first reply", value: 38, unit: "min", delta: "+6 min vs Sep", deltaTone: "risk", spark: [52, 48, 41, 36, 33, 35, 31, 38] },
];

const STAGE_LIST: Stage[] = ["new", "qualified", "proposal", "negotiation", "won", "lost"];
const HEALTHS: Health[] = ["ok", "warn", "risk"];

const MOTION = [
  ["Route change", "View Transition · out 180ms −4px · in 320ms +6px · ease.out"],
  ["Page load", "Rise 8px · 60ms stagger · max 6"],
  ["KPI numerals", "Count up 900ms · quartic out · first Home view per session"],
  ["New lead (SSE)", "Slide 14px · spring.soft · signal-wash flash"],
  ["Pipeline drag", "Lift: pop + 1.5° tilt · target: signal-wash + ring · FLIP"],
  ["Deal → Won", "One ok ring pulse, 600ms"],
  ["Convert → deal", "Row collapse 400ms · toast with Undo 3.2s · layoutId"],
  ["Sheet", "Slide from right 450ms ease.out · scrim 2px blur"],
  ["Command menu", "Scale .98 → 1 · spring.snappy"],
  ["Checkbox", "Tick draws 300ms · strike grows 350ms"],
  ["Hover", "Cards rise 1px + pop · rows background only · 150ms"],
  ["Toast", "Rise 20px · spring.snappy · bottom centre"],
];

/* ------------------------------------------------------------------ */
/* Specimens                                                           */
/* ------------------------------------------------------------------ */

function ColorSpecimen() {
  return (
    <ul className="m-0 grid list-none grid-cols-1 gap-x-6 p-0 sm:grid-cols-2">
      {COLORS.map((c) => (
        <li key={c.token} className="flex items-center gap-3 border-b border-line py-2.5">
          <span
            className="size-8 shrink-0 rounded-control shadow-[inset_0_0_0_1px_var(--line)]"
            style={{ background: `var(--${c.token})` }}
          />
          <div className="min-w-0">
            <div className="font-mono fs-12">--{c.token}</div>
            <div className="truncate fs-11.5 text-ink-3">{c.use}</div>
          </div>
          <span className="ml-auto font-mono fs-10.5 text-ink-3 uppercase">
            <span className="theme-hex-light">{c.light}</span>
            <span className="theme-hex-dark">{c.dark}</span>
          </span>
        </li>
      ))}
      <li className="col-span-full flex items-center gap-3 py-3">
        <span className="h-8 w-24 shrink-0 rounded-control bg-grad" />
        <div className="min-w-0">
          <div className="font-mono fs-12">--grad</div>
          <div className="fs-11.5 text-ink-3">Highlights only: your name, logo mark, signal button, current stage</div>
        </div>
      </li>
    </ul>
  );
}

function ButtonsSpecimen() {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ink">
          <Plus strokeWidth={1.5} />
          Create deal
        </Button>
        <Button>Assign</Button>
        <Button variant="ghost">Cancel</Button>
        <Button variant="signal">Create deal</Button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ink" size="sm">Save</Button>
        <Button size="sm">
          <Calendar strokeWidth={1.5} />
          This month
        </Button>
        <Button variant="ghost" size="sm">Clear</Button>
        <Button size="icon" aria-label="Search">
          <Search strokeWidth={1.5} />
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label="Next">
          <ArrowRight strokeWidth={1.5} />
        </Button>
        <Button disabled>Disabled</Button>
      </div>
      <div className="max-w-[320px]">
        <Input placeholder="Search companies…" aria-label="Search companies" />
      </div>
      <Label>ink 34/28 · outline (default) · ghost · signal — one per context, never decoration · press scale .98</Label>
    </div>
  );
}

function AtomsSpecimen() {
  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
      <div className="flex flex-col gap-3">
        <Label>Pill — five tones only</Label>
        <div className="flex flex-wrap gap-2">
          <Pill tone="ok">Paid</Pill>
          <Pill tone="warn">Due soon</Pill>
          <Pill tone="risk">Overdue</Pill>
          <Pill tone="new" dot>New</Pill>
          <Pill tone="mute">Draft</Pill>
        </div>
      </div>
      <div className="flex flex-col gap-3">
        <Label>ChannelChip</Label>
        <div className="flex flex-wrap gap-1.5">
          {CHANNELS.map((c) => (
            <ChannelChip key={c} channel={c} />
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-3">
        <Label>HealthDot — hover or focus for label</Label>
        <div className="flex items-center gap-4">
          {HEALTHS.map((h) => (
            <span key={h} className="flex items-center gap-2 t-meta text-ink-2">
              <HealthDot health={h} />
              {h}
            </span>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-3">
        <Label>Avatar — current user inverted</Label>
        <div className="flex items-center gap-2">
          <Avatar name={ME.name} me size="lg" />
          <Avatar name="Riya V" size="lg" />
          <Avatar name="Aditi K" />
          <Avatar name="Dev Patel" size="sm" />
        </div>
      </div>
      <div className="flex flex-col gap-3">
        <Label>MoneyText — hover or focus for full</Label>
        <div className="flex flex-wrap items-center gap-4 fs-13">
          <MoneyText paise={lakh(13)} />
          <MoneyText paise={crore(1.24)} />
          <MoneyText paise={lakh(0.85)} />
          <MoneyText paise={lakh(13)} full />
        </div>
      </div>
      <div className="flex flex-col gap-3">
        <Label>Kbd</Label>
        <div className="flex flex-wrap items-center gap-3 t-meta text-ink-2">
          <span className="flex gap-1"><Kbd>⌘</Kbd><Kbd>K</Kbd></span>
          <span className="flex gap-1"><Kbd>G</Kbd><Kbd>P</Kbd></span>
          <span className="flex gap-1"><Kbd>J</Kbd><Kbd>K</Kbd></span>
          <Kbd>esc</Kbd>
        </div>
      </div>
    </div>
  );
}

function StageSpecimen() {
  return (
    <ul className="m-0 grid list-none grid-cols-1 gap-y-3 p-0 sm:grid-cols-2">
      {STAGE_LIST.map((s) => (
        <li key={s}>
          <StageMeter stage={s} />
        </li>
      ))}
    </ul>
  );
}

function TableSpecimen() {
  const rows = DEALS.filter((d) => d.stage !== "lost").slice(0, 5);
  return (
    <Table>
      <THead>
        <tr>
          <TH>Deal</TH>
          <TH>Stage</TH>
          <TH align="right">Value</TH>
          <TH>Close</TH>
          <TH>Owner</TH>
          <TH className="w-8">
            <span className="sr-only">Health</span>
          </TH>
        </tr>
      </THead>
      <TBody>
        {rows.map((d) => (
          <TR key={d.id}>
            <TD>
              <div className="font-medium">{companyById(d.companyId)?.name}</div>
              <div className="fs-11.5 text-ink-3">{d.title}</div>
            </TD>
            <TD>
              <StageMeter stage={d.stage} />
            </TD>
            <TD align="right">
              <MoneyText paise={d.valuePaise} />
            </TD>
            <TD numeric className="text-ink-2">{fmtDay(d.closeAt)}</TD>
            <TD>
              <Avatar name={person(d.ownerId).name} me={person(d.ownerId).me} />
            </TD>
            <TD>
              <HealthDot health={d.health} />
            </TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}

function DealCardSpecimen() {
  const d = DEALS.find((x) => x.id === "d-atlas")!;
  const owner = person(d.ownerId);
  return (
    <div className="rounded-panel bg-sunken p-2.5">
      <div className="mb-2 flex items-center gap-2 px-1.5 pt-0.5">
        <span className="fs-12.5 font-medium">Negotiation</span>
        <span className="font-mono fs-11 text-ink-3">2</span>
        <span className="ml-auto font-mono fs-11 text-ink-2 tnum">₹17.8 L</span>
      </div>
      <div className="flex flex-col gap-2">
        {[d, DEALS.find((x) => x.id === "d-lumen")!].map((x) => (
          <Card key={x.id} lift className="cursor-pointer p-3">
            <div className="flex items-center gap-2">
              <HealthDot health={x.health} />
              <span className="truncate fs-13 font-medium">{companyById(x.companyId)?.name}</span>
              <ChannelChip channel={x.channel} className="ml-auto" />
            </div>
            <div className="mt-0.5 pl-4 fs-12.5 text-ink-2">{x.title}</div>
            <div className="mt-3 flex items-center gap-2 pl-4">
              <MoneyText paise={x.valuePaise} className="fs-13" />
              <span className="font-mono fs-11 text-ink-3">{fmtDay(x.closeAt)}</span>
              <Avatar name={person(x.ownerId).name} me={person(x.ownerId).me} size="sm" className="ml-auto" />
            </div>
          </Card>
        ))}
      </div>
      <span className="sr-only">{owner.name}</span>
    </div>
  );
}

function TasksSpecimen() {
  const [done, setDone] = useState<Record<string, boolean>>({ c: true });
  const tasks = [
    { id: "a", title: "Send Meridian renewal proposal", rec: "Meridian Coffee", due: "Overdue", tone: "risk" as const },
    { id: "b", title: "Approve Foxglove moodboard", rec: "Foxglove Interiors", due: "Today", tone: "warn" as const },
    { id: "c", title: "Brief Lumen reshoot", rec: "Lumen Skincare", due: "Done", tone: "mute" as const },
  ];
  return (
    <ul className="m-0 list-none p-0">
      {tasks.map((t) => (
        <li key={t.id} className="flex h-11 items-center gap-3 border-b border-line last:border-b-0">
          <Checkbox
            checked={!!done[t.id]}
            label={t.title}
            onCheckedChange={(v) => setDone((s) => ({ ...s, [t.id]: v }))}
          />
          <div className="min-w-0 flex-1 leading-tight">
            <StrikeText done={!!done[t.id]} className="t-dense">
              {t.title}
            </StrikeText>
            <div className="fs-11.5 text-ink-3">{t.rec}</div>
          </div>
          <Pill tone={done[t.id] ? "mute" : t.tone}>{done[t.id] ? "Done" : t.due}</Pill>
        </li>
      ))}
    </ul>
  );
}

function ElevationSpecimen() {
  return (
    <div className="grid grid-cols-2 gap-6 sm:grid-cols-3">
      {[
        ["6px", "rounded-control", "Controls"],
        ["8px", "rounded-card", "Cards"],
        ["10px", "rounded-panel", "Panels"],
        ["14px", "rounded-menu", "Command menu"],
        ["99px", "rounded-chip", "Chips only"],
      ].map(([px, cls, use]) => (
        <div key={px} className="flex flex-col gap-2">
          <div className={cn("h-12 border border-line-2 bg-surface", cls)} />
          <Label>
            {px} · {use}
          </Label>
        </div>
      ))}
      <div className="flex flex-col gap-2">
        <div className="h-12 rounded-card bg-surface shadow-rest" />
        <Label>--shadow · resting</Label>
      </div>
      <div className="flex flex-col gap-2">
        <div className="h-12 rounded-card bg-surface shadow-pop" />
        <Label>--pop · hover, sheet, menu</Label>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export function StyleguideRoute() {
  const [sheet, setSheet] = useState(false);
  const [ledgerKey, setLedgerKey] = useState(0);
  const atlas = DEALS.find((x) => x.id === "d-atlas")!;

  return (
    <>
      <style>{`
        .theme-hex-dark{display:none}
        [data-theme="dark"] .theme-hex-dark{display:inline}
        [data-theme="dark"] .theme-hex-light{display:none}
        [data-theme="light"] .theme-hex-light{display:inline}
        [data-theme="light"] .theme-hex-dark{display:none}
      `}</style>

      <PageHeader
        eyebrow="Milestone 0 · for review"
        title="Styleguide"
        sub="Every token, type step and component, shown in light and dark. Screens are built from these pieces only."
        actions={
          <Button onClick={() => useCommandMenu.getState().setOpen(true)}>
            <Command strokeWidth={1.5} />
            Open ⌘K
          </Button>
        }
      />

      <Section n="01" title="Colour" note="Warm-green neutrals. One accent. Semantic colours only for health and money.">
        <ThemePair>
          <ColorSpecimen />
        </ThemePair>
      </Section>

      <Section n="02" title="Type" note="Geist for UI · Geist Mono for labels, times, money · Newsreader for titles and numerals.">
        <ul className="m-0 list-none p-0">
          {TYPE.map((t) => (
            <li key={t.name} className="grid grid-cols-1 items-baseline gap-2 border-b border-line py-4 md:grid-cols-[180px_1fr]">
              <div>
                <div className="fs-12.5 font-medium">{t.name}</div>
                <Label>{t.spec}</Label>
              </div>
              <div className={cn(t.cls, "min-w-0")}>{t.sample}</div>
            </li>
          ))}
        </ul>
      </Section>

      <Section n="03" title="Radius and elevation" note="4px grid · gutters 32 / 16 · rows: nav 32, table 44, dense 36.">
        <ThemePair>
          <ElevationSpecimen />
        </ThemePair>
      </Section>

      <Section n="04" title="Buttons and inputs">
        <ThemePair>
          <ButtonsSpecimen />
        </ThemePair>
      </Section>

      <Section n="05" title="Atoms">
        <ThemePair>
          <AtomsSpecimen />
        </ThemePair>
      </Section>

      <Section n="06" title="Stage meter" note="Past ink · current signal · future line-2 · Won all ok · Lost all risk at 50%.">
        <ThemePair>
          <StageSpecimen />
        </ThemePair>
      </Section>

      <Section
        n="07"
        title="Ledger"
        note={
          <Button size="sm" onClick={() => setLedgerKey((k) => k + 1)}>
            <RotateCcw strokeWidth={1.5} />
            Replay count-up
          </Button>
        }
      >
        <Ledger key={ledgerKey} cells={LEDGER} countUp={ledgerKey > 0} />
        <div className="mt-6">
          <ThemePair>
            <Ledger cells={LEDGER} />
          </ThemePair>
        </div>
      </Section>

      <Section n="08" title="Table" note="Flat on the page. Hairline rows, mono headers, money right-aligned.">
        <ThemePair className="px-2 md:px-3">
          <TableSpecimen />
        </ThemePair>
      </Section>

      <Section n="09" title="Deal card" note="Cards are for objects. Hover rises 1px.">
        <ThemePair>
          <div className="max-w-[300px]">
            <DealCardSpecimen />
          </div>
        </ThemePair>
      </Section>

      <Section n="10" title="Tasks and checkbox" note="Tick draws, strike grows left to right.">
        <ThemePair>
          <TasksSpecimen />
        </ThemePair>
      </Section>

      <Section n="11" title="Overlays" note="Sheet, toast and ⌘K render in the current app theme.">
        <div className="flex flex-wrap gap-2">
          <Button variant="ink" onClick={() => setSheet(true)}>
            Open deal sheet
          </Button>
          <Button onClick={() => toast("Deal created in New · ₹7.0 L")}>Toast</Button>
          <Button
            onClick={() =>
              toast("Converted to deal · Verdant Botanicals", {
                action: { label: "Undo", onClick: () => toast("Conversion undone") },
              })
            }
          >
            Toast with Undo
          </Button>
          <Button onClick={() => useCommandMenu.getState().setOpen(true)}>Command menu</Button>
        </div>
      </Section>

      <Section n="12" title="Motion" note="Tokens in packages/ui/motion.ts. Reduced motion: no count-ups, particles or layout animation.">
        <Table>
          <THead>
            <tr>
              <TH>Moment</TH>
              <TH>Spec</TH>
            </tr>
          </THead>
          <TBody>
            {MOTION.map(([m, s]) => (
              <TR key={m} interactive={false}>
                <TD className="font-medium">{m}</TD>
                <TD className="font-mono fs-12 whitespace-normal text-ink-2">{s}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Section>

      <Sheet
        open={sheet}
        onOpenChange={setSheet}
        eyebrow={
          <span className="flex items-center gap-2">
            Deal <ChannelChip channel={atlas.channel} />
          </span>
        }
        title={companyById(atlas.companyId)?.name}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setSheet(false)}>
              Close
            </Button>
            <Button variant="ink">Open full record</Button>
          </div>
        }
      >
        <div className="flex items-baseline gap-3">
          <span className="font-serif fs-32 leading-none tnum">₹13.0</span>
          <span className="font-mono fs-13 text-ink-2">L</span>
          <Pill tone="ok" className="ml-auto">
            On track
          </Pill>
        </div>
        <div className="mt-5">
          <StageMeter stage={atlas.stage} />
        </div>
        <div className="mt-6 rounded-card border border-signal p-4">
          <div className="t-eyebrow mb-1.5 text-signal">Next step</div>
          <p className="t-dense m-0">Send revised SOW with the quarterly campaign add-on. Decision expected Friday.</p>
        </div>
        <dl className="mt-6 grid grid-cols-[120px_1fr] gap-y-3 t-dense">
          <dt className="text-ink-3">Value</dt>
          <dd className="m-0">
            <MoneyText paise={atlas.valuePaise} full />
          </dd>
          <dt className="text-ink-3">Owner</dt>
          <dd className="m-0 flex items-center gap-2">
            <Avatar name={ME.name} me size="sm" /> {ME.name}
          </dd>
          <dt className="text-ink-3">Close date</dt>
          <dd className="m-0 font-mono fs-12.5">{fmtDay(atlas.closeAt)}</dd>
          <dt className="text-ink-3">City</dt>
          <dd className="m-0">Bengaluru</dd>
        </dl>
      </Sheet>
    </>
  );
}
