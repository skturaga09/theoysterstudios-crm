import { api } from "../lib/api";
import { useCrm } from "./store";
import type { FinanceSettings, Pipelines, RoutingRule, Templates } from "@pinnacle/shared";
import type { ChannelStatus } from "./seed";
import type { Workspace } from "@pinnacle/shared/schemas";
import type { Activity, Company, Contact, Conversation, CreditNote, Deal, Expense, Invoice, Member, Project, Quote, Task } from "./types";

export type GoogleAccountStatus = { email: string; connectedBy: string; connectedAt: string; lastSyncAt?: string; error?: string };
export type IntegrationStatus = {
  instagram: { connected: boolean; username?: string; lastEventAt?: string; tokenExpiresAt?: string; connectedAt?: string };
  razorpay: { ready: boolean; webhook: boolean };
  whatsapp: { connected: boolean; lastEventAt?: string };
  /** `ready` = an admin has saved the Google keys, so people can connect their accounts. */
  google: { ready: boolean; accounts: GoogleAccountStatus[] };
};

/** Connected channels in the shape the sidebar and Integrations page show. */
export function channelsFrom(s: IntegrationStatus): ChannelStatus[] {
  const minsAgo = (iso?: string) => (iso ? Math.max(0, Math.round((Date.now() - +new Date(iso)) / 60_000)) : 0);
  const out: ChannelStatus[] = [];
  const accts = s.google.accounts;
  if (accts.length) {
    const broken = accts.find((a) => a.error);
    const latest = accts.map((a) => a.lastSyncAt ?? a.connectedAt).sort().at(-1);
    const account = accts.length === 1 ? accts[0]!.email : `${accts[0]!.email} +${accts.length - 1}`;
    const base = { status: broken ? ("warn" as const) : ("ok" as const), lastEventMin: minsAgo(latest), account, note: broken ? `${broken.email}: ${broken.error}` : undefined };
    out.push({ channel: "gmail", label: "Gmail", ...base }, { channel: "calendar", label: "Calendar", ...base });
  }
  const ig = s.instagram;
  if (ig.connected) {
    const expiring = ig.tokenExpiresAt && +new Date(ig.tokenExpiresAt) - Date.now() < 7 * 86_400_000;
    out.push({
      channel: "instagram",
      label: "Instagram",
      status: expiring ? "warn" : "ok",
      lastEventMin: minsAgo(ig.lastEventAt ?? ig.connectedAt),
      waiting: !ig.lastEventAt,
      account: `@${ig.username}`,
      note: expiring
        ? "Instagram's access is about to lapse. Click Reconnect to renew it."
        : !ig.lastEventAt
          ? "No DMs have reached the CRM yet. In your Meta app: Configure webhooks → Verify and save with this CRM's callback URL and verify token, turn on the messages field, and switch the app to Live. In Instagram: Message controls → Connected tools → Allow access to messages. Test from a different Instagram account."
          : undefined,
    });
  }
  if (s.whatsapp.connected) {
    out.push({ channel: "whatsapp", label: "WhatsApp", status: "ok", lastEventMin: minsAgo(s.whatsapp.lastEventAt), waiting: !s.whatsapp.lastEventAt, account: "WhatsApp Cloud API" });
  }
  return out;
}

/**
 * Replaces every sample with real data: workspace, team, companies, contacts, deals, invoices, tasks,
 * activity, Inbox conversations (from the connected channels) and channel status. Lead history starts empty.
 */
export async function loadCrm() {
  const [workspace, members, companies, contacts, deals, invoices, tasks, activities, routing, creditNotes, conversations, integrations, pipelines, projects, templates, quotes, expenses, finance] = await Promise.all([
    api<Workspace>("/workspace"),
    api<Member[]>("/members"),
    api<Company[]>("/companies"),
    api<Contact[]>("/contacts"),
    api<Deal[]>("/deals"),
    api<Invoice[]>("/invoices"),
    api<Task[]>("/tasks"),
    api<Activity[]>("/activities"),
    api<{ rules: RoutingRule[] }>("/routing"),
    api<CreditNote[]>("/credit-notes"),
    api<Conversation[]>("/conversations"),
    api<IntegrationStatus>("/integrations"),
    api<Pipelines>("/pipelines"),
    api<Project[]>("/projects"),
    api<Templates>("/project-templates"),
    api<Quote[]>("/quotes"),
    api<Expense[]>("/expenses"),
    api<FinanceSettings>("/finance-settings"),
  ]);
  useCrm.setState(() => ({
    workspace,
    members,
    companies,
    contacts,
    deals,
    invoices,
    tasks,
    activities,
    routing: routing.rules,
    pipelines,
    projects,
    templates,
    quotes,
    expenses,
    finance,
    creditNotes,
    conversations,
    leads: [],
    channels: channelsFrom(integrations),
  }));
}
