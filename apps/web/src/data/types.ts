import type { Channel, Health, Paise, Role, Stage } from "@pinnacle/shared";

export type ID = string;
export type ISO = string;

export type Member = {
  id: ID;
  name: string;
  email: string;
  role: Role;
  title: string;
  status: "active" | "invited";
  lastSignInAt?: ISO;
  addedAt: ISO;
};

export type Company = {
  id: ID;
  name: string;
  domain: string;
  industry: string;
  city: string;
  ownerId: ID;
  tags: string[];
  lastActivityAt: ISO;
  gstin?: string;
  /** Billing address, printed under "Bill to" on invoices. */
  address?: string;
  employees?: number;
};

export type Contact = {
  id: ID;
  name: string;
  companyId?: ID;
  title: string;
  email?: string;
  phone?: string;
  handle?: string;
  city: string;
  ownerId: ID;
  source: Channel;
  lastActivityAt: ISO;
};

export type Deal = {
  id: ID;
  title: string;
  companyId: ID;
  contactId?: ID;
  stage: Stage;
  valuePaise: Paise;
  closeAt: ISO;
  ownerId: ID;
  channel: Channel;
  health: Health;
  nextStep?: string;
  position: number;
  createdAt: ISO;
  wonAt?: ISO;
  lostReason?: string;
};

export type Intent = "quote" | "meeting" | "question" | "other";

export type Message = { id: ID; direction: "in" | "out"; body: string; at: ISO; authorId?: ID };

export type Conversation = {
  id: ID;
  channel: Channel;
  name: string;
  handle: string;
  city: string;
  company?: string;
  contactId?: ID;
  dealId?: ID;
  assigneeId?: ID;
  unread: boolean;
  lastMessageAt: ISO;
  subject?: string;
  extracted?: {
    intent: Intent;
    service: string;
    estValuePaise: Paise;
    city: string;
    suggestedOwnerId: ID;
    confidence: number;
  };
  /** WhatsApp: free-form replies allowed until this time. */
  windowExpiresAt?: ISO;
  messages: Message[];
};

export type ActivityType = "stage" | "email" | "call" | "meeting" | "note" | "task" | "lead" | "won" | "invoice";
export type Activity = {
  id: ID;
  type: ActivityType;
  dealId?: ID;
  companyId?: ID;
  actorId: ID;
  text: string;
  body?: string;
  at: ISO;
};

export type Task = {
  id: ID;
  title: string;
  dueAt: ISO;
  done: boolean;
  doneAt?: ISO;
  assigneeId: ID;
  dealId?: ID;
  companyId?: ID;
  /** Create a Google Calendar reminder at the due time. */
  remind?: boolean;
};

export type InvoiceStatus = "draft" | "sent" | "partial" | "paid" | "overdue" | "cancelled";
export type InvoiceLine = { desc: string; sac: string; qty: number; ratePaise: Paise };
export type Invoice = {
  id: ID;
  number: string;
  dealId?: ID;
  companyId: ID;
  issuedAt: ISO;
  dueAt: ISO;
  /** intra-state → CGST + SGST; inter-state → IGST */
  supply: "intra" | "inter";
  lines: InvoiceLine[];
  payments: { at: ISO; amountPaise: Paise }[];
  sent: boolean;
  /** Our details as they were when the invoice was created (absent on sample invoices). */
  seller?: { legalName: string; gstin: string; address: string };
  /** The client's details as they were when the invoice was created. */
  buyer?: { name: string; gstin: string; address: string; city: string };
  /** Cancelled drafts stay on record so the number series has no gaps. */
  cancelled?: boolean;
  cancelledAt?: ISO;
  cancelReason?: string;
};

export type Lead = { id: ID; channel: Channel; stage: Stage; at: ISO };
