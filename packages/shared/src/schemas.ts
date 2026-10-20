/**
 * zod schemas shared by api + worker. Kept out of the main entry so the
 * web bundle doesn't ship zod until forms need it (M1+).
 */
import { z } from "zod";
import { BUSINESSES, CHANNELS, HEALTHS, ROLES } from "./domain";
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
  role: RoleSchema.default("member"),
});
export type AddMemberInput = z.infer<typeof AddMemberSchema>;

export const UpdateMemberSchema = z.object({ role: RoleSchema });

/* ---------- CRM records (API input) ---------- */
const id = z.string().trim().min(1).max(64);
const iso = z.iso.datetime({ offset: true });
const paise = z.number().int().nonnegative();
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
});
export const UpdateCompanySchema = CreateCompanySchema.partial();

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
export const UpdateContactSchema = CreateContactSchema.partial();

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
export const UpdateDealSchema = CreateDealSchema.partial().extend({
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
export const UpdateDraftInvoiceSchema = CreateInvoiceSchema.pick({ dealId: true, dueAt: true, supply: true, lines: true }).partial();

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
});
export const UpdateTaskSchema = CreateTaskSchema.partial().extend({
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
