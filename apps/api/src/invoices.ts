import { ObjectId, type Db, type MongoClient } from "mongodb";
import type { z } from "zod";
import type { CreateInvoiceSchema } from "@pinnacle/shared/schemas";
import type { Doc } from "./db";

export const INVOICE_PREFIX = "TOS";

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

export async function createInvoice(db: Db, client: MongoClient, input: z.infer<typeof CreateInvoiceSchema> & { seller: Seller }) {
  const issuedAt = input.issuedAt ?? new Date().toISOString();
  const fy = financialYear(new Date(issuedAt));
  const session = client.startSession();
  try {
    return await session.withTransaction(async () => {
      const counter = await db
        .collection<{ _id: string; seq: number }>("counters")
        .findOneAndUpdate({ _id: `invoice:${fy}` }, { $inc: { seq: 1 } }, { upsert: true, returnDocument: "after", session });
      const doc: Doc = {
        _id: new ObjectId().toHexString(),
        number: `${INVOICE_PREFIX}/${fy}/${String(counter!.seq).padStart(3, "0")}`,
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
