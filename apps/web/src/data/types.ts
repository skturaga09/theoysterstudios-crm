import type { ExpenseCategory, ScheduleItem, Approval, Business, Channel, DeliverableStatus, Health, Paise, Priority, ProjectStatus, Role, Stage, TaskStatus } from "@pinnacle/shared";

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
  /** Which of the two businesses it belongs to; unset = not decided yet (shown in every view). */
  business?: Business;
  id: ID;
  name: string;
  /** The card photo: an address the CRM issued (an upload, or their Instagram picture). */
  photo?: string;
  domain: string;
  industry: string;
  city: string;
  ownerId: ID;
  tags: string[];
  lastActivityAt: ISO;
  gstin?: string;
  /** Billing address, printed under "Bill to" on invoices. */
  address?: string;
  /** Set when their first deal is confirmed — they're a client from then on. */
  clientSince?: ISO;
  /** Files and documents kept elsewhere (Drive folders, contracts, shot lists…). */
  links?: { label: string; url: string }[];
  employees?: number;
};

export type Contact = {
  /** Which of the two businesses it belongs to; unset = not decided yet (shown in every view). */
  business?: Business;
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
  /** Which of the two businesses it belongs to; unset = not decided yet (shown in every view). */
  business?: Business;
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
  /** When it was marked Lost (for "lost this month"). */
  lostAt?: ISO;
  lostReason?: string;
  /** Lead details from the client's brief. */
  service?: string;
  location?: string;
  /** Wedding / event date (photography), YYYY-MM-DD. */
  eventDate?: string;
  requirements?: string;
  /** When to follow up next; null/absent = none scheduled. */
  nextFollowUpAt?: ISO | null;
  /** Payment stages (before GST); each becomes an invoice when it's due. */
  schedule?: ScheduleItem[];
};

/** A quotation / proposal: priced lines, terms and the payment plan the client agrees to. */
export type Quote = {
  id: ID;
  number: string;
  business: Business;
  companyId: ID;
  dealId?: ID;
  ownerId: ID;
  validUntil: string;
  supply: "intra" | "inter";
  lines: { desc: string; sac: string; qty: number; ratePaise: Paise }[];
  terms: string;
  schedule: ScheduleItem[];
  status: "draft" | "sent" | "accepted" | "declined";
  createdAt: ISO;
  /** Set when the client signed it online: who, when, from where, and the fingerprint of what they signed. */
  signature?: { name: string; email?: string; phone?: string; at: ISO; ip: string; userAgent: string; fingerprint: string; method: string };
};

export type Expense = {
  id: ID;
  date: string;
  business?: Business;
  category: ExpenseCategory;
  description: string;
  vendor?: string;
  amountPaise: Paise;
  gstPaise: Paise;
  projectId?: ID;
  /** The client it was spent for (from the project when not chosen). */
  companyId?: ID;
  receiptUrl?: string;
  createdAt: ISO;
};

export type Intent = "quote" | "meeting" | "question" | "other";

export type Message = { id: ID; direction: "in" | "out"; body: string; at: ISO; authorId?: ID };

export type Conversation = {
  /** Which of the two businesses it belongs to; unset = not decided yet (shown in every view). */
  business?: Business;
  id: ID;
  /** Their profile picture (Instagram), kept by the CRM; becomes the client card photo on conversion. */
  photo?: string;
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
  /** A booking from Google Calendar: when the meeting is. */
  meetingAt?: ISO;
  extracted?: {
    intent: Intent;
    service: string;
    estValuePaise: Paise;
    city: string;
    suggestedOwnerId: ID;
    confidence: number;
  };
  /** Gmail: the mailbox and thread it came in on, for "Reply in Gmail". */
  gmailThread?: { account: string; threadId: string };
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
  /** Meetings from Google Calendar: when the meeting happens (not when it was synced). */
  meetingAt?: ISO;
};

