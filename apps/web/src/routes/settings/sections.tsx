import { CHANNEL_LABEL, CHANNELS, formatCompact, gstState, lakh, parseCsv, STAGE_LABEL, STAGES, toCsv, type Channel, type RoutingRule } from "@pinnacle/shared";
import type { Workspace } from "@pinnacle/shared/schemas";
import { Button, ChannelChip, cn, Input, Pill, Segmented, Select, toast } from "@pinnacle/ui";
import { ArrowDown, ArrowRight, ArrowUp, Download, Plus, RefreshCw, Trash2, Unplug, Upload } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useSearchParams } from "react-router";
import { useEffect, useState, type ReactNode } from "react";
import { PROBABILITY } from "../../data/derive";
import { CHANNEL_STATUS, type ChannelStatus } from "../../data/seed";
import { IS_DEMO } from "../../lib/demo";
import { channelsFrom, type IntegrationStatus } from "../../data/sync";
import { GoogleAccounts, GoogleSetup, MetaSetup, setupProgress, useSetupState } from "./setup";
import { defaultOwnerId, useCrm, useMe, useWorkspace } from "../../data/store";
import type { Company, Contact } from "../../data/types";
import { api, ApiError } from "../../lib/api";
import { fmtMin } from "../../shell/sidebar";
import { SettingsHeader } from "./layout";

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-2 border-b border-line py-4 sm:grid-cols-[220px_minmax(0,1fr)] sm:gap-6">
      <div>
        <div className="t-dense font-medium">{label}</div>
        {hint && <div className="mt-0.5 text-[12px] text-ink-3">{hint}</div>}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn("relative h-5 w-9 shrink-0 rounded-chip transition-colors duration-150", checked ? "bg-ink" : "bg-line-2")}
    >
      <motion.span
        className="absolute top-0.5 left-0.5 size-4 rounded-full bg-surface shadow-rest"
        animate={{ x: checked ? 16 : 0 }}
        transition={{ type: "spring", stiffness: 520, damping: 38 }}
      />
    </button>
  );
}

/* ---------- Workspace ---------- */
type WsField = Exclude<keyof Workspace, "membersSeeAllDeals">;
const WS_FIELDS: { key: WsField; label: string; hint: string; placeholder?: string; mono?: boolean; group: "studio" | "connections" }[] = [
  { key: "studioName", label: "Studio name", hint: "Shown in the sidebar and to your team.", group: "studio" },
  { key: "legalName", label: "Legal name", hint: "Printed on tax invoices.", placeholder: "The Oyster Studios LLP", group: "studio" },
  { key: "gstin", label: "GSTIN", hint: "Printed on invoices. Its state decides CGST + SGST or IGST.", placeholder: "29ABCDE1234F1Z5", mono: true, group: "studio" },
  { key: "address", label: "Registered address", hint: "Printed on tax invoices.", placeholder: "Street, city, PIN", group: "studio" },
  { key: "googleDomain", label: "Google Workspace domain", hint: "For Gmail and Calendar. Team addresses on this domain can be connected.", placeholder: "theoysterstudios.com", mono: true, group: "connections" },
  { key: "enquiryEmail", label: "Enquiry inbox", hint: "Shared inbox whose new emails become leads.", placeholder: "enquiry@theoysterstudios.com", mono: true, group: "connections" },
  { key: "instagramHandle", label: "Instagram account", hint: "Business account whose DMs become leads.", placeholder: "@theoysterstudios", mono: true, group: "connections" },
  { key: "whatsappNumber", label: "WhatsApp Business number", hint: "With country code. Used once the WhatsApp API is set up.", placeholder: "+91 98765 43210", mono: true, group: "connections" },
];

