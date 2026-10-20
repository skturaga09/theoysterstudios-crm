import { type Channel, CHANNEL_LABEL, CHANNEL_MONOGRAM, fmtAgo, fmtTime, formatCompact, lakh, routeLead, BUSINESSES, BUSINESS_SHORT, type Business } from "@pinnacle/shared";
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
  Pill,
  Segmented,
  Select,
  Textarea,
  toast,
} from "@pinnacle/ui";
import { ArrowLeft, ArrowUpRight, ChevronDown, Inbox as InboxIcon, Send, Sparkles } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { ME_ID } from "../../data/seed";
import { defaultBusiness, defaultOwnerId, useAccess, useCrm, useCanAssign } from "../../data/store";
import type { Conversation } from "../../data/types";
import { IS_DEMO } from "../../lib/demo";
import { api } from "../../lib/api";
import { useCreateAction, useListNav } from "../../lib/hooks";
import { useUi } from "../../lib/ui-store";

const INTENT = { quote: "Quote", meeting: "Meeting", question: "Question", other: "Other" } as const;
const INBOX_CHANNELS: Channel[] = ["gmail", "instagram", "whatsapp", "facebook", "web", "calendar"];

export function InboxRoute() {
  const { id } = useParams();
  const navigate = useNavigate();
  const all = useCrm((s) => s.conversations);
  const [channel, setChannel] = useState<Channel | "all">("all");
  const [scope, setScope] = useState<"open" | "all">("open");

  const list = useMemo(
    () =>
      [...all]
        .filter((c) => (scope === "open" ? !c.dealId : true))
        .filter((c) => channel === "all" || c.channel === channel)
        .sort((a, b) => Number(b.unread) - Number(a.unread) || +new Date(b.lastMessageAt) - +new Date(a.lastMessageAt)),
    [all, channel, scope],
  );
  const counts = useMemo(() => {
    const base = all.filter((c) => (scope === "open" ? !c.dealId : true));
    const m = new Map<string, number>([["all", base.length]]);
    for (const c of base) m.set(c.channel, (m.get(c.channel) ?? 0) + 1);
    return m;
  }, [all, scope]);

  const selected = all.find((c) => c.id === id);
  const open = (cid: string) => navigate(`/inbox/${cid}`);
  const [active] = useListNav(list.length, (i) => open(list[i]!.id));

  // Desktop: open the first conversation when none is selected.
  useEffect(() => {
    if (!id && list[0] && window.matchMedia("(min-width: 1024px)").matches) navigate(`/inbox/${list[0].id}`, { replace: true });
  }, [id, list, navigate]);
  useEffect(() => {
    if (selected?.unread) {
      const t = window.setTimeout(() => useCrm.getState().markRead(selected.id), 1200);
      return () => window.clearTimeout(t);
    }
  }, [selected?.id, selected?.unread]);

  useCreateAction(() => {
    if (selected && !selected.dealId) document.getElementById("create-deal")?.click();
    else useUi.getState().openComposer("deal");
  });

  const unread = all.filter((c) => c.unread).length;

  return (
    <div className="flex flex-col">
      <header className={cn("mb-5 flex flex-wrap items-end gap-4", id && "hidden lg:flex")}>
        <div className="min-w-0 flex-1">
          <p className="t-eyebrow m-0 mb-3 text-ink-3">{unread ? <span className="text-signal">{unread} unread</span> : "All caught up"} · {all.length} conversations</p>
          <h1 className="t-title m-0">Inbox</h1>
        </div>
        <Segmented
          label="Show"
          value={scope}
          onChange={setScope}
          options={[
            { value: "open", label: "Not converted" },
            { value: "all", label: "All" },
          ]}
        />
      </header>

      <div role="tablist" aria-label="Channel" className={cn("-mx-4 mb-4 flex gap-1.5 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0", id && "hidden lg:flex")}>
        {(["all", ...INBOX_CHANNELS] as const).map((c) => {
          const n = counts.get(c) ?? 0;
          const on = channel === c;
          return (
            <button
              key={c}
              role="tab"
              aria-selected={on}
              onClick={() => setChannel(c)}
              className={cn(
                "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-chip px-3 text-[12.5px] transition-colors duration-150",
                on ? "bg-ink text-on-ink" : "bg-sunken text-ink-2 hover:text-ink",
              )}
            >
              {c === "all" ? "All" : <span className="font-mono text-[11px] tracking-[0.04em]">{CHANNEL_MONOGRAM[c]}</span>}
              <span className={cn("font-mono text-[11px] tnum", on ? "text-on-ink/70" : "text-ink-3")}>{n}</span>
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 border-t border-line lg:grid-cols-[minmax(300px,380px)_minmax(0,1fr)] lg:gap-0">
        <ul className={cn("m-0 list-none p-0 lg:border-r lg:border-line", id && "hidden lg:block")} aria-label="Conversations">
          <AnimatePresence initial={false}>
            {list.map((c, i) => (
              <ConvRow key={c.id} c={c} index={i} selected={c.id === id} active={active === i} onOpen={() => open(c.id)} />
            ))}
          </AnimatePresence>
          {!list.length && (
            <li className="flex flex-col items-start gap-2 px-1 py-10">
              <InboxIcon size={20} strokeWidth={1.5} className="text-ink-3" />
              <p className="t-sheet m-0">Nothing here</p>
              <p className="t-dense m-0 max-w-[40ch] text-ink-2">
                New leads from Gmail, Instagram, Lead Ads, WhatsApp, Calendar and your website form land here. Connect channels in Settings → Integrations.
              </p>
            </li>
          )}
        </ul>
        <div className={cn("min-w-0", !id && "hidden lg:block")}>
          {selected ? <Thread key={selected.id} c={selected} /> : <p className="t-dense p-8 text-ink-3">Select a conversation.</p>}
        </div>
      </div>
    </div>
  );
}

function ConvRow({ c, index, selected, active, onOpen }: { c: Conversation; index: number; selected: boolean; active: boolean; onOpen: () => void }) {
  const last = c.messages[c.messages.length - 1];
  const assignee = useCrm((s) => s.members.find((m) => m.id === c.assigneeId));
  const fresh = useCrm((s) => s.lastArrival?.conversationId === c.id);
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: -14 }}
      animate={{ opacity: 1, y: 0, height: "auto" }}
      exit={{ opacity: 0, height: 0, transition: { duration: 0.4, ease: [0.2, 0.8, 0.2, 1] } }}
      transition={{ type: "spring", stiffness: 260, damping: 30 }}
      className={cn("overflow-hidden border-b border-line", fresh && "flash-new")}
    >
      <button
        data-nav-index={index}
        onClick={onOpen}
        aria-current={selected ? "true" : undefined}
        className={cn(
          "flex w-full items-start gap-3 px-3 py-3 text-left transition-colors duration-150",
          selected ? "bg-surface" : active ? "bg-hover" : "hover:bg-hover",
        )}
      >
        <span className="mt-1.5 w-1.5 shrink-0">{c.unread && <span aria-label="Unread" className="block size-1.5 rounded-full bg-signal" />}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <ChannelChip channel={c.channel} />
            <span className={cn("t-dense truncate", c.unread ? "font-semibold" : "font-medium")}>{c.name}</span>
            <span className="ml-auto shrink-0 font-mono text-[11px] text-ink-3">{fmtAgo(c.lastMessageAt)}</span>
          </div>
          <p className={cn("m-0 mt-1 line-clamp-2 text-[12.5px]", c.unread ? "text-ink-2" : "text-ink-3")}>{c.subject ? `${c.subject} — ` : ""}{last?.body}</p>
          <div className="mt-2 flex items-center gap-2">
            {c.dealId ? (
              <Pill tone="ok">Deal</Pill>
            ) : (
              c.extracted && <Pill tone={c.extracted.intent === "quote" ? "new" : "mute"}>{INTENT[c.extracted.intent]}</Pill>
            )}
            {c.extracted && !c.dealId && <span className="font-mono text-[11px] text-ink-3">est. {formatCompact(c.extracted.estValuePaise)}</span>}
            {assignee && <Avatar name={assignee.name} me={assignee.id === ME_ID} size="sm" className="ml-auto" />}
          </div>
        </div>
      </button>
    </motion.li>
  );
}

/* ---------------------------------------------------------------- */

function Thread({ c }: { c: Conversation }) {
  const isManager = useCanAssign();
  // Project managers and Finance can read the Inbox but not act on it.
  const readOnly = useAccess("sales") === "view";
  const navigate = useNavigate();
  const s = useCrm();
  const assignee = s.members.find((m) => m.id === c.assigneeId);
  const [draft, setDraft] = useState({
    service: c.extracted?.service ?? "",
    value: c.extracted ? (c.extracted.estValuePaise / 1e7).toFixed(1) : "",
    city: c.extracted?.city ?? c.city,
    business: c.business ?? defaultBusiness(),
    // A Member converts leads to themselves. Otherwise lead routing decides first; then the suggested owner; then the default.
    ownerId: !isManager ? ME_ID :
      routeLead(s.routing, { channel: c.channel, city: c.extracted?.city ?? c.city, valuePaise: c.extracted?.estValuePaise }, (id) => s.members.some((m) => m.id === id)) ??
      (s.members.some((m) => m.id === c.extracted?.suggestedOwnerId) ? c.extracted!.suggestedOwnerId : defaultOwnerId()),
  });
  const [converting, setConverting] = useState(false);

  const convert = async () => {
    const v = parseFloat(draft.value);
    if (!draft.service.trim() || Number.isNaN(v)) {
      toast("Add a service and an estimated value first");
      return;
    }
    setConverting(true);
    try {
      const { deal, undo } = await s.convert(c.id, { service: draft.service.trim(), valuePaise: lakh(v), city: draft.city, ownerId: draft.ownerId, business: draft.business });
      toast(`Deal created in New · ${formatCompact(deal.valuePaise)}`, { action: { label: "Undo", onClick: undo } });
    } catch (e) {
      toast(`Couldn't create the deal — ${(e as Error).message}`);
    } finally {
      setConverting(false);
    }
  };

  return (
    <article className="flex min-h-[60vh] flex-col lg:pl-8" aria-label={`Conversation with ${c.name}`}>
      {/* header */}
      <header className="flex flex-wrap items-start gap-3 border-b border-line py-4">
        <button onClick={() => navigate("/inbox")} className="mr-1 grid size-8 place-items-center rounded-control text-ink-2 hover:bg-hover lg:hidden" aria-label="Back to inbox">
          <ArrowLeft size={16} strokeWidth={1.5} />
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="t-sheet m-0">{c.name}</h2>
          <p className="t-meta m-0 mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-ink-3">
            <ChannelChip channel={c.channel} />
            <span className="font-mono text-[11.5px]">{c.handle}</span>
            <span>·</span>
            <span>{c.company ? `${c.company}, ` : ""}{c.city}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Menu>
            <MenuTrigger asChild>
              <Button size="sm" disabled={readOnly}>
                {assignee ? <><Avatar name={assignee.name} me={assignee.id === ME_ID} size="sm" /> {assignee.name.split(" ")[0]}</> : "Assign"}
                <ChevronDown strokeWidth={1.5} className="text-ink-3" />
              </Button>
            </MenuTrigger>
            <MenuContent align="end">
              {s.members.map((m) => (
                <MenuItem key={m.id} checked={c.assigneeId === m.id} onSelect={() => { s.assign(c.id, m.id); toast(`Assigned to ${m.name}`); }}>
                  {m.name}
                </MenuItem>
              ))}
            </MenuContent>
          </Menu>
          {c.dealId ? (
            <Button size="sm" onClick={() => useUi.getState().openDeal(c.dealId!)}>
              Open deal <ArrowUpRight strokeWidth={1.5} />
            </Button>
          ) : readOnly ? null : (
            <Button id="create-deal" size="sm" variant="signal" disabled={converting} onClick={() => void convert()}>
              Create deal
            </Button>
          )}
        </div>
      </header>

      {/* extracted details */}
      {!c.dealId && !readOnly && (
        <section aria-label="Deal details" className="mt-4 rounded-card border border-dashed border-line-2 p-3">
          <div className="mb-2.5 flex items-center gap-2">
            {c.extracted ? (
              <>
                <Sparkles size={13} strokeWidth={1.5} className="text-ink-3" />
                <span className="t-eyebrow text-ink-3">Suggested from this message</span>
                <span className="ml-auto font-mono text-[11px] text-ink-3">{Math.round(c.extracted.confidence * 100)}% confident · edit before creating</span>
              </>
            ) : (
              <span className="t-eyebrow text-ink-3">Fill in to create a deal from this conversation</span>
            )}
          </div>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-[11.5px] text-ink-3">Business</span>
              <Select value={draft.business} onChange={(e) => setDraft({ ...draft, business: e.target.value as Business })} className="[&_select]:h-8">
                {BUSINESSES.map((b) => <option key={b} value={b}>{BUSINESS_SHORT[b]}</option>)}
              </Select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11.5px] text-ink-3">Service</span>
              <Input value={draft.service} onChange={(e) => setDraft({ ...draft, service: e.target.value })} className="h-8" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11.5px] text-ink-3">Est. value (₹ L)</span>
              <Input inputMode="decimal" value={draft.value} onChange={(e) => setDraft({ ...draft, value: e.target.value })} className="h-8 font-mono" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11.5px] text-ink-3">City</span>
              <Input value={draft.city} onChange={(e) => setDraft({ ...draft, city: e.target.value })} className="h-8" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11.5px] text-ink-3">Owner</span>
              <Select value={draft.ownerId} disabled={!isManager} onChange={(e) => setDraft({ ...draft, ownerId: e.target.value })} className="[&_select]:h-8">
                {s.members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </Select>
            </label>
          </div>
        </section>
      )}

      {/* messages */}
      <ol className="m-0 flex flex-1 list-none flex-col gap-4 px-0 py-6">
        {c.messages.map((m) => {
          const author = s.members.find((x) => x.id === m.authorId);
          return (
            <motion.li
              key={m.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className={cn("flex max-w-[78%] flex-col gap-1", m.direction === "out" ? "self-end items-end" : "items-start")}
            >
              <div
                className={cn(
                  "rounded-panel px-3.5 py-2.5 t-body whitespace-pre-line",
                  m.direction === "out" ? "bg-surface shadow-rest" : "bg-sunken",
                )}
              >
                {m.body}
              </div>
              <span className="font-mono text-[10.5px] text-ink-3">
                {m.direction === "out" ? `${author?.name ?? "You"} · ` : ""}{fmtTime(m.at)} IST · {fmtAgo(m.at)}
              </span>
            </motion.li>
          );
        })}
      </ol>

      {!readOnly && <Composer c={c} />}
    </article>
  );
}

