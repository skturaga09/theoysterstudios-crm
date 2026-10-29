# Decisions log

Running list of choices that interpret or deviate from `PINNACLE_CRM_BUILD_PROMPT.md`.
Open items are marked **(open)**.

The full client requirements were re-audited on 20 October 2026. The coverage matrix and intentional Phase 4 deferrals live in `docs/REQUIREMENTS_AUDIT.md`.

## Milestone 0

1. **Prototype not yet received (open).** Tokens, type and motion are built from §3–§4 of the brief.
   When `reference/pinnacle-prototype.html` arrives, the styleguide is reconciled against it before M1.
2. **IA mismatches with the client mockup** (defaults, pending confirmation):
   - Mockup's "Delivery" stage dropped; Halcyon Hotels seeded as Won.
   - Nav item is **Pipeline** (`/pipeline`), not "Deals".
   - Inbox is built per §5.2 (mockup had only a toast).
   - Seed dates moved +4 weeks so "today" (14 Oct 2026) reads as current.
   - Home uses Lead Flow + Arriving now instead of the mockup's funnel + activity panels.
   - Team surnames for Riya and Aditi are abbreviated ("Riya V", "Aditi K") to match the mockup's RV / AK initials.
3. **Fonts** are self-hosted via `@fontsource-variable` (same Google Fonts families) — no runtime
   request to Google, better LCP.
4. **Timezone library:** `date-fns` v4 uses `@date-fns/tz` (successor to `date-fns-tz`).
5. **zod kept out of the web bundle** for now: schemas live at `@pinnacle/shared/schemas`
   and are imported by api/worker; the web app will pull them in with forms (M1+).
6. **Initial JS** is ~207 KB gzip (budget 250). Next lever if needed: Motion `LazyMotion` + `m`.
7. **Signal gradient (Santhosh, 14 Oct).** Warm orange → coral → rose (`--grad`, `bg-grad`, `text-grad`), extending the accent. Used only on highlights: user's name in the greeting, logo mark, the signal button, the current StageMeter segment. Deliberately not purple/blue, per §1.
8. **ChannelChip** uses the 6px control radius (brief allows 6 / 8 / 10 / 14 / 99 only).

## Added requirement — Team & access (from Santhosh, 14 Oct)

Admins manage who can use the CRM:
- **Settings → Team & access** (admin-only): add a person by Google / Gmail address, set role
  (now the five roles below), change role, remove access. Shows status (Invited / Active) and last sign-in.
- **Sign-in:** Google sign-in via Identity Platform, then an **allowlist check** — only emails on this
  list (status ≠ removed) get a session. Any Google account works, including personal `@gmail.com`.
  This replaces §8's "restricted to the client's Workspace domain".