export function WorkspaceRoute() {
  const saved = useWorkspace();
  const canEdit = useMe().role === "admin";
  const [form, setForm] = useState<Workspace>(saved);
  const [errors, setErrors] = useState<Partial<Record<WsField, string>>>({});
  const [busy, setBusy] = useState(false);
  const dirty = (Object.keys(form) as WsField[]).some((k) => form[k] !== saved[k]);
  const state = gstState(form.gstin.trim().toUpperCase());

  const field = (f: (typeof WS_FIELDS)[number]) => (
    <Row key={f.key} label={f.label} hint={f.key === "gstin" && state ? `${f.hint} Registered in ${state}.` : f.hint}>
      <Input
        id={`ws-${f.key}`}
        value={form[f.key]}
        placeholder={f.placeholder}
        readOnly={!canEdit}
        onChange={(e) => { setForm({ ...form, [f.key]: e.target.value }); setErrors({ ...errors, [f.key]: undefined }); }}
        aria-invalid={!!errors[f.key]}
        aria-describedby={errors[f.key] ? `ws-${f.key}-error` : undefined}
        className={f.mono ? "font-mono" : undefined}
      />
      {errors[f.key] && <p id={`ws-${f.key}-error`} role="alert" className="t-meta m-0 mt-1.5 text-risk">{errors[f.key]}</p>}
    </Row>
  );

  return (
    <>
      <SettingsHeader title="Workspace" body="How the studio appears on invoices, and the accounts the integrations connect to." />
      {!canEdit && <p className="t-dense mb-6 rounded-card bg-sunken px-4 py-3 text-ink-2">Only admins can change these details.</p>}
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            const next = await api<Workspace>("/workspace", { method: "PUT", body: form });
            useCrm.setState({ workspace: next });
            setForm(next); // show the cleaned-up values (e.g. "@" added, GSTIN upper-cased)
            setErrors({});
            toast("Workspace saved");
          } catch (err) {
            const issues = err instanceof ApiError ? (err.body as { issues?: { path: (string | number)[]; message: string }[] } | undefined)?.issues : undefined;
            if (issues?.length) setErrors(Object.fromEntries(issues.map((i) => [i.path[0], i.message])));
            else toast(`Couldn't save — ${(err as Error).message}`);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Row label="Logo" hint="Shown in the sidebar and on invoices"><img src="/logo.png" alt="Studio logo" className="h-16 w-auto object-contain" /></Row>
        {WS_FIELDS.filter((f) => f.group === "studio").map(field)}
        <Row label="Currency"><span className="t-dense font-mono">INR · ₹ · lakh / crore</span></Row>
        <Row label="Time zone"><span className="t-dense font-mono">Asia/Kolkata (IST, UTC+5:30)</span></Row>

        <h2 className="t-eyebrow m-0 mt-10 mb-1 text-ink-2">Access</h2>
        <Row label="Members see all deals" hint="Off: someone with the Member role sees only the deals they own, with those deals' tasks, activity and invoices. Admins and Managers always see everything.">
          <label className="t-dense inline-flex cursor-pointer items-center gap-2">
            <input type="checkbox" checked={form.membersSeeAllDeals} disabled={!canEdit} onChange={(e) => setForm({ ...form, membersSeeAllDeals: e.target.checked })} className="size-4 accent-[var(--ink)]" />
            {form.membersSeeAllDeals ? "Yes — everyone can see every deal" : "No — Members see only their own deals"}
          </label>
        </Row>

        <h2 className="t-eyebrow m-0 mt-10 mb-1 text-ink-2">Connections</h2>
        <p className="t-dense m-0 mb-2 text-ink-3">The integrations read these. Changing one here doesn't connect anything yet.</p>
        {WS_FIELDS.filter((f) => f.group === "connections").map(field)}

        {canEdit && (
          <div className="flex justify-end gap-2 pt-4">
            {dirty && <Button type="button" variant="ghost" onClick={() => { setForm(saved); setErrors({}); }}>Discard</Button>}
            <Button type="submit" variant="ink" disabled={!dirty || busy}>{busy ? "Saving…" : "Save changes"}</Button>
          </div>
        )}
      </form>
    </>
  );
}

/* ---------- Pipelines ---------- */
export function PipelineSettingsRoute() {
  const deals = useCrm((s) => s.deals);
  return (
    <>
      <SettingsHeader title="Pipelines & stages" body="Stages every deal moves through. Probability drives the weighted forecast on Home and Reports." />
      <ol className="m-0 list-none p-0">
        {[...STAGES, "lost" as const].map((s, i) => (
          <li key={s} className="flex items-center gap-4 border-b border-line py-3">
            <span className="w-6 font-mono text-[11px] text-ink-3">{s === "lost" ? "—" : i + 1}</span>
            <span className="t-dense flex-1 font-medium">{STAGE_LABEL[s]}</span>
            <span className="font-mono text-[11.5px] text-ink-3">{deals.filter((d) => d.stage === s).length} deals</span>
            <label className="flex items-center gap-2">
              <span className="sr-only">Probability for {STAGE_LABEL[s]}</span>
              <Input defaultValue={Math.round(PROBABILITY[s] * 100)} disabled={s === "won" || s === "lost"} className="h-8 w-16 text-right font-mono" />
              <span className="font-mono text-[12px] text-ink-3">%</span>
            </label>
          </li>
        ))}
      </ol>
      <p className="t-meta mt-4 text-ink-3">Renaming and adding stages arrives with the API (M6). Won and Lost are fixed.</p>
    </>
  );
}

/* ---------- Integrations ---------- */
const ABOUT: Record<Channel, string> = {
  gmail: "New emails to enquiry@ and each connected inbox; first-time senders become leads. Read-only: the CRM never sends, deletes or changes mail.",
  calendar: "Meetings with known contacts appear on their deals. Bookings from new people through your appointment schedules become leads.",
  instagram: "DMs to your Instagram Business account arrive in Inbox as leads.",
  facebook: "New Lead Ads submissions arrive with their form fields.",
  whatsapp: "Messages to your WhatsApp Business number, once the WhatsApp Business API is set up.",
  web: "Enquiries from a form on your website.",
  referral: "",
};
/** Which one-time setup a channel needs. Gmail and Calendar share the Google Workspace setup. */
const SETUP_FOR: Partial<Record<Channel, "google" | "meta">> = { gmail: "google", calendar: "google", instagram: "meta" };

