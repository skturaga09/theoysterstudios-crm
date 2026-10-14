/**
 * Client-side store the screens read from. Signed in, it holds the database's team, companies, contacts,
 * deals and invoices (see sync.ts); their mutations update the screen first, then save to the API and roll
 * back if that fails. Tasks, notes, activity and the inbox are still local-only.
 */
import { formatCompact, STAGE_LABEL, type Stage } from "@pinnacle/shared";
import { create } from "zustand";
import {
  ACTIVITIES,
  COMPANIES,
  CONTACTS,
  CONVERSATIONS,
  DEALS,
  INVOICES,
  LEADS,
  CHANNEL_STATUS,
  ME_ID,
  MEMBERS,
  SAMPLE_WORKSPACE,
  TASKS,
  type ChannelStatus,
} from "./seed";
import { api, save } from "../lib/api";
import { useSession } from "../lib/session";
import type { Activity, Company, Contact, Conversation, Deal, Invoice, Lead, Member, Task } from "./types";
import type { Workspace } from "@pinnacle/shared/schemas";

const uid = (p: string) => `${p}-${Math.random().toString(36).slice(2, 8)}`;
const now = () => new Date().toISOString();

export type ConvertInput = {
  service: string;
  valuePaise: number;
  city: string;
  ownerId: string;
};

interface CrmState {
  workspace: Workspace;
  /** Connected lead channels and their health. Sample statuses in the demo; none until integrations exist. */
  channels: ChannelStatus[];
  members: Member[];
  companies: Company[];
  contacts: Contact[];
  deals: Deal[];
  conversations: Conversation[];
  activities: Activity[];
  tasks: Task[];
  invoices: Invoice[];
  leads: Lead[];
  /** Id of the most recent live arrival (drives the flash + Lead Flow burst). */
  lastArrival?: { conversationId: string; channel: Lead["channel"]; at: number };

  /* deals */
  moveDeal: (id: string, stage: Stage, index?: number) => () => void;
  updateDeal: (id: string, patch: Partial<Deal>) => void;
  /* inbox */
  markRead: (id: string) => void;
  assign: (id: string, memberId: string) => void;
  reply: (id: string, body: string) => void;
  convert: (id: string, input: ConvertInput) => Promise<{ deal: Deal; undo: () => void }>;
  receive: (c: Conversation) => void;
  /* tasks */
  toggleTask: (id: string) => void;
  addTask: (t: Omit<Task, "id" | "done">) => void;
  /* notes */
  addNote: (dealId: string, body: string) => void;
  /* team & access */
  /* bulk */
  reassignCompanies: (ids: string[], ownerId: string) => void;
  tagCompanies: (ids: string[], tag: string) => void;
}

const log = (a: Omit<Activity, "id" | "at" | "actorId"> & { actorId?: string }): Activity => ({
  id: uid("a"),
  at: now(),
  actorId: a.actorId ?? ME_ID,
  ...a,
});

const patch = (path: string, body: object) => api(path, { method: "PATCH", body });
const del = (path: string) => api(path, { method: "DELETE" });

/** PATCHes the board fields that differ between two versions of the deal list. */
const saveDealChanges = (from: Deal[], to: Deal[]) =>
  Promise.all(
    to.flatMap((d) => {
      const was = from.find((x) => x.id === d.id);
      if (!was) return [];
      const changed = Object.fromEntries((["stage", "position", "health", "wonAt"] as const).filter((k) => d[k] !== was[k] && d[k] !== undefined).map((k) => [k, d[k]]));
      return Object.keys(changed).length ? [patch(`/deals/${d.id}`, changed)] : [];
    }),
  );

