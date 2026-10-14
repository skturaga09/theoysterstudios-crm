import { api } from "../lib/api";
import { useCrm } from "./store";
import type { RoutingRule } from "@pinnacle/shared";
import type { Workspace } from "@pinnacle/shared/schemas";
import type { Activity, Company, Contact, CreditNote, Deal, Invoice, Member, Task } from "./types";

/**
 * Replaces every sample with real data: the database's workspace, team, companies, contacts, deals,
 * invoices, tasks and activity. Not stored yet (inbox, lead history, channels): starts empty.
 */
export async function loadCrm() {
  const [workspace, members, companies, contacts, deals, invoices, tasks, activities, routing, creditNotes] = await Promise.all([
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
    conversations: [],
    leads: [],
    channels: [],
  }));
}
