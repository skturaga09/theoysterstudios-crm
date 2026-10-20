/**
 * The client portal: a private link per project that a client opens without an account. It shows only what is
 * meant for the client — progress, items awaiting their approval, deliverables, the content calendar, the payment
 * schedule and their invoices — never internal tasks, notes, crew, costs or staff comments.
 */
import { invoiceTotals, istDay, type InvoiceMath } from "@pinnacle/shared";
import type { Db } from "mongodb";
import type { Doc } from "./db";

export type PortalLink = { _id: string; projectId: string; createdAt: string; createdBy: string; lastViewedAt?: string };

const str = (v: unknown) => (typeof v === "string" ? v : undefined);

export async function portalView(db: Db, projectId: string, studio: { studioName: string; enquiryEmail?: string; whatsappNumber?: string }) {
  const project = await db.collection<Doc>("projects").findOne({ _id: projectId });
  if (!project) return null;
  const [company, deal, tasks] = await Promise.all([
    db.collection<Doc>("companies").findOne({ _id: String(project.companyId) }),
    project.dealId ? db.collection<Doc>("deals").findOne({ _id: String(project.dealId) }) : null,
    db.collection<Doc>("tasks").find({ projectId }).sort({ dueAt: 1, _id: 1 }).toArray(), // client items in date order
  ]);
  const invoices = deal ? await db.collection<Doc>("invoices").find({ dealId: deal._id, sent: true, cancelled: { $ne: true } }).sort({ issuedAt: 1 }).toArray() : [];
  const totals = (i: Doc) => invoiceTotals(i as unknown as InvoiceMath);
  const today = istDay(new Date());

  return {
    studio: { name: studio.studioName, email: studio.enquiryEmail || undefined, whatsapp: studio.whatsappNumber || undefined },
    client: { name: str(company?.name) ?? "" },
    project: {
      name: String(project.name),
      business: project.business,
      status: project.status,
      startDate: str(project.startDate),
      dueDate: str(project.dueDate),
      events: ((project.events as { name: string; date?: string; venue?: string }[] | undefined) ?? []).map(({ name, date, venue }) => ({ name, date, venue })),
      calendarUrl: str(project.calendarUrl),
      progress: { done: tasks.filter((t) => t.done).length, total: tasks.length },
    },
    // Only tasks the studio marked as needing the client's sign-off, with the client's own notes.
    approvals: tasks
      .filter((t) => t.approval && t.approval !== "none")
      .map((t) => ({
        id: t._id,
        title: String(t.title),
        dueAt: str(t.dueAt),
        approval: t.approval as string,
        notes: ((t.comments as { authorId: string; body: string; at: string; authorName?: string }[] | undefined) ?? []).filter((c) => c.authorId === "client").map(({ body, at, authorName }) => ({ body, at, by: authorName })),
      })),
    deliverables: ((project.deliverables as { name: string; dueDate?: string; status: string; url?: string }[] | undefined) ?? []).map(({ name, dueDate, status, url }) => ({ name, dueDate, status, url })),
    schedule: ((deal?.schedule as { id: string; label: string; amountPaise: number; dueDate?: string; invoiceId?: string }[] | undefined) ?? []).map((m) => {
      const inv = m.invoiceId ? invoices.find((i) => i._id === m.invoiceId) : undefined;
      const due = inv ? totals(inv).due : undefined;
      const status = inv ? (due! <= 100 ? "paid" : "invoiced") : m.dueDate && m.dueDate < today ? "due" : "upcoming";
      return { label: m.label, amountPaise: m.amountPaise, dueDate: m.dueDate, status };
    }),
    invoices: invoices.map((i) => {
      const link = i.paymentLink as { url: string; status: string } | undefined;
      const t = totals(i);
      return {
        id: i._id,
        number: i.number,
        issuedAt: i.issuedAt,
        dueAt: i.dueAt,
        companyId: i.companyId,
        supply: i.supply,
        lines: i.lines,
        payments: ((i.payments as { at: string; amountPaise: number }[] | undefined) ?? []).map(({ at, amountPaise }) => ({ at, amountPaise })),
        credits: i.credits,
        seller: i.seller,
        buyer: i.buyer,
        sent: true,
        totalPaise: t.total,
        duePaise: t.due,
        payUrl: link?.status === "created" && t.due > 100 ? link.url : undefined,
      };
    }),
  };
}
