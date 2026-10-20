/**
 * zod schemas shared by api + worker. Kept out of the main entry so the
 * web bundle doesn't ship zod until forms need it (M1+).
 */
import { z } from "zod";
import { APPROVALS, EXPENSE_CATEGORIES, BUSINESSES, CHANNELS, DELIVERABLE_STATUSES, HEALTHS, NOTIFICATION_KINDS, PRIORITIES, PROJECT_STATUSES, ROLES, TASK_STATUSES } from "./domain";
import { gstState, GSTIN_RE } from "./gst";

/** A stage id from the deal's business pipeline (checked against it by the API). */
export const StageSchema = z.string().trim().regex(/^[a-z0-9-]{1,30}$/, "Invalid stage");
export const ChannelSchema = z.enum(CHANNELS);
export const HealthSchema = z.enum(HEALTHS);
export const RoleSchema = z.enum(ROLES);
export const BusinessSchema = z.enum(BUSINESSES);

/**
 * Team & access (admin-only). Sign-in is allowed only for addresses on this list.
 * Any Google account works — Workspace or personal @gmail.com.
 */
export const MemberStatusSchema = z.enum(["invited", "active", "removed"]);

export const AddMemberSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email({ message: "Enter a valid Google or Gmail address" })),
  name: z.string().trim().min(1).max(80).optional(),
  role: RoleSchema.default("crew"),
});
export type AddMemberInput = z.infer<typeof AddMemberSchema>;

export const UpdateMemberSchema = z.object({ role: RoleSchema });

export const NotificationPreferencesSchema = z.object({
  app: z.object(Object.fromEntries(NOTIFICATION_KINDS.map((kind) => [kind, z.boolean()])) as Record<(typeof NOTIFICATION_KINDS)[number], z.ZodBoolean>),
});

/* ---------- CRM records (API input) ---------- */
const id = z.string().trim().min(1).max(64);
const iso = z.iso.datetime({ offset: true });
const paise = z.number().int().nonnegative();
/**
 * Like `.partial()`, but without the create-time defaults: zod's partial keeps them, so every PATCH would
 * quietly reset fields it didn't mention (e.g. a task's reminder) to their default.
 */
function patchOf<T extends z.ZodRawShape>(schema: z.ZodObject<T>) {
  const shape = Object.fromEntries(Object.entries(schema.shape).map(([k, v]) => [k, ((v instanceof z.ZodDefault ? v.unwrap() : v) as z.ZodType).optional()]));
  return z.object(shape) as unknown as ReturnType<z.ZodObject<T>["partial"]>;
}
const optionalText = (max: number) => z.string().trim().max(max).optional();

export const CreateCompanySchema = z.object({
  name: z.string().trim().min(1).max(120),
  domain: z.string().trim().toLowerCase().max(120).default(""),
  industry: z.string().trim().max(80).default(""),
  city: z.string().trim().max(80).default(""),
  ownerId: id,
  tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  // "" clears it (the client isn't GST-registered).
  gstin: z.string().trim().toUpperCase().pipe(z.union([z.literal(""), z.string().regex(GSTIN_RE, "Invalid GSTIN")])).optional(),
  /** Billing address, printed under "Bill to" on invoices. */
  address: z.string().trim().max(300).optional(),
  employees: z.number().int().positive().optional(),
  business: BusinessSchema.optional(),
  /** Files and documents kept elsewhere (Google Drive folders, contracts, shot lists…). */
  links: z
    .array(z.object({ label: z.string().trim().min(1, "Name the link").max(80), url: z.string().trim().url("Enter a full web address, starting https://").max(2000) }))
    .max(50)
    .optional(),
});
export const UpdateCompanySchema = patchOf(CreateCompanySchema);

export const CreateContactSchema = z.object({
  name: z.string().trim().min(1).max(120),
  companyId: id.optional(),
  title: z.string().trim().max(80).default(""),
  email: z.string().trim().toLowerCase().pipe(z.email()).optional(),
  phone: optionalText(20),
  handle: optionalText(80),
  city: z.string().trim().max(80).default(""),
  ownerId: id,
  source: ChannelSchema,
  business: BusinessSchema.optional(),
});
export const UpdateContactSchema = patchOf(CreateContactSchema);

