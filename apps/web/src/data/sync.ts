import { api } from "../lib/api";
import { useCrm } from "./store";
import type { Workspace } from "@pinnacle/shared/schemas";
import type { Company, Contact, Deal, Invoice, Member } from "./types";

/**
 * Replaces every sample with real data: the database's workspace, team, companies, contacts, deals and
 * invoices; everything not stored yet (tasks, activity, inbox, lead history, channels) starts empty.
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
  useCrm.setState(() => ({
    workspace,
    members,
    companies,
    contacts,
    deals,
    invoices,
    tasks: [],
    activities: [],
    conversations: [],
    leads: [],
    channels: [],
  }));
}
