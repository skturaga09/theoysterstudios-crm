# Decisions log

Running list of choices that interpret or deviate from `PINNACLE_CRM_BUILD_PROMPT.md`.
Open items are marked **(open)**.

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
  (Admin, Manager, Member), change role, remove access. Shows status (Invited / Active) and last sign-in.
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
- **Deploy:** `firebase deploy --only functions:api,hosting` (builds both first).
- **Workspace settings** are one document (`workspace/studio`): studio name, legal name, GSTIN, address, plus
  "Connections" the integrations will read (Google Workspace domain, enquiry inbox, Instagram handle, WhatsApp
  number). Admins edit them in Settings → Workspace; validated by `WorkspaceSchema` (GSTIN format + known state
  code). Invoices can't be created until legal name and GSTIN are set, and each invoice keeps a `seller` copy.