export const CreateDealSchema = z.object({
  title: z.string().trim().min(1).max(160),
  companyId: id,
  contactId: id.optional(),
  stage: StageSchema.default("new"),
  valuePaise: paise,
  closeAt: iso,
  ownerId: id,
  channel: ChannelSchema,
  health: HealthSchema.default("ok"),
  nextStep: optionalText(240),
  position: z.number().int().nonnegative().optional(),
  business: BusinessSchema.optional(),
  /** Lead details from the client's brief. */
  service: optionalText(120),
  location: optionalText(120),
  /** Wedding / event date (photography), YYYY-MM-DD. */
  eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date").optional(),
  requirements: optionalText(2000),
  /** When to follow up next; null clears it. */
  nextFollowUpAt: iso.nullable().optional(),
});
export const UpdateDealSchema = patchOf(CreateDealSchema).extend({
  lostReason: optionalText(240),
  wonAt: iso.optional(),
});

/** Issued invoices are immutable — corrections go through a credit note, so there is no update schema. */
export const CreditNoteSchema = z.object({
  /** Taxable value to credit, before GST; GST is added at the invoice's rate. */
  amountPaise: z.number().int().positive("Enter an amount above ₹0"),
  reason: z.string().trim().min(1, "Say why the credit is being given").max(200),
});

export const CreateInvoiceSchema = z.object({
  companyId: id,
  dealId: id.optional(),
  issuedAt: iso.optional(),
  dueAt: iso,
  supply: z.enum(["intra", "inter"]),
  /** Which business the work was for; taken from the deal when there is one. One legal entity and series either way. */
  business: BusinessSchema.optional(),
  lines: z
    .array(z.object({ desc: z.string().trim().min(1).max(240), sac: z.string().trim().regex(/^\d{4,8}$/), qty: z.number().positive(), ratePaise: paise }))
    .min(1)
    .max(100),
});
/** A draft can change everything except who it's for and when it was issued (its number belongs to that year). */
export const UpdateDraftInvoiceSchema = patchOf(CreateInvoiceSchema.pick({ dealId: true, dueAt: true, supply: true, lines: true }));

export const RecordPaymentSchema = z.object({ amountPaise: paise.refine((v) => v > 0, "Amount must be positive"), at: iso.optional() });

/* ---------- Workspace (Settings → Workspace) ---------- */
/** Blank is allowed ("not set yet"); anything else must match `schema`. */
const optionalField = <T extends z.ZodType<string, string>>(schema: T) => z.string().trim().pipe(z.union([z.literal(""), schema])).default("");

export const WorkspaceSchema = z.object({
  studioName: z.string().trim().min(1, "Add the studio's name").max(80),
  /** Seller details printed on tax invoices. */
  legalName: z.string().trim().max(120).default(""),
  gstin: optionalField(
    z.string().toUpperCase().regex(GSTIN_RE, "That isn't a valid GSTIN (15 characters, e.g. 29ABCDE1234F1Z5)").refine((v) => !!gstState(v), "Unknown GST state code"),
  ),
  address: z.string().trim().max(300).default(""),
  /** Connections used by the integrations. */
  googleDomain: optionalField(z.string().toLowerCase().regex(/^([a-z0-9-]+\.)+[a-z]{2,}$/, "Enter a domain like theoysterstudios.com")),
  enquiryEmail: optionalField(z.string().toLowerCase().pipe(z.email("Enter a full email address"))),
  instagramHandle: optionalField(z.string().regex(/^@?[A-Za-z0-9._]{1,30}$/, "Instagram usernames use letters, numbers, . and _").transform((v) => (v.startsWith("@") ? v : `@${v}`))),
  whatsappNumber: optionalField(z.string().transform((v) => v.replace(/[\s-]/g, "")).pipe(z.string().regex(/^\+\d{10,15}$/, "Use international format, e.g. +91 98765 43210"))),
  /** Off: Members see only their own deals (and those deals' tasks, activity and invoices). Admins and Managers always see everything. */
  membersSeeAllDeals: z.boolean().default(true),
  /** Minutes a lead's message may wait before the assignee and owners are alerted. */
  replyTargetMinutes: z.number().int().min(5).max(1440).default(30),
});
export type Workspace = z.output<typeof WorkspaceSchema>;