const TEMPLATES = [
  { id: "follow_up", label: "Follow-up (approved)", body: "Hi {{1}}, following up on your enquiry with The Oyster Studios. Is now a good time for a quick call?" },
  { id: "proposal_ready", label: "Proposal ready (approved)", body: "Hi {{1}}, your proposal from The Oyster Studios is ready. Shall I send it here or by email?" },
];

function Composer({ c }: { c: Conversation }) {
  const reply = useCrm((s) => s.reply);
  const [text, setText] = useState("");
  const [tpl, setTpl] = useState(TEMPLATES[0]!.id);
  const [busy, setBusy] = useState(false);
  const now = Date.now();
  const wa = c.channel === "whatsapp";
  const windowOpen = !wa || (!!c.windowExpiresAt && +new Date(c.windowExpiresAt) > now);
  const hoursLeft = c.windowExpiresAt ? Math.round((+new Date(c.windowExpiresAt) - now) / 3600_000) : 0;
  const via = c.channel === "calendar" || c.channel === "web" ? "Gmail" : CHANNEL_LABEL[c.channel];

  if (c.channel === "facebook")
    return (
      <div className="rounded-card bg-sunken p-4 t-dense text-ink-2">
        Lead Ads leads can't be replied to in Messenger. Call or WhatsApp <span className="font-mono text-ink">{c.handle}</span>, then log it on the deal.
      </div>
    );

  // Gmail and Calendar stay read-only. WhatsApp and Instagram use the server reply endpoint below.
  if (!IS_DEMO && c.channel !== "whatsapp" && c.channel !== "instagram")
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-card bg-sunken p-4 t-dense text-ink-2">
        <span className="min-w-0 flex-1">
          {c.channel === "calendar" ? "Booked through your calendar. Reply by email; your replies appear here." : `Replies are sent from ${CHANNEL_LABEL[c.channel]} itself; they appear here when they're sent.`}
        </span>
        {c.channel === "gmail" && c.gmailThread && (
          <Button asChild size="sm" variant="ink">
            <a href={`https://mail.google.com/mail/?authuser=${encodeURIComponent(c.gmailThread.account)}#all/${c.gmailThread.threadId}`} target="_blank" rel="noreferrer">Reply in Gmail</a>
          </Button>
        )}
        {c.channel === "calendar" && c.handle.includes("@") && (
          <Button asChild size="sm" variant="ink">
            <a href={`mailto:${c.handle}`}>Email them</a>
          </Button>
        )}
      </div>
    );
  const send = async (body: string) => {
    setBusy(true);
    try {
      if (IS_DEMO) reply(c.id, body);
      else {
        const saved = await api<Conversation>(`/conversations/${c.id}/reply`, { method: "POST", body: { body } });
        useCrm.setState((s) => ({ conversations: s.conversations.map((x) => (x.id === saved.id ? saved : x)) }));
      }
      setText("");
      toast(`Sent on ${via}`);
    } catch (e) {
      toast(`Couldn't send — ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="sticky bottom-0 border-t border-line bg-bg pt-3 pb-1">
      {wa && (
        <p className={cn("m-0 mb-2 flex items-center gap-2 font-mono text-[11px]", windowOpen ? "text-ok" : "text-warn")}>
          <span className={cn("size-1.5 rounded-full", windowOpen ? "bg-ok" : "bg-warn")} />
          {windowOpen
            ? `24-hour window open · ${hoursLeft}h left for free-form replies`
            : `Window closed ${Math.abs(hoursLeft)}h ago · only approved templates can be sent`}
        </p>
      )}
      {windowOpen ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (text.trim()) void send(text.trim());
          }}
          className="flex flex-col gap-2"
        >
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && text.trim()) void send(text.trim());
            }}
            placeholder={`Reply to ${c.name.split(" ")[0]} on ${via}…`}
            aria-label="Reply"
            className="min-h-[72px]"
          />
          <div className="flex items-center gap-2">
            <span className="font-mono text-[11px] text-ink-3">⌘ Enter to send</span>
            <Button type="submit" variant="ink" size="sm" className="ml-auto" disabled={!text.trim() || busy}>
              <Send strokeWidth={1.5} /> {busy ? "Sending…" : `Send on ${via}`}
            </Button>
          </div>
        </form>
      ) : IS_DEMO ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Select value={tpl} onChange={(e) => setTpl(e.target.value)} aria-label="Template" className="sm:max-w-[280px]">
            {TEMPLATES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </Select>
          <p className="t-meta m-0 flex-1 text-ink-3">{TEMPLATES.find((t) => t.id === tpl)!.body.replace("{{1}}", c.name.split(" ")[0]!)}</p>
          <Button variant="ink" size="sm" onClick={() => void send(TEMPLATES.find((t) => t.id === tpl)!.body.replace("{{1}}", c.name.split(" ")[0]!))}>
            <Send strokeWidth={1.5} /> Send template
          </Button>
        </div>
      ) : (
        <div className="rounded-card bg-warn-wash p-4 t-dense text-warn">
          The 24-hour reply window has closed. WhatsApp only accepts an approved template now; payment reminders can still be sent from the invoice or payment schedule.
        </div>
      )}
    </div>
  );
}
