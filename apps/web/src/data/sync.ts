import { api } from "../lib/api";
import { useCrm } from "./store";
import type { Workspace } from "@pinnacle/shared/schemas";
import type { Company, Contact, Deal, Invoice, Member } from "./types";

/**
 * Replaces the sample team, companies, contacts, deals and invoices with the database's.
 * Tasks and activity history aren't stored yet; their samples point at sample deals, so they start empty.
 * The inbox and Lead Flow stay as samples until the channels are connected.
 */
export async function loadCrm() {
  const [workspace, members, companies, contacts, deals, invoices] = await Promise.all([
    api<Workspace>("/workspace"),
    api<Member[]>("/members"),
    api<Company[]>("/companies"),
    api<Contact[]>("/contacts"),
    api<Deal[]>("/deals"),
    api<Invoice[]>("/invoices"),
  ]);
  useCrm.setState((s) => ({
    workspace,
    members,
    companies,
    contacts,
    deals,
    invoices,
    tasks: [],
    activities: [],
    conversations: s.conversations.map((c) => ({ ...c, contactId: undefined, dealId: undefined, assigneeId: undefined })),
  }));
}
