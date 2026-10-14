/**
 * zod schemas shared by api + worker. Kept out of the main entry so the
 * web bundle doesn't ship zod until forms need it (M1+).
 */
import { z } from "zod";
import { CHANNELS, HEALTHS, ROLES, STAGES } from "./domain";
import { gstState, GSTIN_RE } from "./gst";

export const StageSchema = z.enum([...STAGES, "lost"]);
export const ChannelSchema = z.enum(CHANNELS);
export const HealthSchema = z.enum(HEALTHS);
export const RoleSchema = z.enum(ROLES);

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
  gstin: z.string().trim().toUpperCase().regex(GSTIN_RE, "Invalid GSTIN").optional(),
  employees: z.number().int().positive().optional(),
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
});
export const UpdateDealSchema = CreateDealSchema.partial().extend({
  lostReason: optionalText(240),
  wonAt: iso.optional(),
});

/** Issued invoices are immutable — corrections go through a credit note, so there is no update schema. */
export const CreateInvoiceSchema = z.object({
  companyId: id,
  dealId: id.optional(),
  issuedAt: iso.optional(),
  dueAt: iso,
  supply: z.enum(["intra", "inter"]),
  lines: z
    .array(z.object({ desc: z.string().trim().min(1).max(240), sac: z.string().trim().regex(/^\d{4,8}$/), qty: z.number().positive(), ratePaise: paise }))
    .min(1)
    .max(100),
});

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
});
export type Workspace = z.output<typeof WorkspaceSchema>;
