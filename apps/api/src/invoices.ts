import { formatFull, invoiceTotals } from "@pinnacle/shared";
import { ObjectId, type ClientSession, type Db, type MongoClient } from "mongodb";
import type { z } from "zod";
import type { CreateInvoiceSchema } from "@pinnacle/shared/schemas";
import type { Doc } from "./db";

export const INVOICE_PREFIX = "TOS";
export const CREDIT_NOTE_PREFIX = "TOS/CN";

/** Indian financial year (April–March, in IST) as "26-27". */
export function financialYear(at: Date): string {
  const [y, m] = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "numeric" })
    .formatToParts(at)
    .filter((p) => p.type !== "literal")
    .map((p) => Number(p.value)) as [number, number];
  const start = m >= 4 ? y : y - 1;
  return `${String(start % 100).padStart(2, "0")}-${String((start + 1) % 100).padStart(2, "0")}`;
}

/**
 * Creates an invoice with the next serial number for its financial year.
 * The counter bump and the insert share one transaction, so a failed insert never burns a number —
 * GST rules expect consecutive serials.
 */
export type Seller = { legalName: string; gstin: string; address: string };
export type Buyer = { name: string; gstin: string; address: string; city: string };

/** Next serial for a series in a financial year, inside the caller's transaction (quotations need none). */
export async function nextNumber(db: Db, series: string, prefix: string, fy: string, session?: ClientSession) {
  const counter = await db.collection<{ _id: string; seq: number }>("counters").findOneAndUpdate({ _id: `${series}:${fy}` }, { $inc: { seq: 1 } }, { upsert: true, returnDocument: "after", session });
  return `${prefix}/${fy}/${String(counter!.seq).padStart(3, "0")}`;
}

/**
 * Raises a credit note against a sent invoice, in its own number series, and records it on the invoice so its
 * balance drops. One transaction: the number, the note and the invoice update land together or not at all.
 * Returns an error message instead when the invoice can't take this credit.
 */
export async function createCreditNote(db: Db, client: MongoClient, invoiceId: string, input: { amountPaise: number; reason: string }, actorId: string) {
  const session = client.startSession();
  try {
    return await session.withTransaction(async () => {
      const invoices = db.collection<Doc>("invoices");
      const inv = await invoices.findOne({ _id: invoiceId }, { session });
      if (!inv) return { error: "Not found" as const };
      if (!inv.sent || inv.cancelled) return { error: "Only a sent invoice can have a credit note" };
      const lines = inv.lines as { sac: string; qty: number; ratePaise: number }[];
      const credits = (inv.credits as { taxablePaise: number }[] | undefined) ?? [];
      const creditable = invoiceTotals({ supply: inv.supply as "intra" | "inter", lines, payments: [] }).subtotal - credits.reduce((a, c) => a + c.taxablePaise, 0);
      if (input.amountPaise > creditable) return { error: `That's more than is left to credit on this invoice (${formatFull(creditable)} before GST)` };
      const issuedAt = new Date().toISOString();
      const number = await nextNumber(db, "creditnote", CREDIT_NOTE_PREFIX, financialYear(new Date(issuedAt)), session);
      const noteLines = [{ desc: `Credit against invoice ${inv.number}: ${input.reason}`, sac: lines[0]?.sac ?? "998391", qty: 1, ratePaise: input.amountPaise }];
      const { total } = invoiceTotals({ supply: inv.supply as "intra" | "inter", lines: noteLines, payments: [] });
      const note: Doc = {
        _id: new ObjectId().toHexString(),
        number,
        invoiceId: inv._id,
        invoiceNumber: inv.number,
        invoiceIssuedAt: inv.issuedAt,
        companyId: inv.companyId,
        dealId: inv.dealId,
        issuedAt,
        supply: inv.supply,
        lines: noteLines,
        reason: input.reason,
        seller: inv.seller,
        buyer: inv.buyer,
        createdBy: actorId,
      };
      await db.collection<Doc>("creditNotes").insertOne(note, { session });
      const updated = await invoices.findOneAndUpdate(
        { _id: inv._id },
        // `as never`: the driver's typing can't see `credits` on the loosely typed Doc; the shape is written right here.
        { $push: { credits: { creditNoteId: note._id, number, at: issuedAt, taxablePaise: input.amountPaise, totalPaise: total } } as never },
        { returnDocument: "after", session },
      );
      return { note, invoice: updated! };
    });
  } finally {
    await session.endSession();
  }
}

export async function createInvoice(db: Db, client: MongoClient, input: z.infer<typeof CreateInvoiceSchema> & { seller: Seller; buyer: Buyer }) {
  const issuedAt = input.issuedAt ?? new Date().toISOString();
  const fy = financialYear(new Date(issuedAt));
  const session = client.startSession();
  try {
    return await session.withTransaction(async () => {
      const doc: Doc = {
        _id: new ObjectId().toHexString(),
        number: await nextNumber(db, "invoice", INVOICE_PREFIX, fy, session),
        ...input,
        issuedAt,
        payments: [],
        sent: false,
      };
      await db.collection<Doc>("invoices").insertOne(doc, { session });
      return doc;
    });
  } finally {
    await session.endSession();
  }
}