export function IntegrationsRoute() {
  const isAdmin = useMe().role === "admin";
  const setup = useSetupState();
  const [params] = useSearchParams();
  // Which channel's setup steps are open; ?setup=google|meta opens the first channel that uses it.
  const [open, setOpen] = useState<Channel | undefined>(() => (Object.keys(SETUP_FOR) as Channel[]).find((c) => SETUP_FOR[c] === params.get("setup")));
  // Demo: sample connections you can click around. Live: the real status of each channel.
  const [demoItems, setDemoItems] = useState<(ChannelStatus & { connected: boolean })[]>(CHANNEL_STATUS.map((c) => ({ ...c, connected: true })));
  const update = (ch: Channel, patch: Partial<ChannelStatus & { connected: boolean }>) => setDemoItems((xs) => xs.map((x) => (x.channel === ch ? { ...x, ...patch } : x)));
  const live = useCrm((s) => s.channels);
  const items = IS_DEMO
    ? demoItems
    : CHANNEL_STATUS.map((c) => {
        const l = live.find((x) => x.channel === c.channel);
        return l ? { ...l, connected: true } : { ...c, connected: false };
      });
  const [confirmDisconnect, setConfirmDisconnect] = useState<Channel>();
  // Full status (connected Google accounts etc.); the sidebar's summary in the store is refreshed with it.
  const [status, setStatus] = useState<IntegrationStatus>();
  const refresh = async () => {
    if (IS_DEMO) return;
    const s = await api<IntegrationStatus>("/integrations").catch(() => undefined);
    if (!s) return;
    setStatus(s);
    useCrm.setState({ channels: channelsFrom(s) });
  };
  useEffect(() => void refresh(), [setup.keys]);
  // Coming back from Instagram sign-in: say how it went once.
  useEffect(() => {
    const result = params.get("instagram");
    if (result === "connected") toast("Instagram connected — new DMs will appear in Inbox");
    else if (result === "cancelled") toast("Instagram sign-in was cancelled");
    else if (result) toast("Couldn't connect Instagram — check the three keys and the redirect URI, then try again");
    const google = params.get("google");
    if (google === "connected") toast(`Connected ${params.get("detail") ?? "Google"} — new emails and bookings will appear in Inbox`);
    else if (google === "cancelled") toast("Google sign-in was cancelled");
    else if (google) toast(`Couldn't connect Google — ${params.get("detail") ?? "check the setup steps and try again"}`);
  }, [params]);
  return (
    <>
      <SettingsHeader title="Integrations" body="Where leads come from. Each connected channel feeds the Inbox. Gmail, Calendar and Instagram need a one-time setup in your own Google Workspace and Meta accounts — open Set up on each." />
      <ul className="m-0 list-none p-0">
        {items.map((c) => {
          const kind = SETUP_FOR[c.channel];
          const p = kind && setupProgress(setup, kind);
          const expanded = open === c.channel;
          return (
            <li key={c.channel} className="border-b border-line py-5">
              <div className="flex flex-wrap items-start gap-4">
                <ChannelChip channel={c.channel} className="h-9 min-w-9 text-[11px]" />
                <div className="min-w-0 flex-1 basis-[260px]">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="t-dense m-0 font-medium">{CHANNEL_LABEL[c.channel]}</h3>
                    {c.connected ? (
                      c.status === "ok" ? <Pill tone="ok" dot>Connected</Pill> : <Pill tone="warn" dot>Needs attention</Pill>
                    ) : p && p.done > 0 ? (
                      <Pill tone="new">Setting up · {p.done} of {p.total}</Pill>
                    ) : (
                      <Pill tone="mute">Not connected</Pill>
                    )}
                  </div>
                  <p className="t-meta m-0 mt-1 max-w-[60ch] text-ink-2">{ABOUT[c.channel]}</p>
                  {c.connected && (
                    <p className="m-0 mt-2 font-mono text-[11.5px] text-ink-3">
                      {c.account} · last event {fmtMin(c.lastEventMin)} ago
                    </p>
                  )}
                  {c.connected && c.note && <p className="t-meta m-0 mt-2 rounded-control bg-warn-wash px-3 py-2 text-warn">{c.note}</p>}
                </div>
                <div className="flex gap-2">
                  {c.connected && !IS_DEMO && kind === "google" ? (
                    <Button size="sm" variant={c.status === "warn" ? "ink" : "outline"} aria-expanded={expanded} onClick={() => setOpen(expanded ? undefined : c.channel)}>
                      {expanded ? "Hide" : "Manage accounts"}
                    </Button>
                  ) : c.connected && !IS_DEMO ? (
                    isAdmin && (
                      <>
                        <Button size="sm" variant={c.status === "warn" ? "ink" : "outline"} aria-expanded={expanded} onClick={() => setOpen(expanded ? undefined : c.channel)}>
                          <RefreshCw strokeWidth={1.5} /> {expanded ? "Hide" : "Reconnect"}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setConfirmDisconnect(c.channel)}>
                          <Unplug strokeWidth={1.5} /> Disconnect
                        </Button>
                      </>
                    )
                  ) : c.connected ? (
                    <>
                      <Button size="sm" variant={c.status === "warn" ? "ink" : "outline"} onClick={() => { update(c.channel, { status: "ok", note: undefined, lastEventMin: 0 }); toast(`${CHANNEL_LABEL[c.channel]} re-authorised`); }}>
                        <RefreshCw strokeWidth={1.5} /> Re-authorise
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => { update(c.channel, { connected: false }); toast(`${CHANNEL_LABEL[c.channel]} disconnected`, { action: { label: "Undo", onClick: () => update(c.channel, { connected: true }) } }); }}>
                        <Unplug strokeWidth={1.5} /> Disconnect
                      </Button>
                    </>
                  ) : IS_DEMO ? (
                    <Button size="sm" variant="ink" onClick={() => { update(c.channel, { connected: true, status: "ok", lastEventMin: 0 }); toast(`${CHANNEL_LABEL[c.channel]} connected`); }}>Connect</Button>
                  ) : kind && (isAdmin || (kind === "google" && status?.google.ready)) ? (
                    <Button size="sm" variant={expanded ? "ghost" : "ink"} aria-expanded={expanded} onClick={() => setOpen(expanded ? undefined : c.channel)}>
                      {expanded ? "Hide" : isAdmin ? "Set up" : "Connect my account"}
                    </Button>
                  ) : (
                    <Button size="sm" disabled title={kind ? "Only admins can set this up" : "Planned for later"}>{kind ? "Admins only" : "Later"}</Button>
                  )}
                </div>
              </div>
              {expanded && kind === "google" && (isAdmin ? <GoogleSetup state={setup} status={status} onChanged={() => void refresh()} /> : <GoogleAccounts status={status} onChanged={() => void refresh()} />)}
              {expanded && kind === "meta" && <MetaSetup state={setup} connected={c.connected} />}
              {confirmDisconnect === c.channel && (
                <div className="mt-3 flex flex-wrap items-center gap-3 rounded-card bg-risk-wash px-4 py-3">
                  <p className="t-dense m-0 flex-1">Disconnect {CHANNEL_LABEL[c.channel]}? New messages stop arriving. Conversations already in Inbox stay.</p>
                  <Button size="sm" variant="ghost" onClick={() => setConfirmDisconnect(undefined)}>Keep</Button>
                  <Button
                    size="sm"
                    variant="ink"
                    className="bg-risk hover:bg-risk/90"
                    onClick={async () => {
                      try {
                        await api("/integrations/instagram/disconnect", { method: "POST" });
                        useCrm.setState({ channels: channelsFrom(await api<IntegrationStatus>("/integrations")) });
                        toast(`${CHANNEL_LABEL[c.channel]} disconnected`);
                      } catch (e) {
                        toast(`Couldn't disconnect — ${(e as Error).message}`);
                      }
                      setConfirmDisconnect(undefined);
                    }}
                  >
                    Disconnect
                  </Button>
                </div>
              )}
              {c.channel === "web" && c.connected && (
                <pre className="mt-3 overflow-x-auto rounded-card bg-sunken p-3 font-mono text-[11.5px] text-ink-2">{`<script src="https://theoysterstudios.web.app/form.js" data-workspace="pinnacle" async></script>`}</pre>
              )}
            </li>
          );
        })}
      </ul>
      {IS_DEMO && <p className="t-meta mt-4 text-ink-3">Demo: connection status here is sample data.</p>}
    </>
  );
}