- Removing a user revokes sessions immediately; their deals/tasks stay and are reassigned by the admin.
- Guard rails: the last admin can't be removed or demoted; admins can't remove themselves.
- Audit log entries for add / remove / role change.
- Planned for **M3** (with auth). Schema stub: `AddMemberSchema` in `packages/shared/src/schemas.ts`.
- **(open)** Should an added user get an invitation email (sent from the admin's Gmail), or just be told
  to sign in at the app URL?

## Screens with sample data (14 Oct)

All screens are built against an in-browser store (`apps/web/src/data/store.ts`) whose actions
mirror the M3 API, so wiring the API swaps the data source, not the screens.

- **Live leads are simulated** (`data/live.ts`): three sample leads arrive while the app is open
  (first after ~15s) to exercise the feed flash, nav count and Lead Flow burst. Replaced by SSE in M3.
- **Lead Flow history** is generated deterministically (`seed.ts → LEADS`) so the Sankey has a
  realistic 90 days of volume. Recent leads skew to New, older ones to Won/Lost.
- **Team & access:** the "Email them an invite" checkbox answers the open invite question per add —
  default on (sent from the admin's Gmail), or off to just share the sign-in link. **(open)** confirm default.
- **Change stage (bulk, Companies)** moves each selected company's *best open deal*.
- **Reports date range:** 30 days / Quarter / 12 months. Revenue months shown: 2 / 3 / 12.
- **Invoices:** PDF and payment gateway are stubs (server-side PDF in M6; gateway out of scope v1).
  GST: Karnataka GSTIN → CGST+SGST for KA clients, IGST otherwise; SAC 998391.
- **Inbox:** "Not converted" is the default view, so a converted conversation collapses out of the list.
  Lead Ads conversations show a call/WhatsApp hint instead of a reply box (Meta has no reply path).
- **Initial JS** ≈ 230 KB gzip (budget 250). Recharts, dnd-kit, TanStack Table and d3-sankey load per route.

## API data layer (Firestore with MongoDB compatibility)

- **Client chose MongoDB; we run it as Firestore with MongoDB compatibility** (Enterprise edition, `asia-south1`)
  inside the Firebase project instead of Atlas — one project, one bill. Needs the Blaze plan.
  Firestore constraints the code follows: `retryWrites=false`, one index per `createIndex` call, no partial
  indexes (contacts' unique email is `sparse`), one database per connection (taken from the URI path).
  Change streams are not documented as supported — live lead updates need another path (M3).
- **Official `mongodb` driver + shared zod schemas**, no Mongoose. Documents use the web app's string ids as `_id`;
  the API returns them as `id`, so responses match `apps/web/src/data/types.ts`.
- **Invoice numbers** `TOS/<FY>/<NNN>` come from a per-financial-year counter (April–March, IST), bumped in the
  same transaction as the insert so numbers stay consecutive. Issued invoices have no update route (credit notes later).
- **Sign-in:** Firebase Auth with Google. The web app sends the Firebase ID token; the API verifies it
  (firebase-admin, no service account) and requires a verified email on the `members` list (status not
  `removed`), checked on every request so removal is immediate. `ADMIN_EMAIL` seeds the first admin.
  The API refuses to remove the last admin or let an admin remove themselves.
- **Team invites:** no email is sent (the old "Email them an invite" checkbox is gone); admins share the sign-in link.
- **Web → API:** the web calls `/api/*` (Vite proxy to :8787 locally; Hosting → Cloud Run rewrite in prod);
  the API strips the `/api` prefix. The app shell is lazy-loaded alongside the sign-in check to keep initial JS ≈ 211 KB gzip.
- **Data wiring:** at sign-in the web loads team, companies, contacts, deals and invoices from the API into the
  existing zustand store (`data/sync.ts`), so screens are unchanged. Edits update the screen first and roll back
  with a toast if the save fails; creates (new deal, lead conversion) wait for the API's id. `ME_ID` is a live
  binding set to the signed-in member. Sample tasks and activity are cleared (they pointed at sample deals);
  the inbox, Lead Flow and revenue history remain samples. Not yet stored: tasks, notes, calls, activity history.
- **Invoice maths** (`invoiceTotals`) lives in `@pinnacle/shared` so the API can refuse overpayments with the same
  GST rounding the screen shows. Payments run in a transaction.
- **Admins vs support:** the client's addresses are the CRM admins (`ADMIN_EMAIL`, comma-separated). The
  developer manages the Firebase/GCP project and signs in to the CRM only through `SUPPORT_EMAILS` (server-only):
  a synthetic admin `{ id: "support", name: "Support", email: "" }` that is never written to `members`, never
  listed, never offered as an owner, and can't be removed by the client. New work defaults to the first teammate.
- **New invoice:** a composer (Invoices → New invoice, the C shortcut on Invoices, ⌘K, or "Raise invoice" on a
  won deal, pre-filled from it). Rates are entered in ₹ before GST; SAC defaults to 998391. Tax type follows the
  client's GSTIN state code vs ours (same → CGST+SGST, else IGST), overridable when the client has no GSTIN.
  Created as a draft (new "Drafts" filter); the API checks the company exists and the deal belongs to it.

## Hosting (live at https://theoysterstudios-crm-staging.web.app)

- **Web:** Firebase Hosting. `/api/**` is rewritten to the `api` function, so web and API share one origin (no CORS).
- **API:** Cloud Functions 2nd gen (`asia-south1`, runs on Cloud Run) via the Firebase CLI — no gcloud needed.
  `apps/api/bundle.mjs` bundles our code + `@pinnacle/shared` into `apps/api/deploy` (gitignored). 512 MiB,
  concurrency 40, max 3 instances, scales to zero (first request after idle takes a few seconds).
- **Secrets** live in Secret Manager: `MONGODB_URI`, `ADMIN_EMAIL`, `SUPPORT_EMAILS`. Change one with
  `firebase functions:secrets:set NAME` and redeploy the function.
- **Deploy:** `firebase deploy --only functions,hosting` (builds both first).
- **Workspace settings** are one document (`workspace/studio`): studio name, legal name, GSTIN, address, plus
  "Connections" the integrations will read (Google Workspace domain, enquiry inbox, Instagram handle, WhatsApp
  number). Admins edit them in Settings → Workspace; validated by `WorkspaceSchema` (GSTIN format + known state
  code). Invoices can't be created until legal name and GSTIN are set, and each invoice keeps a `seller` copy.
- **Backups (oyster-crm):** deletion protection on; point-in-time recovery on (7 days); daily backup kept 14 days
  (`firebase firestore:backups:schedules:list --database oyster-crm`). The test database has none of these.
- **Lead routing:** one ordered rule list (`routing/rules`), edited by admins in Settings → Lead routing; every
  change saves. `routeLead()` in `@pinnacle/shared` picks the owner — first rule whose conditions all match
  (channel, city case-insensitive, min value in paise; an unknown value never matches a value rule) and whose
  owner is still on the team. Inbox → Create deal uses it now; the channel integrations will call the same function.
- **Adding records directly:** New company / New contact composers (Companies and Contacts pages, C, ⌘K). A contact
  needs a name and at least one of email, phone or Instagram; a typed company name is matched or created.
- **Import (Settings → Import & export, admins):** CSV from Sheets / Excel / Notion, parsed in the browser
  (`parseCsv` in `@pinnacle/shared`), columns auto-matched by header name and adjustable, 5-row preview, ≤2,000 rows.
  The API validates each row with the same schemas, skips duplicates (contacts by email, companies by
  case-insensitive name) and bad rows with a reason, and creates companies named on contact rows. Export now writes
  real CSV (`toCsv`) instead of JSON-escaped fields.
- **Invoice PDF:** `/invoices/:id/print` is a print-ready A4 GST tax invoice (supplier/recipient GSTIN and state
  code, place of supply, SAC, CGST/SGST or IGST, amounts with paise, amount in words via `rupeesInWords`); the
  browser's "Save as PDF" makes the file. No server-side PDF yet — needed only when invoices are emailed from the CRM.
- **Cancelling:** only unsent drafts can be cancelled, with a reason; they stay listed as "Cancelled" so the number
  series has no gaps. Sent invoices need a credit note (not built). "Send invoice" is labelled "Mark as sent" — no email.
- **Permissions (enforced by the API, mirrored in the UI):** superseded by the five roles below (slice 5).
- **Billing address** on companies; invoices snapshot the buyer (name, GSTIN, address, city) like the seller.
- **Draft edits and credit notes:** drafts can change deal, due date, tax type and lines (not company or issue
  date — the number belongs to that year). Seller/buyer details are re-captured when an invoice is marked sent.
  Sent invoices are corrected by credit notes: own series `TOS/CN/<FY>/<NNN>`, taxable amount + GST at the
  invoice's rate, capped at what's left to credit, recorded on the invoice (`credits`) so its balance drops;
  printable at `/credit-notes/:id/print`. Fully credited, unpaid invoices show "Credited".
- **In-app integration setup** (Settings → Integrations → Set up on each service, admins; `/settings/setup`
  redirects there): Google Workspace, Instagram, WhatsApp Cloud API and Razorpay steps as a
  shared checklist (`setup/progress`), copy boxes for scopes and the redirect URI (built from the site's own
  origin), and fields to paste the Google client and Meta app keys (`setup/keys`). Secrets are write-only: the API
  returns only whether one is saved. The app never shows hosting, billing or cost details — those stay in the
  Google console and docs/OPERATIONS.md.

## Instagram DMs (client's own Meta app)

- **Instagram API with Instagram Login**, Standard Access (own account only → no App Review). The client pastes the
  Instagram App ID/secret (sign-in) and the Meta App secret (Integrations → Instagram → Set up); the CRM shows the
  OAuth redirect URI, webhook URL, its generated verify token, and the privacy/deletion URLs to paste into Meta.
- **Connect:** `POST /integrations/instagram/start` → Instagram → `GET …/callback` with a one-time `state`
  (10 min) → long-lived token (60 days, server-only, never returned) + `subscribed_apps?subscribed_fields=messages`.
  The `daily` scheduled function renews it once it's within 30 days of expiry.
- **Webhook:** `X-Hub-Signature-256` HMAC over the raw body, accepted if it matches either saved secret (Meta's docs
  are ambiguous about which signs). Each message stored once (`seenMessages/instagram:<mid>`). A first message
  opens a conversation (sender's name/username fetched best-effort) owned via `routeLead`; echoes (sent from
  Instagram itself) are kept as outgoing. Public routes: webhook, callback, `/public/privacy-info`.
- **Inbox (live):** real conversations, polled every 30 s; `POST /conversations/:id/reply` sends replies through
  Instagram's messaging API and stores the returned message in the thread. Meta enforces its messaging window.
  `/privacy` (with `#delete`) is public, filled from Workspace details.

## Gmail, Calendar and Drive (client's own Google project)

- **Scopes:** `gmail.readonly` + `calendar.readonly` for lead intake, plus `drive.file` for project folders. `drive.file`
  can manage only files the CRM creates; it cannot browse the rest of the account's Drive. The account's address
  comes from Gmail's profile, so no `openid/email` scope. `access_type=offline` + `prompt=consent` for a refresh
  token (server-only, never returned). Existing connections must reconnect once when the Drive scope is added.
- **Who connects:** any teammate connects their own account (Integrations → Gmail → Connect); whoever has the
  enquiry@ login connects that one. Admins can disconnect any account; others only theirs. Disconnect revokes at Google.
- **Sync:** the `everyMinute` scheduled function (lock in `setup/lock:google`) — polling, not Pub/Sub push, so the
  client's project needs no Pub/Sub topic. Gmail: `history.list` from the stored `historyId` (404 → restart from now);
  inbox mail from outside our domains, not automated (List-Unsubscribe, no-reply, Auto-Submitted), opens or joins a
  conversation (`channel: gmail`, `externalId` = sender email), routed by `routeLead`; our SENT mail joins existing
  conversations only. Deduped across mailboxes by the Message-ID header. Calendar: `events.list` with a sync token
  (first run only starts tracking; 410 → restart); a new meeting with an outside guest who isn't a contact opens a
  `calendar` conversation, with a known contact it becomes a "meeting" activity on their open deal. Appointment-
  schedule bookings can't be told apart reliably, so every new meeting with an outside guest counts.
- **Project folders:** confirming a deal creates its project and then a same-named Google Drive folder, preferring
  the project manager's connected account. Folder failure never blocks project creation; the project page shows a
  retry button for missing folders and for projects created before Drive was connected.
  The new folder is shared (writer, no email) with the studio's Workspace domain — Settings → Workspace → Google
  Workspace domain, else the connecting account's domain — so the whole team can open it; personal Gmail accounts
  are left private. A sharing failure keeps the folder and shows the reason on the project.

## Razorpay and WhatsApp Cloud API

- **Razorpay:** admins save the Key ID, write-only Key secret and write-only webhook secret in Integrations.
  Finance users can create one payment link for the current balance of a sent invoice. The signed
  `payment_link.paid` webhook appends the payment only when its Razorpay payment ID is not already on the invoice,
  so webhook retries are idempotent.
- **WhatsApp:** admins save the Phone number ID, permanent token, Meta app secret, approved reminder template name
  and language. Signed `messages` webhooks create or update routed Inbox conversations and are deduplicated by
  Meta message ID. Free-form Inbox replies go through the Cloud API during Meta's 24-hour window.
- **Payment reminders:** when WhatsApp is connected, Remind sends the approved Utility template with the client,
  studio, payment stage, balance and due date. Without a Cloud API connection, the UI keeps the `wa.me` fallback
  with the same message typed for a person to send manually.

## Two businesses (client requirements, Oct 2026)

- **Business** (`photography` | `marketing`) on deals, companies, contacts, tasks, invoices and conversations.
  One legal entity: GST invoices always come from The Oyster Studios in one series, tagged by business; an
  invoice takes its deal's business. The CRM stays branded The Oyster Studios ("Pinnacle" = the client's existing
  customer base, importable later).
- **View switch** (Both / Photography / Marketing, per device) in the top bar. `useCrm` reads through `scoped()`,
  a memoised filter over the store, so every screen respects it without its own code; writes go to the whole
  store. Records without a business show in every view (e.g. a new DM) so nothing is missed.
- **Inbox fix:** the "create a deal" fields now show for real conversations (they only appeared on samples).
- **Pipelines per business** (`pipelines/pipelines`, Settings → Pipelines & stages, admins): ordered stages
  `{id, label, kind: open|won|lost, probability}`, starting from the client's list (New lead → Contacted →
  Qualified → Proposal sent → Negotiation → Confirmed → Lost). Won/Lost ids stay `won`/`lost` (only renamed), so
  "is it open?" never needs the pipeline. The API checks a deal's stage against its business's list, records
  `wonAt` on reaching won, and refuses to drop a stage that still has deals. Probability now comes from the stage.
  The board shows one business; viewing Both, it gets Photography / Marketing tabs.
- **Leads:** New lead creates the client (company or couple), the contact (phone/email) and the deal with
  service, budget, location, event date (photography), requirements and `nextFollowUpAt`. New sources: phone,
  google, event, other. Home → Lead follow-ups (Overdue / Today / Upcoming 7 days, by IST day); logging a call,
  WhatsApp or email sets the next follow-up; Done on the deal clears it. Clearing optional fields: PATCH `null`.
- **Clients:** a client is the same company/couple record the lead created — no second record. When any of its
  deals reaches won, the API sets `clientSince` (once; later wins don't move it) and the screen says
  "<name> is now a client". Companies became **Clients** (`/clients`, `/companies` redirects) with Clients /
  Prospects / All. The client page (`/clients/:id`) joins details, contacts, money (confirmed, invoiced, received,
  pending, next due), services purchased, open leads, invoices, open tasks, team, file links (`links`: Drive
  folders etc., big files stay outside) and a single history (enquiry, first message, everything logged,
  payments, credit notes).
- **Projects** (`projects`, `/projects`, `/projects/:id`): when a deal reaches won, the API starts one project
  for it (unique sparse index on `dealId`, so confirming twice is a no-op) from the business's **template**
  (`templates/templates`, Settings → Project templates, admins; defaults in `DEFAULT_TEMPLATES`, standard
  wedding and retainer checklists until the client sends theirs). `projectFromDeal`/`planProject` (shared, also
  used by the demo) date each task and deliverable from the event date or the confirmation day, never before the
  confirmation day; tasks are due 6 pm IST, assigned to the deal owner, who also becomes manager. A wedding is
  one project with its **functions** (`events`: name, date, venue; starts with "Wedding") — an assumption to
  confirm with the client. Projects hold crew (member + role), deliverables (status + link), retainer and
  content-calendar link (marketing), notes and links. Tasks gained `projectId`, `priority`, `startAt`, `status`
  (kept in step with `done` by the API), client `approval`, `links` and `comments` (`POST /tasks/:id/comments`).
  Tasks → "My work" is the person's own list. Permissions per role come in slice 5.
- **Update schemas** use `patchOf()` instead of zod's `.partial()`, which kept create-time defaults and so reset
  unmentioned fields (e.g. a task's reminder) on every PATCH.
- **Five roles** (slice 5; `ACCESS` in shared, used by API and UI). Three areas — sales (leads, Inbox, clients,
  contacts, activity), projects (with tasks), finance (invoices, credit notes, payments) — each edit / own /
  view / none:

  | Role | Sales | Projects | Finance |
  |---|---|---|---|
  | Owner / Admin | edit | edit | edit |
  | Sales | own | view | view |
  | Project manager | view | edit | none |
  | Finance | view | view | edit |
  | Team / Freelancer | none | own | none |

  Sales "own" is the old Member rule (change only records you own, never reassign; workspace switch, now
  "Sales see everyone's leads", limits what they see). Crew "own": only projects they're on (manager, crew, or
  a task of theirs), those projects' clients and contacts, and tasks given to them or in those projects. Tasks:
  admins and PMs change any; everyone else only tasks given to them, and can't hand them on; comments need the
  task to be visible. Settings stay admin-only, except project templates (admins and PMs). Lists a role can't
  see return `[]` rather than 403, so the app loads the same way for everyone; changes return 403 with the
  reason. New people default to Team / Freelancer (least access). Old roles are renamed on the person's next
  request: Manager and Member both become Sales. In the UI the menu hides what a role can't open, crew land on
  Tasks, forms a role can't submit say so instead, and project pages are read-only outside one's own tasks.
- **Owner dashboard** (`/dashboard`, admins only; slice 6): this IST month's sales (new leads, confirmed
  value, open pipeline, overdue follow-ups, conversion = won ÷ closed), projects (active, weddings in the next
  30 days, overdue project tasks, tasks awaiting client approval, deliverables due within 7 days or late), money
  (invoiced incl. GST, received, outstanding, overdue) and a per-person team table. Follows the top bar's
  business switch; on Both it adds Photography vs Marketing side by side. The numbers come from
  `ownerSummary()` in shared (pure, tested); computed in the browser from data already loaded.

## Phase 2: finance (Oct 2026, sensible defaults until the client sends theirs)

- **Packages & payments** (`financeSettings/finance`, Settings → Packages & payments; owners and Finance edit):
  price list per business (packages, add-ons, monthly retainers; before GST), a payment plan per business
  (stages as % of the total, due N days from the booking or the event; must add up to 100%) and standard terms.
  Defaults: weddings 30% booking / 50% a week before / 20% 45 days after; marketing 100% in advance.
  SAC 998383 (photography & videography) and 998361 (advertising) — to confirm with the CA.
- **Quotations** (`quotes`, `/quotes`, `/quotes/:id`, printable `/quotes/:id/print`): Sales' documents with the
  deals' rules (own records; scope with the "Sales see everyone's leads" switch). Numbered `TOS/Q/<FY>/<NNN>`
  (own counter, no transaction — gaps don't matter for quotations). Lines from packages or custom, GST type
  from the two GSTINs, terms, and a payment plan recalculated from the standard one when the items change.
  **Accepting** a quotation (status → accepted, then locked) sets the deal's value to the quoted amount before
  GST, copies the plan as the deal's payment schedule (unless stages are already invoiced) and confirms the deal
  — which makes the client and starts the project, the same `onConfirmed()` as moving it to Confirmed.
- **Payment schedules** (`deal.schedule`, `PUT /deals/:id/schedule`: Sales on their deals or Finance): stages
  before GST. `POST /deals/:id/schedule/:item/invoice` (Finance/owners) raises a draft invoice for a stage
  (line "<stage> — <service>", the business's SAC, IGST when the client's GSTIN is another state's, due on the
  stage date or today) and links it; invoiced stages can't be changed or removed. A stage reads planned / due
  (within 7 days) / overdue / invoiced / part paid / paid.
- **Reminders:** "Payments due" (owner dashboard, Invoices) lists stages overdue or due within a week, with
  Invoice and WhatsApp Remind actions. Connected accounts send the approved Cloud API template; unconnected
  accounts use `wa.me` with the message typed for the person to send.
- **Expenses** (`expenses`, `/expenses`; owners and Finance only — others get an empty list): date, business,
  category, what, vendor, amount before GST, GST paid, optional project and receipt link.
- **Profit & loss** (`/profit`; owners and Finance): accrual basis, before GST — sent invoices' taxable value
  less credit notes, minus expenses — by month, this financial year, by expense category and by project.
  `profitAndLoss()` and `scheduleFrom()` live in shared and are tested.
- **Exports:** Excel = CSV with a UTF-8 byte-order mark (opens cleanly in Excel, no library); PDF = the
  browser's print → Save as PDF (quotations, invoices, credit notes, P&L; the app shell hides when printing).

## Releases and open tabs (20 Oct 2026)

- **Symptom:** after a publish, Inbox, Tasks, Expenses or Settings "broke" for people with the CRM already open (or
  opened from a cached page): each screen is its own file, the old file names were gone, and Hosting answered the
  missing file with the app page — so the screen couldn't load.
- **Fix:** Hosting returns 404 for a missing `/assets/**` file instead of the app page; page addresses
  (`/inbox`, `/expenses`, …) are `no-cache` so a visit always picks up the current release (build files stay
  cached for a year — their names change every build). In the app, a failed screen load from an old release
  reloads once (`vite:preloadError` + the router's error screen, `lib/stale.ts`; a 30-second guard stops loops);
  any other failure shows "This page didn't load" with a Reload button instead of a blank screen.

## Phase 4: client portal (20 Oct 2026)

- **Access:** one private link per project (`/portal/<token>`, `portalLinks`), no client account — shared on
  WhatsApp like a gallery link. 48-character random token; admins and project managers create, replace (old link
  stops) or turn it off from the project page. Email sign-in for clients can replace this later (it needs outbound
  email). The portal is its own small app outside the sign-in gate (`routes/portal`), mobile-first.
- **What the client sees** (`portalView()` builds an allow-list, never the raw records): project name, business,
  status, dates, functions, overall progress (done/total, no task list), items the studio marked for client
  approval (with only the client's own notes), deliverables with links, the content-calendar link, the payment
  schedule (paid / invoiced / due / upcoming) and sent invoices — viewable and printable like the tax invoice,
  with a Pay button when a Razorpay link is open. Never internal tasks, notes, crew, owners, costs, profit, staff
  comments or internal file links (the Drive folder is for the team).
- **Approvals:** Approve, or Request changes with a note (required), signed with a name the device remembers.
  The task's approval updates, the decision is added as a client comment (shown as "<name> (client)") and the
  task's assignee and the project manager are notified (`approval`, a new switchable notification kind).
  Only the link's own project's approval items can be decided; approved items are final.

## Phase 5 (first part, 20 Oct 2026)

- **In-app help** for Razorpay and WhatsApp now matches the client guide: number choice (a new number recommended;
  the Business app and this Cloud API setup can't share one), same Meta app as Instagram (one Meta App secret
  signs both), system-user permanent token, WhatsApp payment method, the reminder template with sample values and
  language `en`, Test → Live for Razorpay (webhooks are per mode), a ₹1 test then a credit note (the test takes a
  real GST serial). Each panel has an "If something doesn't work" list.
- **Installable app:** a web manifest (name, icons from the logo, standalone, shortcuts to Inbox/Tasks/Calendar)
  so phones can "Add to Home screen". Deliberately **no service worker**: it would cache old releases, the problem
  fixed above; Chrome and Safari install without one. Native app-store apps stay a separate decision.
- **Growth reports** (Reports, bottom; follow the business switch and the date range): per source — leads,
  confirmed, conversion (confirmed ÷ closed), confirmed value, invoiced, average booking, days to confirm; the
  season (12 months of enquiries, bookings and weddings per month); lost reasons; and for owners/Finance what ad
  spend ("Ad spend" expenses) buys, blended across sources. `packages/shared/src/analytics.ts`, tested.
- **GST sales register** (Profit & loss → "GST sales register for your CA"): sent invoices and credit notes for a
  month or the financial year, one row per SAC, GSTR-1 sections B2B / B2CS / CDNR / CDNUR, place of supply,
  IGST / CGST / SGST, credit notes negative; always the whole studio regardless of the business switch.
  `packages/shared/src/gstr1.ts`, tested. Not a direct GST-portal upload or Tally sync — those need the CA's
  choice of format.
- **Online signing of quotations** (Phase 5): staff share a signing link per quotation (`signLinks`, `/sign/<token>`,
  no client account; sharing marks a draft as sent). The client reads the service agreement (the same
  `AgreementDocument` the staff print page uses), types their full name, ticks consent and signs. The server
  records name, optional email/phone, time, IP (first `x-forwarded-for` hop), device and a SHA-256 fingerprint of
  the quotation's number, client, items, plan, terms and validity (`quoteFingerprint`); it refuses if the
  quotation changed since the page loaded, has expired, or is already accepted/declined/signed (one signature
  wins under concurrent submits). Signing = accepting: `applyAcceptedQuote` confirms the booking exactly as a
  teammate's "Client accepted" does (value, schedule, client, project, notification). The link is retired
  after signing; the signed agreement prints with an "Electronic acceptance record". Legally this is online
  acceptance of a contract (IT Act 2000 §10A) — not an Aadhaar eSign or DSC "electronic signature" (§3A), which
  needs a paid eSign provider and can be added later.
- **Tasks by client:** Tasks → Group by → Client: one section (or board column) per client with its open tasks
  in due order and open / overdue / done counts; clients with overdue work first, "Internal (no client)" last.
  A task's client now comes from the task, its project or its deal — checklist tasks were showing as Internal.
- **Requirements audit (20 Oct 2026):** the brief was rechecked section by section (`docs/REQUIREMENTS_AUDIT.md`)
  and its gaps built: quotations/agreements on the client page; services, payment schedule, campaign details and
  monthly retainer cycles (`POST /projects/:id/next-month`) on projects; task start date and attachments; meetings
  (stored with `meetingAt`), crew names and double-booking warnings on the calendar; next payment due and the
  team/other cost split; expense client link (filled from the project) and production/editing/office categories;
  P&L by client and by business; dashboard stage counts, lost this month (`lostAt`), open tasks, this month's
  expenses and profit, who is free today, workload CSV; outstanding-payments CSV; automatic follow-ups (new lead →
  tomorrow 11 am; proposal sent → 3 days out); portal documents (`links[].client`), agreements and client updates
  (`POST /projects/:id/updates`); a public website enquiry form (`/enquire`, `POST /public/enquiry`: honeypot,
  5 per IP per 10 minutes, routed into Inbox).
- **Amounts in exact rupees:** every money field takes rupees as people say them ("58,950", "1,18,000.50"), with
  "2.5L", "75k", "1.2cr" as shorthand (`parseRupees`); the field shows what it read. Lakh-only inputs are gone.
- **Client cards** (Clients → Cards, the default; Table still there): a card per client with their photo (or
  initials on the business colour), a countdown (days to the next function, retainer month, Delivered), the
  project's progress ring, the next milestone (red when late), money (overdue / due / paid up), approvals waiting
  and open tasks, and a "This week" ribbon. Sort/filter: upcoming first, payments due, waiting on client
  approval, delivered, A–Z. Clicking opens a side panel: the client's **journey** (`clientJourney` in shared,
  tested — enquiry, booking, payment stages done when paid, functions done once past, retainer months,
  deliverables done when delivered; date order; the first open one is "next") and their open tasks (tick from
  the panel), with WhatsApp / call / project / full page.
- **Client photos:** uploaded by anyone who may change the client or runs projects; the browser crops to
  800×400 and converts to WebP (~50 KB; JPEG on old Safari) before upload. Stored in the CRM's database
  (`photos`, ≤ 400 KB, type checked from the bytes) and served at `/api/public/photos/<48-char token>` with
  immutable caching — an unguessable link, like a cloud-storage download link; a new upload gets a new address,
  the old photo is deleted, and deleting the client deletes it. No separate storage service to set up.
  Instagram leads bring their profile picture (`profile_pic`, copied since Instagram's links expire), which
  becomes the card photo when the lead is converted. Mentioned in the privacy policy.
- **Who completed a task, and when:** the server records `doneAt` (its own clock) and `doneBy` (the signed-in
  person) whenever a task becomes done — ticked or moved to "Done" — and clears both when it's reopened; neither
  can be set on its own. Completing a client's task also adds "completed …" to their timeline. Shown as "Done by
  Riya · 20 Oct, 4:10 pm" on the Tasks page (Done section newest first; Client grouping has "Show completed"),
  the project checklist and the client card panel ("Recently completed").
- **Look and feel, client feedback (21 Oct 2026):** channel badges everywhere (Inbox, pipeline, contacts,
  sidebar channel list, Inbox filters) show the real logos — Instagram, Facebook, WhatsApp, Gmail, Calendar,
  website — from 64px copies in `packages/ui/src/assets/channels`; referral/phone/event keep a monogram. Client
  cards are larger (≥290px, 220px photo) with the name set on the photo over a soft fade, a staggered entrance,
  lift on hover, a slow zoom of the photo, photos fading in, and a self-drawing progress ring (all respect the
  device's reduced-motion setting); clients without a photo get a rich business-colour panel with large initials.
  The public enquiry form was redesigned: brand panel, business tiles, service chips, +91 phone, budget ranges,
  per-field errors and a proper thank-you screen.
- **Playbook in the app (21 Oct 2026).** Settings → Playbook, also the ? in the top bar and ⌘K: five rules, each
  role's daily routine (opens on the reader's own role), a wedding and a retainer from enquiry to final payment,
  the owner's first-week setup, and fixes for common slips. Written from what the CRM does today and printable.
  While writing it we found the lost reason could not be entered anywhere, so Reports always said "No reason
  given"; a lead marked Lost now has a Lost reason field on its page. Projects rows lead with a camera
  (photography) or megaphone (marketing) and the client's name in the business colour.
- **Bigger text, set per person (24 Oct 2026).** The studio couldn't read the 11–13px type. Every font size now
  multiplies a `--fs` variable (type tokens, and `fs-N` utilities that replaced the `text-[Npx]` classes). The
  staff app defaults to Large (×1.15); Standard (×1) and Extra large (×1.3) are under the Aa button by the
  user's name, saved on that device. The sidebar widens with it. Public pages (portal, signing, enquiry) and
  printing stay at the designed size.
- **Who covers each function.** Each function on a project now has duration, photographers and
  cinematographers (how many, and names as typed: "Aniketh & Arun"), and add-ons. Names are free text so
  freelancers outside the CRM fit; the number can run ahead of the names until the crew is fixed. The Calendar
  shows the line-up and warns when the same name is on two projects the same day. The client portal still
  doesn't show crew. The project-level Crew list still decides who on the team can open the project.
- **The studio's own function columns.** "+ Add column" beside "+ Add function" adds a column (e.g. "Makeup
  artist") to every function on every project of that business, like a column in their Excel sheet. Columns live
  on the project template (Settings → Project templates → Function columns: rename, reorder, remove, up to 12);
  each function keeps its values by column id, so renaming keeps the data and removing only hides it. Anyone who
  can change projects (owners, project managers) can add one.
- **Bolder look (approved 24 Oct 2026).** Page titles sit on a rose-to-teal band, and list pages lead with
  headline numbers (Pipeline, Projects, Tasks, Invoices, Clients, Quotations, Expenses, Contacts, Calendar)
  instead of the small grey line. Client photos (or initials on the business colour) now appear on pipeline cards,
  project cards and the project page, task groups by client, invoices and quotations. Projects default to cards
  with the client's photo; a list is one click away. The Settings menu has icons like the main menu.
- **Motion for page changes, numbers and ticking tasks.** Every screen change fades and rises in (Motion, keyed by
  screen; it replaced the browser View Transitions that only the sidebar and shortcuts used). Headline numbers count
  up from zero, money included. Ticking a task strikes it through on a green glow for a moment, then it slides
  out and lands in Done; the Tasks header counts "Done today". All of it follows the device's reduce-motion setting.
- **Inspired by 21st.dev (our own versions, built with Motion and our colours, no pasted code).** Client and
  project cards have a soft spotlight that follows the pointer (`spotlight` utility + `trackSpotlight`). The
  sidebar, the Settings menu and every switch have one highlight that glides to the chosen item (Motion
  `layoutId`, namespaced per menu so the phone drawer and each switch move on their own). New messages on Home and
  in the Inbox spring in from the top and carry a rose bar down their left edge that fades over about 3 seconds.

## Client update list, 29 Oct 2026 ("CRM, Required Updates & Improvements")
- **Project page.** The client's name is the bold title; the project name sits in the line above. Owners and
  project managers can delete a project (its checklist and portal link go with it; the lead, quotations and
  invoices stay). Weddings record the guest count and the day the couple chose their photos; from then the
  project and the client's portal show delivery in 3–5 weeks (`deliveryWindow`). Functions, Team and Other
  details (notes, links) fold to a one-line summary each, remembered per device. Checklist due dates are editable
  in the row, and changing the wedding date moves the open tasks and pending deliverables the template counts
  from the event by the same number of days. The first crew names on a function add a high-priority "Book &
  confirm crew · <function>" task a week before it.
- **Client portal** shows each function's duration, how many photographers and cinematographers (never names),
  add-ons, and the guest count.
- **Cash bills (no GST).** Invoices have a type: GST invoice (default, TOS/…) or cash bill (TOS/CB/…, its own
  series so GST invoice numbers stay consecutive). A cash bill charges no GST, carries no GSTINs, SAC or place of
  supply, prints as "CASH BILL" in its own layout, takes no credit notes, and is left out of the GST sales
  register. Chosen on the new-invoice form and on each payment stage (GST invoice / Cash bill); the type is fixed
  once created. Whether the studio may issue non-GST bills while GST-registered is for their CA to confirm.
- **Team & freelancers** (new page; owners, project managers, Finance). Freelancers have a profile: name, phone,
  skill, ID type and number (personal data: shown in full only to owners, everyone else sees the last four;
  crew can't see the list), notes. A project's Team takes team members or freelancers, a freelancer with the fee
  agreed for that project. Payments to a freelancer are "Freelancers & crew" expenses linked to them and the
  project, so their profile shows each project's fee, paid and pending, and the full payment history across
  projects. Salaries: a monthly amount per team member (own `salaries` collection, owners and Finance only);
  "Mark paid" for a month records a Salary expense for that member and month, so payroll counts in Profit & loss.
  Function crew names suggest freelancers and team members, and freelancers count in the calendar's double-booking
  check.
- **Lead statuses in the Inbox.** Each conversation is New, Contacted, Follow-up, Converted or Spam
  (`leadStatusOf`): what the team picks in the conversation header, otherwise Converted once it has a deal,
  Contacted once we've replied, else New. Status chips with counts filter the list ("To work on" = new, contacted
  and follow-up, the default; Spam is hidden from everything but its own chip). Rows show their status.
- **Tasks page.** A filter bar under the header: whose tasks (everyone, mine, or any one person), priority, group
  by due date / status / priority / client, and "Show completed" for every grouping. List rows have labelled
  columns and change in place: priority, status (Done ticks it), due date and who it's assigned to (managers;
  others can't reassign). The board groups the same way, so grouping by status gives a To do → In progress →
  In review → Done board.
