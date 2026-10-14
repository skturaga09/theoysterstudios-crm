import { api } from "../lib/api";
import { useCrm } from "./store";
import type { RoutingRule } from "@pinnacle/shared";
import type { ChannelStatus } from "./seed";
import type { Workspace } from "@pinnacle/shared/schemas";
import type { Activity, Company, Contact, Conversation, CreditNote, Deal, Invoice, Member, Task } from "./types";

export type IntegrationStatus = { instagram: { connected: boolean; username?: string; lastEventAt?: string; tokenExpiresAt?: string; connectedAt?: string } };

/** Connected channels in the shape the sidebar and Integrations page show. */
export function channelsFrom(s: IntegrationStatus): ChannelStatus[] {
  const ig = s.instagram;
  if (!ig.connected) return [];
  const minsAgo = (iso?: string) => (iso ? Math.max(0, Math.round((Date.now() - +new Date(iso)) / 60_000)) : 0);
  const expiring = ig.tokenExpiresAt && +new Date(ig.tokenExpiresAt) - Date.now() < 7 * 86_400_000;
  return [
    {
      channel: "instagram",
      label: "Instagram",
      status: expiring ? "warn" : "ok",
      lastEventMin: minsAgo(ig.lastEventAt ?? ig.connectedAt),
      account: `@${ig.username}`,
      note: expiring ? "Instagram's access is about to lapse. Click Reconnect to renew it." : undefined,
    },
  ];
}

/**
 * Replaces every sample with real data: workspace, team, companies, contacts, deals, invoices, tasks,
 * activity, Inbox conversations (from the connected channels) and channel status. Lead history starts empty.
 */
export async function loadCrm() {
  const [workspace, members, companies, contacts, deals, invoices, tasks, activities, routing, creditNotes, conversations, integrations] = await Promise.all([
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
    creditNotes,
    conversations,
    leads: [],
    channels: channelsFrom(integrations),
  }));
}