/* ---------- Tasks and activity ---------- */
export const CreateTaskSchema = z.object({
  title: z.string().trim().min(1, "Add a task title").max(200),
  dueAt: iso,
  assigneeId: id,
  dealId: id.optional(),
  companyId: id.optional(),
  /** Create a Google Calendar reminder at the due time (once Calendar is connected). */
  remind: z.boolean().default(false),
  business: BusinessSchema.optional(),
  /** Project work: which project, how urgent, when it starts, where it is, and whether the client must approve. */
  projectId: id.optional(),
  priority: z.enum(PRIORITIES).default("normal"),
  startAt: iso.optional(),
  status: z.enum(TASK_STATUSES).default("todo"),
  approval: z.enum(APPROVALS).default("none"),
  links: z.array(z.object({ label: z.string().trim().min(1).max(80), url: z.string().trim().url().max(2000) })).max(20).default([]),
});
export const UpdateTaskSchema = patchOf(CreateTaskSchema).extend({
  done: z.boolean().optional(),
  doneAt: iso.nullable().optional(),
});

export const ACTIVITY_TYPES = ["stage", "email", "call", "meeting", "note", "task", "lead", "won", "invoice"] as const;
/** Who and when are set by the API from the signed-in person, never taken from the request. */
export const CreateActivitySchema = z.object({
  type: z.enum(ACTIVITY_TYPES),
  dealId: id.optional(),
  companyId: id.optional(),
  text: z.string().trim().min(1).max(300),
  body: optionalText(5000),
});

/* ---------- Lead routing ---------- */
export const RoutingRuleSchema = z
  .object({
    id: id,
    channel: ChannelSchema.optional(),
    city: z.string().trim().min(1).max(80).optional(),
    minPaise: z.number().int().positive().optional(),
    ownerId: id,
  })
  .refine((r) => r.channel || r.city || r.minPaise, "A rule needs at least one condition");
export const RoutingSchema = z.object({ rules: z.array(RoutingRuleSchema).max(50) });

/* ---------- Import (CSV rows, already mapped to field names) ---------- */
export const ImportRequestSchema = z.object({ rows: z.array(z.record(z.string(), z.unknown())).min(1).max(2000) });
/** A contact row may name its company instead of pointing at an id; the API finds or creates it. */
export const ImportContactRowSchema = CreateContactSchema.omit({ companyId: true }).extend({ companyName: z.string().trim().max(120).optional() });

/* ---------- Integration setup (Settings → Integration setup, admins) ---------- */
export const SetupProgressSchema = z.object({ done: z.array(z.string().trim().min(1).max(40)).max(100) });
/** Keys the client pastes in. Blank = leave as is; secrets are write-only (the API never returns them). */
export const IntegrationKeysSchema = z.object({
  googleClientId: optionalField(z.string().regex(/^[\w.-]+\.apps\.googleusercontent\.com$/, "A Google Client ID ends in .apps.googleusercontent.com")),
  googleClientSecret: z.string().trim().max(200).default(""),
  instagramAppId: optionalField(z.string().regex(/^\d{6,25}$/, "An Instagram App ID is a long number")),
  instagramAppSecret: optionalField(z.string().regex(/^[a-f0-9]{32}$/i, "An Instagram App secret is 32 letters and numbers")),
  metaAppSecret: optionalField(z.string().regex(/^[a-f0-9]{32}$/i, "A Meta App secret is 32 letters and numbers")),
  razorpayKeyId: optionalField(z.string().regex(/^rzp_(test|live)_[A-Za-z0-9]{8,32}$/, "A Razorpay Key ID starts rzp_live_ (or rzp_test_)")),
  razorpayKeySecret: optionalField(z.string().regex(/^[A-Za-z0-9]{16,64}$/, "A Razorpay Key secret is letters and numbers")),
  razorpayWebhookSecret: optionalField(z.string().min(8, "Use at least 8 characters").max(200)),
  whatsappPhoneNumberId: optionalField(z.string().regex(/^\d{8,25}$/, "The Phone number ID is a long number (not the phone number itself)")),
  whatsappToken: optionalField(z.string().regex(/^EA[A-Za-z0-9]{40,}$/, "A WhatsApp access token starts with EA")),
  whatsappReminderTemplate: optionalField(z.string().regex(/^[a-z0-9_]{1,100}$/, "Template names are lowercase letters, numbers and _")),
  whatsappTemplateLanguage: optionalField(z.string().regex(/^[a-z]{2,3}(_[A-Z]{2})?$/, "A language code like en or en_US")),
});

