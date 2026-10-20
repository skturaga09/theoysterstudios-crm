/**
 * Client-side store the screens read from. Signed in, it holds the database's team, companies, contacts,
 * deals, invoices, tasks and activity (see sync.ts); mutations update the screen first, then save to the API
 * and roll back if that fails. The inbox is still local-only until the channels are connected.
 */
import { DEFAULT_TEMPLATES, projectFromDeal, type Templates, formatCompact, type Business, type BusinessView, type RoutingRule, type Stage, DEFAULT_PIPELINES, stageIn, type Pipelines } from "@pinnacle/shared";
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
  SAMPLE_ROUTING,
  SAMPLE_WORKSPACE,
  PROJECTS,
  TASKS,
  type ChannelStatus,
} from "./seed";
import { toast } from "@pinnacle/ui";
import { api, save } from "../lib/api";
import { IS_DEMO } from "../lib/demo";
import { useSession } from "../lib/session";
import type { Activity, Company, Contact, Conversation, CreditNote, Deal, Invoice, Lead, Member, Project, Task } from "./types";
import type { Workspace } from "@pinnacle/shared/schemas";

const uid = (p: string) => `${p}-${Math.random().toString(36).slice(2, 8)}`;
const now = () => new Date().toISOString();

export type ConvertInput = {
  service: string;
  valuePaise: number;
  city: string;
  ownerId: string;
  business: Business;
};