/* ---------- Lead routing ---------- */
export function RoutingRoute() {
  const members = useCrm((s) => s.members);
  const rules = useCrm((s) => s.routing);
  const setRouting = useCrm((s) => s.setRouting);
  const canEdit = useMe().role === "admin";
  const [draft, setDraft] = useState<{ channel: string; city: string; min: string; ownerId: string }>({ channel: "", city: "", min: "", ownerId: members[0]?.id ?? "" });
  const owner = (id: string) => members.find((m) => m.id === id);
  const describe = (r: RoutingRule) =>
    [r.channel && `channel is ${CHANNEL_LABEL[r.channel]}`, r.city && `city is ${r.city}`, r.minPaise && `estimated value ≥ ${formatCompact(r.minPaise)}`].filter(Boolean).join(" and ");
  const move = (i: number, by: -1 | 1) => {
    const next = [...rules];
    [next[i], next[i + by]] = [next[i + by]!, next[i]!];
    setRouting(next);
  };
  return (
    <>
      <SettingsHeader title="Lead routing" body="New leads get an owner from the first rule that matches, top to bottom. If none match, they stay unassigned in Inbox." />
      {!canEdit && <p className="t-dense mb-6 rounded-card bg-sunken px-4 py-3 text-ink-2">Only admins can change the rules.</p>}
      {!rules.length && <p className="t-dense m-0 border-b border-line py-4 text-ink-3">No rules yet, so every new lead starts unassigned. For example: when channel is Instagram → your salesperson.</p>}
      <ol className="m-0 list-none p-0">
        <AnimatePresence initial={false}>
          {rules.map((r, i) => {
            const who = owner(r.ownerId);
            return (
              <motion.li key={r.id} layout exit={{ opacity: 0, height: 0 }} className="flex items-center gap-3 overflow-hidden border-b border-line py-3">
                <span className="w-6 font-mono text-[11px] text-ink-3">{i + 1}</span>
                <span className="t-dense min-w-0 flex-1">When {describe(r)}</span>
                <ArrowRight size={14} strokeWidth={1.5} className="text-ink-3" />
                <span className={cn("t-dense w-36 font-medium", !who && "text-risk")} title={who ? undefined : "No longer on the team — this rule is skipped"}>
                  {who?.name ?? "Removed teammate"}
                </span>
                {canEdit && (
                  <span className="flex">
                    <Button size="icon-sm" variant="ghost" aria-label={`Move rule ${i + 1} up`} disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp strokeWidth={1.5} /></Button>
                    <Button size="icon-sm" variant="ghost" aria-label={`Move rule ${i + 1} down`} disabled={i === rules.length - 1} onClick={() => move(i, 1)}><ArrowDown strokeWidth={1.5} /></Button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Delete rule ${i + 1}`}
                      onClick={() => {
                        setRouting(rules.filter((x) => x.id !== r.id));
                        toast("Rule deleted", { action: { label: "Undo", onClick: () => setRouting(rules) } });
                      }}
                    >
                      <Trash2 strokeWidth={1.5} />
                    </Button>
                  </span>
                )}
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ol>
      {canEdit && (
        <form
          className="mt-6 grid grid-cols-2 gap-3 rounded-panel border border-line bg-surface p-4 md:grid-cols-[1fr_1fr_110px_1fr_auto] md:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            const min = draft.min.trim() ? parseFloat(draft.min) : undefined;
            if (!draft.channel && !draft.city.trim() && min === undefined) return toast("Pick at least one condition");
            if (min !== undefined && !(min > 0)) return toast("Enter the minimum value in lakh, for example 5");
            if (!owner(draft.ownerId)) return toast("Choose who gets these leads");
            setRouting([
              ...rules,
              { id: `r${Date.now()}`, channel: (draft.channel || undefined) as Channel | undefined, city: draft.city.trim() || undefined, minPaise: min === undefined ? undefined : lakh(min), ownerId: draft.ownerId },
            ]);
            setDraft({ channel: "", city: "", min: "", ownerId: draft.ownerId });
            toast("Rule added");
          }}
        >
          <label className="flex flex-col gap-1.5"><span className="text-[12px] text-ink-3">Channel</span>
            <Select value={draft.channel} onChange={(e) => setDraft({ ...draft, channel: e.target.value })}>
              <option value="">Any</option>
              {CHANNELS.map((c) => <option key={c} value={c}>{CHANNEL_LABEL[c]}</option>)}
            </Select>
          </label>
          <label className="flex flex-col gap-1.5"><span className="text-[12px] text-ink-3">City</span>
            <Input value={draft.city} onChange={(e) => setDraft({ ...draft, city: e.target.value })} placeholder="Any" />
          </label>
          <label className="flex flex-col gap-1.5"><span className="text-[12px] text-ink-3">Min value (₹ L)</span>
            <Input inputMode="decimal" value={draft.min} onChange={(e) => setDraft({ ...draft, min: e.target.value })} placeholder="—" className="font-mono" />
          </label>
          <label className="flex flex-col gap-1.5"><span className="text-[12px] text-ink-3">Assign to</span>
            <Select value={draft.ownerId} onChange={(e) => setDraft({ ...draft, ownerId: e.target.value })}>
              {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </Select>
          </label>
          <Button type="submit" variant="ink" className="col-span-2 md:col-span-1"><Plus strokeWidth={1.5} /> Add rule</Button>
        </form>
      )}
    </>
  );
}

/* ---------- Notifications ---------- */
const EVENTS = [
  ["lead", "New lead arrives", "Any channel, unassigned or assigned to you"],
  ["assigned", "Something is assigned to you", "Conversations, deals, tasks"],
  ["won", "A deal is won", "Across the studio"],
  ["overdue", "An invoice goes overdue", "Admins and the deal owner"],
  ["task", "A task is due", "At the due time, IST"],
] as const;
export function NotificationsRoute() {
  const [prefs, setPrefs] = useState<Record<string, { app: boolean; email: boolean }>>({
    lead: { app: true, email: false },
    assigned: { app: true, email: true },
    won: { app: true, email: false },
    overdue: { app: true, email: true },
    task: { app: true, email: false },
  });
  const set = (k: string, ch: "app" | "email", v: boolean) => setPrefs((p) => ({ ...p, [k]: { ...p[k]!, [ch]: v } }));
  return (
    <>
      <SettingsHeader title="Notifications" body="What you hear about, and where. These are yours; teammates set their own." />
      <div className="mb-1 grid grid-cols-[minmax(0,1fr)_64px_64px] gap-4 pb-2 font-mono text-[10.5px] tracking-[0.08em] text-ink-3 uppercase">
        <span>Event</span><span className="text-center">In app</span><span className="text-center">Email</span>
      </div>
      {EVENTS.map(([k, label, hint]) => (
        <div key={k} className="grid grid-cols-[minmax(0,1fr)_64px_64px] items-center gap-4 border-t border-line py-3">
          <div><div className="t-dense font-medium">{label}</div><div className="text-[12px] text-ink-3">{hint}</div></div>
          <span className="flex justify-center"><Switch label={`${label} in app`} checked={prefs[k]!.app} onChange={(v) => set(k, "app", v)} /></span>
          <span className="flex justify-center"><Switch label={`${label} by email`} checked={prefs[k]!.email} onChange={(v) => set(k, "email", v)} /></span>
        </div>
      ))}
    </>
  );
}

/* ---------- Import (CSV from spreadsheets / Notion) ---------- */
type ImportTarget = "contacts" | "companies";
type ImportField = { key: string; label: string; required?: boolean; guess: RegExp };
const IMPORT_FIELDS: Record<ImportTarget, ImportField[]> = {
  companies: [
    { key: "name", label: "Company name", required: true, guess: /^(company|company name|name|organi[sz]ation|account|brand|client)$/i },
    { key: "domain", label: "Website", guess: /web|domain|url|site/i },
    { key: "industry", label: "Industry", guess: /industry|sector|category/i },
    { key: "city", label: "City", guess: /city|location|town/i },
    { key: "gstin", label: "GSTIN", guess: /gst/i },
    { key: "address", label: "Billing address", guess: /address|billing/i },
    { key: "tags", label: "Tags", guess: /tag|label/i },
  ],
  contacts: [
    { key: "name", label: "Name", required: true, guess: /^(name|full ?name|contact|contact name|person|client name|lead name|lead)$/i },
    { key: "email", label: "Email", guess: /e-?mail/i },
    { key: "phone", label: "Phone", guess: /phone|mobile|whats ?app|number|contact no/i },
    { key: "companyName", label: "Company", guess: /company|organi[sz]ation|brand|business/i },
    { key: "title", label: "Title", guess: /title|role|designation|position/i },
    { key: "city", label: "City", guess: /city|location|town/i },
    { key: "handle", label: "Instagram", guess: /insta|handle|^ig$/i },
    { key: "source", label: "Source", guess: /source|channel/i },
  ],
};
/** Spreadsheet wording → channel ("Insta DM" → instagram). Unknown → the default chosen above the preview. */
const channelFrom = (v: string): Channel | undefined =>
  /insta|\big\b/i.test(v) ? "instagram" : /whats/i.test(v) ? "whatsapp" : /facebook|\bfb\b|meta|lead ad/i.test(v) ? "facebook"
  : /calendar|meeting|booking/i.test(v) ? "calendar" : /web|site|form/i.test(v) ? "web" : /mail/i.test(v) ? "gmail" : /refer|friend|word/i.test(v) ? "referral" : undefined;

function guessMapping(target: ImportTarget, headers: string[]) {
  const used = new Set<number>();
  return Object.fromEntries(
    IMPORT_FIELDS[target].map((f) => {
      const i = headers.findIndex((h, k) => !used.has(k) && f.guess.test(h.trim()));
      if (i >= 0) used.add(i);
      return [f.key, i];
    }),
  ) as Record<string, number>;
}

type ImportResult = { created: number; companiesCreated?: number; skipped: { row: number; reason: string }[] };

function ImportPanel() {
  const members = useCrm((s) => s.members);
  const [target, setTarget] = useState<ImportTarget>("contacts");
  const [file, setFile] = useState<{ name: string; headers: string[]; rows: string[][] }>();
  const [mapping, setMapping] = useState<Record<string, number>>({});
  const [ownerId, setOwnerId] = useState(defaultOwnerId);
  const [source, setSource] = useState<Channel>("referral");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult>();
  const fields = IMPORT_FIELDS[target];

  const records = (file?.rows ?? []).map((cells) => {
    const r: Record<string, unknown> = { ownerId };
    for (const f of fields) {
      const v = (cells[mapping[f.key] ?? -1] ?? "").trim();
      if (!v) continue;
      r[f.key] = f.key === "tags" ? v.split(/[;,]/).map((t) => t.trim()).filter(Boolean) : f.key === "source" ? channelFrom(v) : v;
    }
    if (target === "contacts") r.source ??= source;
    return r;
  });
  const missing = fields.filter((f) => f.required && (mapping[f.key] ?? -1) < 0);

  return (
    <section className="mb-10 rounded-panel border border-line bg-surface p-4 md:p-5" aria-labelledby="import-h">
      <h2 id="import-h" className="m-0 mb-1 flex items-center gap-2 text-[14px] font-medium"><Upload size={16} strokeWidth={1.5} /> Import from a spreadsheet</h2>
      <p className="t-meta m-0 mb-4 text-ink-3">Export a CSV from Google Sheets, Excel or Notion (… menu → Export → CSV). Up to 2,000 rows at a time. Duplicates are skipped: contacts by email, companies by name.</p>
      <div className="flex flex-wrap items-end gap-3">
        <Segmented label="Import" value={target} onChange={(t) => { setTarget(t); setMapping(file ? guessMapping(t, file.headers) : {}); setResult(undefined); }} options={[{ value: "contacts", label: "Contacts" }, { value: "companies", label: "Companies" }]} />
        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] text-ink-3">CSV file</span>
          <input
            type="file"
            accept=".csv,text/csv"
            className="t-dense file:mr-3 file:rounded-control file:border file:border-line-2 file:bg-surface file:px-3 file:py-1.5 file:text-[12.5px]"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              setResult(undefined);
              if (!f) return setFile(undefined);
              const [headers = [], ...rows] = parseCsv(await f.text());
              if (!rows.length) return toast("That file has no rows under the header.");
              if (rows.length > 2000) return toast(`That file has ${rows.length} rows — split it into files of 2,000 or fewer.`);
              setFile({ name: f.name, headers, rows });
              setMapping(guessMapping(target, headers));
            }}
          />
        </label>
      </div>

      {file && (
        <>
          <h3 className="t-eyebrow m-0 mt-6 mb-2 text-ink-3">Match the columns · {file.rows.length} rows in {file.name}</h3>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {fields.map((f) => (
              <label key={f.key} className="flex flex-col gap-1.5">
                <span className="text-[12px] text-ink-3">{f.label}{f.required && " *"}</span>
                <Select value={mapping[f.key] ?? -1} onChange={(e) => setMapping({ ...mapping, [f.key]: Number(e.target.value) })}>
                  <option value={-1}>— Skip —</option>
                  {file.headers.map((h, k) => <option key={k} value={k}>{h || `Column ${k + 1}`}</option>)}
                </Select>
              </label>
            ))}
            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] text-ink-3">Owner for all rows</span>
              <Select value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>{members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</Select>
            </label>
            {target === "contacts" && (
              <label className="flex flex-col gap-1.5">
                <span className="text-[12px] text-ink-3">Source when not given</span>
                <Select value={source} onChange={(e) => setSource(e.target.value as Channel)}>{CHANNELS.map((c) => <option key={c} value={c}>{CHANNEL_LABEL[c]}</option>)}</Select>
              </label>
            )}
          </div>

          <div className="mt-5 overflow-x-auto">
            <table className="w-full text-left t-dense">
              <thead><tr>{fields.filter((f) => (mapping[f.key] ?? -1) >= 0).map((f) => <th key={f.key} className="t-eyebrow border-b border-line py-2 pr-4 font-normal text-ink-3">{f.label}</th>)}</tr></thead>
              <tbody>
                {records.slice(0, 5).map((r, k) => (
                  <tr key={k}>{fields.filter((f) => (mapping[f.key] ?? -1) >= 0).map((f) => <td key={f.key} className="border-b border-line py-2 pr-4">{Array.isArray(r[f.key]) ? (r[f.key] as string[]).join(", ") : f.key === "source" ? CHANNEL_LABEL[r.source as Channel] : String(r[f.key] ?? "—")}</td>)}</tr>
                ))}
              </tbody>
            </table>
            {file.rows.length > 5 && <p className="t-meta m-0 mt-2 text-ink-3">…and {file.rows.length - 5} more</p>}
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            {missing.length > 0 && <span className="t-meta text-risk">Choose a column for {missing.map((f) => f.label).join(", ")}.</span>}
            <Button
              variant="ink"
              className="ml-auto"
              disabled={busy || missing.length > 0}
              onClick={async () => {
                setBusy(true);
                try {
                  const res = await api<ImportResult>(`/import/${target}`, { method: "POST", body: { rows: records } });
                  setResult(res);
                  const [companies, contacts] = await Promise.all([api<Company[]>("/companies"), api<Contact[]>("/contacts")]);
                  useCrm.setState({ companies, contacts });
                  toast(`Imported ${res.created} ${target}${res.skipped.length ? ` · ${res.skipped.length} skipped` : ""}`);
                } catch (err) {
                  toast(`Import failed — ${(err as Error).message}. Nothing was imported.`);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "Importing…" : `Import ${file.rows.length} ${target}`}
            </Button>
          </div>
        </>
      )}

      {result && (
        <div className="mt-5 border-t border-line pt-4" role="status">
          <p className="t-dense m-0 font-medium">
            Imported {result.created} {target}{result.companiesCreated ? `, plus ${result.companiesCreated} new ${result.companiesCreated === 1 ? "company" : "companies"}` : ""}.
            {result.skipped.length > 0 && ` ${result.skipped.length} skipped:`}
          </p>
          {result.skipped.length > 0 && (
            <ul className="m-0 mt-2 max-h-48 list-none overflow-y-auto p-0 font-mono text-[11.5px] text-ink-2">
              {result.skipped.slice(0, 200).map((x) => <li key={x.row}>Row {x.row + 1}: {x.reason}</li>)}
            </ul>
          )}
          {result.skipped.length > 0 && <p className="t-meta m-0 mt-2 text-ink-3">Row numbers match the spreadsheet (the header is row 1). Fix those rows and import the file again — rows already imported are skipped as duplicates.</p>}
        </div>
      )}
    </section>
  );
}

/* ---------- Data export ---------- */
function download(name: string, text: string, type = "text/csv") {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}
export function DataRoute() {
  const s = useCrm();
  const [contactId, setContactId] = useState(s.contacts[0]?.id ?? "");
  const [confirm, setConfirm] = useState(false);
  const contact = s.contacts.find((c) => c.id === contactId);
  const csv = toCsv;
  return (
    <>
      <SettingsHeader title="Import & export" body="Bring in your existing spreadsheets, and take your data with you whenever you want. Per-person export and deletion support requests under India's DPDP Act 2023." />
      <ImportPanel />
      <Row label="Everything" hint="Deals, companies, contacts, tasks, invoices as CSV">
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["deals", s.deals],
              ["companies", s.companies],
              ["contacts", s.contacts],
              ["tasks", s.tasks],
            ] as const
          ).map(([n, rows]) => (
            <Button key={n} size="sm" onClick={() => { download(`oyster-studios-${n}.csv`, csv(rows as object[])); toast(`Exported ${rows.length} ${n}`); }}>
              <Download strokeWidth={1.5} /> {n[0]!.toUpperCase() + n.slice(1)}
            </Button>
          ))}
        </div>
      </Row>
      <Row label="One person" hint="Everything the CRM holds about a contact">
        <div className="flex flex-col gap-3">
          <Select value={contactId} onChange={(e) => { setContactId(e.target.value); setConfirm(false); }} aria-label="Contact">
            {s.contacts.map((c) => <option key={c.id} value={c.id}>{c.name} · {s.companies.find((x) => x.id === c.companyId)?.name ?? "—"}</option>)}
          </Select>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={() => {
                if (!contact) return;
                const data = {
                  contact,
                  deals: s.deals.filter((d) => d.contactId === contact.id),
                  conversations: s.conversations.filter((c) => c.contactId === contact.id),
                  exportedAt: new Date().toISOString(),
                };
                download(`contact-${contact.name.replace(/\s+/g, "-").toLowerCase()}.json`, JSON.stringify(data, null, 2), "application/json");
                toast(`Exported ${contact.name}`);
              }}
            >
              <Download strokeWidth={1.5} /> Export as JSON
            </Button>
            <Button size="sm" variant="ghost" className="text-risk hover:text-risk" onClick={() => setConfirm(true)}>
              <Trash2 strokeWidth={1.5} /> Delete personal data
            </Button>
          </div>
          {confirm && contact && (
            <div className="flex flex-wrap items-center gap-3 rounded-card bg-risk-wash px-4 py-3">
              <p className="t-dense m-0 flex-1">Delete {contact.name}'s personal data? Messages and contact details are erased; deal values stay for reporting, anonymised.</p>
              <Button size="sm" variant="ghost" onClick={() => setConfirm(false)}>Cancel</Button>
              <Button
                size="sm"
                variant="ink"
                className="bg-risk hover:bg-risk/90"
                onClick={async () => {
                  try {
                    await api(`/contacts/${contact.id}`, { method: "DELETE" });
                  } catch (e) {
                    return toast(`Couldn't delete — ${(e as Error).message}`);
                  }
                  useCrm.setState((x) => ({
                    contacts: x.contacts.filter((c) => c.id !== contact.id),
                    conversations: x.conversations.filter((c) => c.contactId !== contact.id),
                  }));
                  setConfirm(false);
                  setContactId(s.contacts.find((c) => c.id !== contact.id)?.id ?? "");
                  toast(`Deleted ${contact.name}'s personal data`);
                }}
              >
                Delete data
              </Button>
            </div>
          )}
        </div>
      </Row>
      <Row label="Retention" hint="Raw webhook events">
        <span className="t-dense text-ink-2">Kept 30 days, then deleted automatically.</span>
      </Row>
    </>
  );
}