export const UpdateConversationSchema = z.object({
  unread: z.boolean().optional(),
  business: BusinessSchema.nullable().optional(),
  assigneeId: id.nullable().optional(),
  dealId: id.nullable().optional(),
  contactId: id.nullable().optional(),
});

/* ---------- Pipelines (Settings → Pipelines & stages, admins) ---------- */
export const PipelineStageSchema = z.object({
  id: StageSchema,
  label: z.string().trim().min(1, "Every stage needs a name").max(40),
  kind: z.enum(["open", "won", "lost"]),
  probability: z.number().min(0).max(1),
});
export const PipelineSchema = z
  .array(PipelineStageSchema)
  .min(3)
  .max(20)
  .refine((st) => new Set(st.map((s) => s.id)).size === st.length, "Two stages share an id")
  .refine((st) => st.filter((s) => s.kind === "won").length === 1 && st.filter((s) => s.kind === "lost").length === 1, "Keep exactly one Confirmed (won) and one Lost stage")
  // Their ids are fixed ("won", "lost") so "is this deal still open?" never needs the pipeline; only their names change.
  .refine((st) => st.every((s) => (s.kind === "won" ? s.id === "won" : s.kind === "lost" ? s.id === "lost" : s.id !== "won" && s.id !== "lost")), "The Confirmed and Lost stages keep their ids")
  .refine((st) => st.some((s) => s.kind === "open"), "Keep at least one open stage");
export const PipelinesSchema = z.object({ photography: PipelineSchema, marketing: PipelineSchema });

/* ---------- Projects ---------- */
const link = z.object({ label: z.string().trim().min(1, "Name the link").max(80), url: z.string().trim().url("Enter a full web address, starting https://").max(2000) });
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date");
const smallId = z.string().trim().min(1).max(40);

export const ProjectEventSchema = z.object({ id: smallId, name: z.string().trim().min(1).max(80), date: day.optional(), venue: optionalText(160) });
export const CrewSchema = z.object({ memberId: id, role: z.string().trim().min(1).max(60) });
export const DeliverableSchema = z.object({
  id: smallId,
  name: z.string().trim().min(1).max(120),
  dueDate: day.optional(),
  status: z.enum(DELIVERABLE_STATUSES).default("pending"),
  url: z.string().trim().url().max(2000).optional(),
});

export const CreateProjectSchema = z.object({
  name: z.string().trim().min(1, "Name the project").max(160),
  business: BusinessSchema,
  companyId: id,
  dealId: id.optional(),
  status: z.enum(PROJECT_STATUSES).default("active"),
  managerId: id.optional(),
  startDate: day.optional(),
  dueDate: day.optional(),
  events: z.array(ProjectEventSchema).max(30).default([]),
  crew: z.array(CrewSchema).max(40).default([]),
  deliverables: z.array(DeliverableSchema).max(40).default([]),
  /** Marketing: monthly retainer and the content calendar (e.g. a Notion link). */
  retainerPaise: z.number().int().nonnegative().optional(),
  calendarUrl: z.string().trim().url().max(2000).optional(),
  notes: optionalText(4000),
  links: z.array(link).max(50).default([]),
});
export const UpdateProjectSchema = patchOf(CreateProjectSchema);