export type Task = {
  /** Which of the two businesses it belongs to; unset = not decided yet (shown in every view). */
  business?: Business;
  id: ID;
  title: string;
  dueAt: ISO;
  done: boolean;
  doneAt?: ISO;
  /** Who completed it (set by the server with doneAt). */
  doneBy?: ID;
  assigneeId: ID;
  dealId?: ID;
  companyId?: ID;
  /** Create a Google Calendar reminder at the due time. */
  remind?: boolean;
  /** Project work. Older tasks have none of these; read them with defaults. */
  projectId?: ID;
  priority?: Priority;
  startAt?: ISO;
  status?: TaskStatus;
  approval?: Approval;
  links?: { label: string; url: string }[];
  /** `authorId: "client"` = left by the client in the portal, with the name they gave. */
  comments?: { id: ID; authorId: ID; authorName?: string; body: string; at: ISO }[];
};

/** Work for a confirmed client: a wedding (with its functions) or a marketing engagement. */
export type Project = {
  id: ID;
  name: string;
  business: Business;
  companyId: ID;
  dealId?: ID;
  status: ProjectStatus;
  managerId?: ID;
  startDate?: string;
  dueDate?: string;
  events: ProjectEvent[];
  crew: { memberId: ID; role: string }[];
  deliverables: { id: string; name: string; dueDate?: string; status: DeliverableStatus; url?: string }[];
  retainerPaise?: number;
  calendarUrl?: string;
  notes?: string;
  /** `client: true` = shown to the client in their portal. */
  links: { label: string; url: string; client?: boolean }[];
  /** Marketing: campaign details. */
  campaign?: string;
  /** Updates shared with the client (newest first). */
  clientUpdates?: { id: string; body: string; at: ISO; by: string }[];
  /** Retainer months started ("2026-11"). */
  cycles?: string[];
  driveFolderId?: string;
  driveFolderError?: string;
  createdAt: ISO;
};

export type InvoiceStatus = "draft" | "sent" | "partial" | "paid" | "overdue" | "cancelled" | "credited";

/** A GST credit note against a sent invoice, in its own number series (TOS/CN/26-27/001). */
export type CreditNote = {
  id: ID;
  number: string;
  invoiceId: ID;
  invoiceNumber: string;
  invoiceIssuedAt: ISO;
  companyId: ID;
  dealId?: ID;
  issuedAt: ISO;
  supply: "intra" | "inter";
  lines: InvoiceLine[];
  reason: string;
  seller?: Invoice["seller"];
  buyer?: Invoice["buyer"];
};
export type InvoiceLine = { desc: string; sac: string; qty: number; ratePaise: Paise };
export type Invoice = {
  /** Which of the two businesses it belongs to; unset = not decided yet (shown in every view). */
  business?: Business;
  id: ID;
  number: string;
  dealId?: ID;
  companyId: ID;
  issuedAt: ISO;
  dueAt: ISO;
  /** intra-state → CGST + SGST; inter-state → IGST */
  supply: "intra" | "inter";
  lines: InvoiceLine[];
  payments: { at: ISO; amountPaise: Paise; ref?: string; method?: string }[];
  sent: boolean;
  /** Our details as they were when the invoice was created (absent on sample invoices). */
  seller?: { legalName: string; gstin: string; address: string };
  /** The client's details as they were when the invoice was created. */
  buyer?: { name: string; gstin: string; address: string; city: string };
  /** Credit notes raised against this invoice; they lower the balance like payments. */
  credits?: { creditNoteId: ID; number: string; at: ISO; taxablePaise: Paise; totalPaise: Paise }[];
  /** Cancelled drafts stay on record so the number series has no gaps. */
  cancelled?: boolean;
  cancelledAt?: ISO;
  cancelReason?: string;
  paymentLink?: { id: string; url: string; amountPaise: Paise; status: "created" | "paid"; createdAt: ISO };
};

export type Lead = { id: ID; channel: Channel; stage: Stage; at: ISO };

/** A function on a project and who covers it. Crew are typed names, so freelancers outside the CRM fit too. */
export type ProjectEvent = {
  id: string;
  name: string;
  date?: string;
  venue?: string;
  duration?: string;
  photo?: number;
  photoCrew?: string[];
  video?: number;
  videoCrew?: string[];
  addOns?: string;
};