interface CrmState {
  /** Which business the screens show: one of them, or both. Remembered on this device. */
  businessView: BusinessView;
  setBusinessView: (v: BusinessView) => void;
  workspace: Workspace;
  /** Each business's stages (Settings → Pipelines & stages). */
  pipelines: Pipelines;
  /** Connected lead channels and their health. Sample statuses in the demo; none until integrations exist. */
  channels: ChannelStatus[];
  /** Lead routing rules, in priority order. */
  routing: RoutingRule[];
  setRouting: (rules: RoutingRule[]) => void;
  members: Member[];
  companies: Company[];
  contacts: Contact[];
  deals: Deal[];
  conversations: Conversation[];
  activities: Activity[];
  tasks: Task[];
  projects: Project[];
  /** The checklists new projects start with (Settings → Project templates). */
  templates: Templates;
  invoices: Invoice[];
  creditNotes: CreditNote[];
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
  updateTask: (id: string, patch: Partial<Task>) => void;
  commentOnTask: (id: string, body: string) => void;
  /* projects */
  updateProject: (id: string, patch: Partial<Project>) => void;
  /* activity: notes, calls… */
  addNote: (dealId: string, body: string) => void;
  addActivity: (entry: ActivityEntry) => void;
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

type ActivityEntry = Omit<Activity, "id" | "at" | "actorId">;

/**
 * Builds an activity for the screen and saves it. When the save lands, the saved copy (with its real id)
 * replaces the temporary one; `remove` deletes it again (for Undo).
 */
const record = (entry: ActivityEntry) => {
  const activity = log(entry);
  const saved = api<Activity>("/activities", { method: "POST", body: entry }).then(
    (a) => {
      useCrm.setState((s) => ({ activities: s.activities.map((x) => (x.id === activity.id ? a : x)) }));
      return a;
    },
    (e: Error) => {
      useCrm.setState((s) => ({ activities: s.activities.filter((x) => x.id !== activity.id) }));
      toast(`Couldn't save to the timeline — ${e.message}`);
      return undefined;
    },
  );
  const remove = () => void saved.then((a) => a && api(`/activities/${a.id}`, { method: "DELETE" }).catch(() => {}));
  return { activity, remove };
};

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

/** Fetches the project (and its checklist) the API started for a confirmed deal. */
async function pullProject(dealId: string) {
  const [project] = await api<Project[]>(`/projects?dealId=${dealId}`);
  if (!project) return;
  const tasks = await api<Task[]>(`/tasks?projectId=${project.id}`);
  useCrm.setState((s) => ({
    projects: [project, ...s.projects.filter((p) => p.id !== project.id)],
    tasks: [...tasks, ...s.tasks.filter((t) => t.projectId !== project.id)],
  }));
  toast(`Project started · ${tasks.length} tasks from the ${project.business === "marketing" ? "marketing" : "wedding"} checklist`);
}

const VIEW_KEY = "oyster.businessView";
const savedView = (): BusinessView => {
  try {
    const v = localStorage.getItem(VIEW_KEY);
    return v === "photography" || v === "marketing" ? v : "all";
  } catch {
    return "all";
  }
};

const raw = create<CrmState>((set, get) => ({
  businessView: savedView(),
  setBusinessView: (v) => {
    set({ businessView: v });
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* private window: the choice just isn't remembered */
    }
  },
  workspace: SAMPLE_WORKSPACE,
  pipelines: DEFAULT_PIPELINES,
  channels: CHANNEL_STATUS,
  routing: SAMPLE_ROUTING,
  setRouting: (rules) => {
    const prev = get().routing;
    set({ routing: rules });
    save(api("/routing", { method: "PUT", body: { rules } }), () => set({ routing: prev }));
  },
  members: MEMBERS,
  companies: COMPANIES,
  contacts: CONTACTS,
  deals: DEALS,
  conversations: CONVERSATIONS,
  activities: ACTIVITIES,
  tasks: TASKS,
  projects: PROJECTS,
  templates: DEFAULT_TEMPLATES,
  invoices: INVOICES,
  creditNotes: [],
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
    const entry =
      deal.stage !== stage
        ? record({
            type: stage === "won" ? "won" : "stage",
            dealId: id,
            companyId: deal.companyId,
            text: stage === "won" ? `confirmed ${deal.title} · ${formatCompact(deal.valuePaise)}` : `moved ${deal.title} to ${stageIn(get().pipelines, deal.business, stage).label}`,
          })
        : undefined;
    // Confirmed: the company (or couple) becomes a client — the API records it too.
    const becameClient = stage === "won" && get().companies.find((c) => c.id === deal.companyId && !c.clientSince);
    set({
      deals,
      activities: entry ? [entry.activity, ...prevActs] : prevActs,
      ...(becameClient && { companies: get().companies.map((c) => (c.id === deal.companyId ? { ...c, clientSince: now() } : c)) }),
    });
    if (becameClient) toast(`${becameClient.name} is now a client`);
    const rollback = () => {
      set({ deals: prev, activities: get().activities.filter((a) => a.id !== entry?.activity.id) });
      entry?.remove();
    };
    const request = saveDealChanges(prev, deals);
    save(request, rollback);
    // Confirmed: the API starts the project and its checklist; show them (the demo builds them here).
    if (stage === "won" && !get().projects.some((p) => p.dealId === id)) {
      if (IS_DEMO) {
        const { project, tasks } = projectFromDeal(moved, get().templates);
        const projectId = uid("p");
        set({ projects: [{ ...project, id: projectId }, ...get().projects], tasks: [...tasks.map((t) => ({ ...t, id: uid("t"), projectId })), ...get().tasks] });
        toast(`Project started · ${tasks.length} tasks from the checklist`);
      } else void request.then(() => pullProject(id), () => {});
    }
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

  markRead: (id) => {
    const prev = get().conversations;
    if (!prev.find((c) => c.id === id)?.unread) return;
    set({ conversations: prev.map((c) => (c.id === id ? { ...c, unread: false } : c)) });
    save(patch(`/conversations/${id}`, { unread: false }), () => set({ conversations: prev }));
  },
  assign: (id, memberId) => {
    const prev = get().conversations;
    set({ conversations: prev.map((c) => (c.id === id ? { ...c, assigneeId: memberId } : c)) });
    save(patch(`/conversations/${id}`, { assigneeId: memberId }), () => set({ conversations: prev }));
  },
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
            business: input.business,
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
          body: { name: conv.name, companyId: company.id, title: "—", city: input.city, ownerId: input.ownerId, source: conv.channel, business: input.business, ...reach },
        });
        created.push(`/contacts/${contact.id}`);
      }
      const close = new Date();
      close.setDate(close.getDate() + 30);
      const deal = await api<Deal>("/deals", {
        method: "POST",
        body: {
          title: input.service,
          business: input.business,
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
      const entry = record({ type: "lead", dealId: deal.id, companyId: co.id, text: `created ${deal.title} from ${conv.name}'s message` });
      set({
        companies: latest.companies.some((c) => c.id === co.id) ? latest.companies : [co, ...latest.companies],
        contacts: latest.contacts.some((c) => c.id === ct.id) ? latest.contacts : [ct, ...latest.contacts],
        deals: [...latest.deals, deal],
        conversations: latest.conversations.map((c) =>
          c.id === id ? { ...c, dealId: deal.id, contactId: ct.id, assigneeId: input.ownerId, unread: false, business: input.business } : c,
        ),
        activities: [entry.activity, ...latest.activities],
      });
      // Link the conversation to what was created (saved; the sample inbox in the demo just keeps it on screen).
      save(patch(`/conversations/${id}`, { dealId: deal.id, contactId: ct.id, assigneeId: input.ownerId, unread: false, business: input.business }), () => {});
      return {
        deal,
        undo: () => {
          set(snapshot);
          entry.remove();
          save(Promise.all([removeCreated(), patch(`/conversations/${id}`, { dealId: null, contactId: null, assigneeId: conv.assigneeId ?? null })]), () => {});
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

  toggleTask: (id) => {
    const t = get().tasks.find((x) => x.id === id);
    if (t) get().updateTask(id, { done: !t.done, doneAt: !t.done ? now() : undefined, ...(t.status && { status: t.done ? "todo" : "done" }) });
  },
  addTask: (t) => {
    const temp: Task = { ...t, id: uid("t"), done: false };
    set({ tasks: [temp, ...get().tasks] });
    api<Task>("/tasks", { method: "POST", body: t }).then(
      (saved) => set({ tasks: get().tasks.map((x) => (x.id === temp.id ? saved : x)) }),
      (e: Error) => {
        set({ tasks: get().tasks.filter((x) => x.id !== temp.id) });
        toast(`Couldn't save the task — ${e.message}`);
      },
    );
  },
  commentOnTask: (id, body) => {
    const comment = { id: uid("c"), authorId: ME_ID, body, at: now() };
    const prev = get().tasks;
    set({ tasks: prev.map((t) => (t.id === id ? { ...t, comments: [...(t.comments ?? []), comment] } : t)) });
    save(api(`/tasks/${id}/comments`, { method: "POST", body: { body } }), () => set({ tasks: prev }));
  },
  updateProject: (id, changes) => {
    const prev = get().projects;
    set({ projects: prev.map((p) => (p.id === id ? { ...p, ...changes } : p)) });
    // `undefined` means "clear it", which JSON can only say as null.
    const body = Object.fromEntries(Object.entries(changes).map(([k, v]) => [k, v ?? null]));
    save(patch(`/projects/${id}`, body), () => set({ projects: prev }));
  },
  updateTask: (id, changes) => {
    const prev = get().tasks;
    set({ tasks: prev.map((t) => (t.id === id ? { ...t, ...changes } : t)) });
    // `doneAt: undefined` means "clear it", which JSON can only say as null.
    const body = "doneAt" in changes ? { ...changes, doneAt: changes.doneAt ?? null } : changes;
    save(patch(`/tasks/${id}`, body), () => set({ tasks: prev }));
  },

  addNote: (dealId, body) => {
    const deal = get().deals.find((d) => d.id === dealId);
    get().addActivity({ type: "note", dealId, companyId: deal?.companyId, text: "added a note", body });
  },
  addActivity: (entry) => set({ activities: [record(entry).activity, ...get().activities] }),


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

/**
 * What the screens see: the store narrowed to the chosen business. A record with no business yet (e.g. a new
 * Instagram DM) shows in every view so nothing is missed. Memoised per state, so selectors stay stable.
 * Writes (getState / setState) always work on the whole store.
 */
let memo: { st?: CrmState; out?: CrmState } = {};
function scoped(st: CrmState): CrmState {
  if (memo.st === st) return memo.out!;
  const v = st.businessView;
  let out = st;
  if (v !== "all") {
    const fits = (b?: Business) => !b || b === v;
    const deals = st.deals.filter((d) => fits(d.business));
    const dealIds = new Set(deals.map((d) => d.id));
    const dealOf = (id?: string) => (id ? st.deals.find((d) => d.id === id) : undefined);
    const companies = st.companies.filter((c) => fits(c.business));
    const companyIds = new Set(companies.map((c) => c.id));
    const invoices = st.invoices.filter((i) => fits(i.business ?? dealOf(i.dealId)?.business));
    const invoiceIds = new Set(invoices.map((i) => i.id));
    out = {
      ...st,
      deals,
      companies,
      contacts: st.contacts.filter((c) => fits(c.business)),
      invoices,
      creditNotes: st.creditNotes.filter((c) => invoiceIds.has(c.invoiceId)),
      tasks: st.tasks.filter((t) => fits(t.business ?? dealOf(t.dealId)?.business)),
      projects: st.projects.filter((p) => fits(p.business)),
      conversations: st.conversations.filter((c) => fits(c.business)),
      activities: st.activities.filter((a) => (a.dealId ? dealIds.has(a.dealId) : a.companyId ? companyIds.has(a.companyId) : true)),
    };
  }
  memo = { st, out };
  return out;
}

type CrmHook = {
  (): CrmState;
  <T>(selector: (s: CrmState) => T): T;
} & Pick<typeof raw, "getState" | "setState" | "subscribe" | "getInitialState">;
export const useCrm: CrmHook = Object.assign(
  <T,>(selector?: (s: CrmState) => T) => raw((st) => (selector ? selector(scoped(st)) : scoped(st)) as T),
  { getState: raw.getState, setState: raw.setState, subscribe: raw.subscribe, getInitialState: raw.getInitialState },
) as CrmHook;
/** The business new records should get: the one being viewed, else photography. */
export const defaultBusiness = (): Business => {
  const v = raw.getState().businessView;
  return v === "all" ? "photography" : v;
};

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
/** Admins and Managers can change anything and reassign work; Members only what they own (enforced by the API too). */
export const useIsManager = () => useMe().role !== "member";
export const useCanEdit = (ownerId?: string) => {
  const me = useMe();
  return me.role !== "member" || ownerId === me.id;
};
/** Same check outside React (e.g. a drag on the board). */
export const canEditNow = (ownerId?: string) => {
  const me = useCrm.getState().members.find((m) => m.id === ME_ID) ?? useSession.getState().me;
  return !!me && (me.role !== "member" || ownerId === me.id);
};
/** Default owner for new work: me, unless I'm the support login — then the first teammate. */
export const defaultOwnerId = () => {
  const { members } = useCrm.getState();
  return members.some((m) => m.id === ME_ID) ? ME_ID : (members[0]?.id ?? ME_ID);
};