export const TaskCommentSchema = z.object({ body: z.string().trim().min(1, "Write a comment").max(2000) });

export const TemplatesSchema = z.object({
  photography: z.object({
    tasks: z.array(z.object({ title: z.string().trim().min(1).max(160), from: z.enum(["event", "confirmed"]), days: z.number().int().min(-365).max(365), priority: z.enum(PRIORITIES), approval: z.boolean().optional() })).max(60),
    deliverables: z.array(z.object({ name: z.string().trim().min(1).max(120), from: z.enum(["event", "confirmed"]), days: z.number().int().min(-365).max(365) })).max(30),
  }),
  marketing: z.object({
    tasks: z.array(z.object({ title: z.string().trim().min(1).max(160), from: z.enum(["event", "confirmed"]), days: z.number().int().min(-365).max(365), priority: z.enum(PRIORITIES), approval: z.boolean().optional() })).max(60),
    deliverables: z.array(z.object({ name: z.string().trim().min(1).max(120), from: z.enum(["event", "confirmed"]), days: z.number().int().min(-365).max(365) })).max(30),
  }),
});

/* ---------- Finance ---------- */
const money = z.number().int().nonnegative();
const plan = z
  .array(z.object({ label: z.string().trim().min(1).max(80), percent: z.number().min(0).max(100), from: z.enum(["event", "confirmed"]), days: z.number().int().min(-365).max(730) }))
  .min(1)
  .max(12)
  .refine((steps) => Math.abs(steps.reduce((a, x) => a + x.percent, 0) - 100) < 0.01, "The stages must add up to 100%");
export const FinanceSettingsSchema = z.object({
  packages: z
    .array(z.object({ id: smallId, business: BusinessSchema, name: z.string().trim().min(1).max(120), description: optionalText(400), pricePaise: money, monthly: z.boolean().optional(), addOn: z.boolean().optional() }))
    .max(200),
  plans: z.object({ photography: plan, marketing: plan }),
  terms: z.object({ photography: z.string().trim().max(6000), marketing: z.string().trim().max(6000) }),
});

export const ScheduleItemSchema = z.object({ id: smallId, label: z.string().trim().min(1).max(120), amountPaise: money, dueDate: day.optional(), invoiceId: id.optional() });
export const ScheduleSchema = z.object({ schedule: z.array(ScheduleItemSchema).max(36) });

const quoteLine = z.object({ desc: z.string().trim().min(1).max(400), sac: z.string().trim().regex(/^\d{4,8}$/), qty: z.number().positive(), ratePaise: money });
export const CreateQuoteSchema = z.object({
  companyId: id,
  dealId: id.optional(),
  ownerId: id,
  business: BusinessSchema,
  validUntil: day,
  supply: z.enum(["intra", "inter"]).default("intra"),
  lines: z.array(quoteLine).max(60).default([]),
  terms: z.string().trim().max(6000).default(""),
  schedule: z.array(ScheduleItemSchema).max(36).default([]),
  status: z.enum(["draft", "sent", "accepted", "declined"]).default("draft"),
});
export const UpdateQuoteSchema = patchOf(CreateQuoteSchema);

export const CreateExpenseSchema = z.object({
  date: day,
  business: BusinessSchema.optional(),
  category: z.enum(EXPENSE_CATEGORIES),
  description: z.string().trim().min(1, "Say what it was for").max(240),
  vendor: optionalText(120),
  /** Before GST; the GST paid (input credit) is kept separately. */
  amountPaise: z.number().int().positive("Enter an amount above ₹0"),
  gstPaise: money.default(0),
  projectId: id.optional(),
  receiptUrl: z.string().trim().url("Enter a full web address, starting https://").max(2000).optional(),
});
export const UpdateExpenseSchema = patchOf(CreateExpenseSchema);