export const useCrm = create<CrmState>((set, get) => ({
  workspace: SAMPLE_WORKSPACE,
  channels: CHANNEL_STATUS,
  members: MEMBERS,
  companies: COMPANIES,
  contacts: CONTACTS,
  deals: DEALS,
  conversations: CONVERSATIONS,
  activities: ACTIVITIES,
  tasks: TASKS,
  invoices: INVOICES,
  leads: LEADS,

  moveDeal: (id, stage, index) => {
    const prev = get().deals;
    const prevActs = get().activities;
    const deal = prev.find((d) => d.id === id);
    if (!deal) return () => {};
    const others = prev.filter((d) => d.id !== id);
    const column = others.filter((d) => d.stage === stage).sort((a, b) => a.position - b.position);
    const at = index === undefined ? column.length : Math.max(0, Math.min(index, column.length));
    const moved: Deal = {
      ...deal,
      stage,
      wonAt: stage === "won" ? deal.wonAt ?? now() : deal.wonAt,
      health: stage === "won" && deal.stage !== "won" ? "ok" : deal.health,
    };
    column.splice(at, 0, moved);
    const reindexed = new Map(column.map((d, i) => [d.id, i]));
    const deals = [...others.map((d) => (reindexed.has(d.id) ? { ...d, position: reindexed.get(d.id)! } : d)), { ...moved, position: reindexed.get(id)! }];
    const changed = deal.stage !== stage;
    set({
      deals,
      activities: changed
        ? [
            log({
              type: stage === "won" ? "won" : "stage",
              dealId: id,
              companyId: deal.companyId,
              text: stage === "won" ? `marked ${deal.title} as Won · ${formatCompact(deal.valuePaise)}` : `moved ${deal.title} to ${STAGE_LABEL[stage]}`,
            }),
            ...prevActs,
          ]
        : prevActs,
    });
    const rollback = () => set({ deals: prev, activities: prevActs });
    save(saveDealChanges(prev, deals), rollback);
    return () => {
      rollback();
      save(saveDealChanges(deals, prev), () => {});
    };
  },

  updateDeal: (id, changes) => {
    const prev = get().deals;
    set({ deals: prev.map((d) => (d.id === id ? { ...d, ...changes } : d)) });
    save(patch(`/deals/${id}`, changes), () => set({ deals: prev }));
  },

  markRead: (id) => set({ conversations: get().conversations.map((c) => (c.id === id ? { ...c, unread: false } : c)) }),
  assign: (id, memberId) =>
    set({ conversations: get().conversations.map((c) => (c.id === id ? { ...c, assigneeId: memberId } : c)) }),
  reply: (id, body) =>
    set({
      conversations: get().conversations.map((c) =>
        c.id === id
          ? { ...c, unread: false, lastMessageAt: now(), messages: [...c.messages, { id: uid("m"), direction: "out", body, at: now(), authorId: ME_ID }] }
          : c,
      ),
    }),

  convert: async (id, input) => {
    const s = get();
    const conv = s.conversations.find((c) => c.id === id)!;
    const snapshot = { companies: s.companies, contacts: s.contacts, deals: s.deals, conversations: s.conversations, activities: s.activities };
    // Records this conversion creates, deleted again on undo or if a later step fails.
    const created: string[] = [];
    const removeCreated = () => Promise.all(created.reverse().map(del));
    try {
      let company = s.companies.find((c) => c.name === conv.company);
      if (!company) {
        company = await api<Company>("/companies", {
          method: "POST",
          body: {
            name: conv.company ?? conv.name,
            domain: conv.handle.includes("@") && !conv.handle.startsWith("@") ? conv.handle.split("@")[1]! : "—",
            industry: "—",
            city: input.city,
            ownerId: input.ownerId,
            tags: ["New"],
          },
        });
        created.push(`/companies/${company.id}`);
      }
      const reach = conv.handle.startsWith("+") ? { phone: conv.handle } : conv.handle.startsWith("@") ? { handle: conv.handle } : { email: conv.handle.toLowerCase() };
      // Emails are unique, so a returning sender reuses their contact.
      let contact = "email" in reach ? s.contacts.find((c) => c.email === reach.email) : undefined;
      if (!contact) {
        contact = await api<Contact>("/contacts", {
          method: "POST",
          body: { name: conv.name, companyId: company.id, title: "—", city: input.city, ownerId: input.ownerId, source: conv.channel, ...reach },
        });
        created.push(`/contacts/${contact.id}`);
      }
      const close = new Date();
      close.setDate(close.getDate() + 30);
      const deal = await api<Deal>("/deals", {
        method: "POST",
        body: {
          title: input.service,
          companyId: company.id,
          contactId: contact.id,
          stage: "new",
          valuePaise: input.valuePaise,
          closeAt: close.toISOString(),
          ownerId: input.ownerId,
          channel: conv.channel,
          health: "ok",
          position: s.deals.filter((d) => d.stage === "new").length,
          nextStep: `Reply to ${conv.name.split(" ")[0]} on ${conv.channel === "gmail" ? "email" : conv.channel === "web" ? "email" : conv.channel}.`,
        },
      });
      created.push(`/deals/${deal.id}`);
      const [co, ct, latest] = [company, contact, get()];
      set({
        companies: latest.companies.some((c) => c.id === co.id) ? latest.companies : [co, ...latest.companies],
        contacts: latest.contacts.some((c) => c.id === ct.id) ? latest.contacts : [ct, ...latest.contacts],
        deals: [...latest.deals, deal],
        conversations: latest.conversations.map((c) =>
          c.id === id ? { ...c, dealId: deal.id, contactId: ct.id, assigneeId: input.ownerId, unread: false } : c,
        ),
        activities: [log({ type: "lead", dealId: deal.id, companyId: co.id, text: `created ${deal.title} from ${conv.name}'s message` }), ...latest.activities],
      });
      return {
        deal,
        undo: () => {
          set(snapshot);
          save(removeCreated(), () => {});
        },
      };
    } catch (e) {
      await removeCreated().catch(() => {});
      throw e;
    }
  },

  receive: (c) => {
    const s = get();
    set({
      conversations: [c, ...s.conversations],
      leads: [{ id: uid("l"), channel: c.channel, stage: "new", at: now() }, ...s.leads],
      lastArrival: { conversationId: c.id, channel: c.channel, at: Date.now() },
    });
  },

  toggleTask: (id) =>
    set({ tasks: get().tasks.map((t) => (t.id === id ? { ...t, done: !t.done, doneAt: !t.done ? now() : undefined } : t)) }),
  addTask: (t) => set({ tasks: [{ ...t, id: uid("t"), done: false }, ...get().tasks] }),

  addNote: (dealId, body) => {
    const deal = get().deals.find((d) => d.id === dealId);
    set({ activities: [log({ type: "note", dealId, companyId: deal?.companyId, text: "added a note", body }), ...get().activities] });
  },


  reassignCompanies: (ids, ownerId) => {
    const prev = get().companies;
    set({ companies: prev.map((c) => (ids.includes(c.id) ? { ...c, ownerId } : c)) });
    save(Promise.all(ids.map((id) => patch(`/companies/${id}`, { ownerId }))), () => set({ companies: prev }));
  },
  tagCompanies: (ids, tag) => {
    const prev = get().companies;
    const next = prev.map((c) => (ids.includes(c.id) && !c.tags.includes(tag) ? { ...c, tags: [...c.tags, tag] } : c));
    set({ companies: next });
    save(Promise.all(next.filter((c, i) => c !== prev[i]).map((c) => patch(`/companies/${c.id}`, { tags: c.tags }))), () => set({ companies: prev }));
  },
}));

/* ---------- lookups (non-reactive helpers for render) ---------- */
export const useWorkspace = () => useCrm((s) => s.workspace);
export const useMember = (id?: string) => useCrm((s) => s.members.find((m) => m.id === id));
export const memberName = (id?: string) => useCrm.getState().members.find((m) => m.id === id)?.name ?? "Unassigned";
/** Me as a team member — or, for the hidden support login (not on the team), the session's "Support" profile. */
export const useMe = () => {
  const member = useCrm((s) => s.members.find((m) => m.id === ME_ID));
  const session = useSession((s) => s.me);
  return (member ?? session)!;
};
/** Default owner for new work: me, unless I'm the support login — then the first teammate. */
export const defaultOwnerId = () => {
  const { members } = useCrm.getState();
  return members.some((m) => m.id === ME_ID) ? ME_ID : (members[0]?.id ?? ME_ID);
};
