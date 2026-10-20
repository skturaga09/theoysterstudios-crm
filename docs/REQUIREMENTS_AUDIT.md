# CRM requirements audit

Checked line by line against the client's brief "CRM – Wedding Photography + Marketing Agency" (26 sections),
on 20 October 2026, in the code, not from memory. Gaps found in this audit were built the same day; what is left
needs a decision or an account from the studio (last section).

| § | Requirement | Where it is in the CRM | Status |
|---|---|---|---|
| 1–2 | One system, end to end; answer the owner's questions any time | Owner dashboard, Reports, Profit & loss, client and project pages | Done |
| 3 | Two businesses, separate or combined; choose the business for clients, leads, projects, activity, income, expenses | Top-bar switch (Photography / Marketing / Both) on every screen; business on leads, clients, contacts, projects, tasks, invoices, quotations, expenses | Done (team members aren't tied to one business; their work is) |
| 4 | Leads from website, Instagram, Facebook, WhatsApp, phone, Google, referrals, events, other; all listed fields; customizable stages | New lead form (name, phone, email, couple/company, business, source, service, budget in exact ₹, location, event date, requirements, owner, stage, follow-up, notes); Settings → Pipelines & stages per business | Done |
| 5 | Follow-ups: schedule, notes, calls, WhatsApp/email, next date, history, pending; today / overdue / upcoming | Deal page (log call/WhatsApp/email, next follow-up, timeline); Home → Lead follow-ups | Done |
| 6 | Quotation, package, proposal, invoice, agreement; flexible packages and monthly retainers | Settings → Packages & payments; Quotations; GST invoices; service agreement + online signing | Done (invoices are raised by Finance/Owner — see decisions) |
| 7 | Lead becomes client automatically; client profile = single source of truth | Confirming creates the client; client page: details, contacts, services, projects, **quotations & agreements**, invoices, payments, pending, tasks, team, full history, files, notes | Done (quotations & agreements added in this audit) |
| 8 | Project created on confirmation; photography and marketing project contents | Auto project from template; functions + venues, crew roles, deliverables, deadlines, tasks, **services booked**, **payment schedule**; marketing: retainer, Notion calendar link, **campaign details**, account manager and team, **monthly cycles** | Done (services, schedule, campaign, monthly cycles added in this audit) |
| 9 | Task name, assignee, priority, **start date**, due date, status, comments, **attachments**, approval; team updates own tasks | Project checklist; Tasks page (by due date **or by client**) | Done (start date, attachments, grouping by client added) |
| 10 | Role-based access: Owner, Sales, Project Manager, Finance, Employee/Freelancer | Five roles enforced by the API and mirrored in the UI | Done |
| 11 | Central calendar: weddings, pre-wedding shoots, **client meetings**, follow-ups, deadlines, **team assignments**, campaign deadlines, payment dues; clashes across weddings | Calendar page + private Google Calendar feed per person; crew names on each function and **double-booking warnings** | Done (meetings, crew, clashes added in this audit) |
| 12 | Per project: value, received, pending, **next payment due**, expenses, **team/freelancer cost**, other costs, estimated and actual profit | Project page → Finance | Done (next payment due and the cost split added) |
| 13 | Invoices and payment schedules; paid / partly paid / pending / overdue; reminders | Payment schedule on each booking, invoice per stage, Payments due, WhatsApp reminders, Razorpay links | Done |
| 14 | Expenses with categories, linked to business, project, **client**, category | Expenses page (13 categories incl. salaries, freelancers, production, editing, office) | Done (client link and categories added) |
| 15 | Project-wise profit, **client-wise revenue**, monthly revenue/expenses/profit, **photography vs marketing vs combined**, outstanding | Profit & loss page; owner dashboard | Done (by client and by business added) |
| 16 | Central place for files; large media stays in Drive | Client and project links; Drive folder per project, shared with the studio's Workspace domain | Done |
| 17 | Client portal: project, events, deliverables, payments, invoices, **documents**, approvals, **updates**, content calendar, progress | Private link per project; approve / request changes; signed agreements, shared documents and client updates | Done (documents and updates added). A login for clients (rather than a private link) needs outbound email |
| 18 | Notifications: new lead, new task, follow-up due, overdue task, payments due/overdue, deadlines, approvals, assignments, upcoming wedding, project updates | Bell with desktop alerts, per-person switches, late-reply alert, morning summary | Done in the CRM; email notifications need a decision |
| 19 | Owner dashboard: sales (incl. **qualified, proposals sent, lost**), projects (incl. **pending tasks**), finance (incl. **expenses, profit**), team (**available people**, workload); Photography / Marketing / Both filter | Owner dashboard | Done (missing measures added in this audit) |
| 20 | Reports: lead source, sales, conversion, revenue, expense, profit, **outstanding payments**, **employee workload**, project performance, monthly; Excel/PDF | Reports, Profit & loss, Expenses, Invoices, dashboard; CSV (opens in Excel) and print-to-PDF | Done (outstanding and workload exports added) |
| 21 | Automations: lead → owner → **follow-up** → proposal → **follow-up reminder**; conversion → client → project → tasks → schedule; payment reminders; project checklist, team, deadlines; room for more | Lead routing; every new lead gets a follow-up (tomorrow 11 am); sending a proposal sets one 3 days out; confirmation chain; morning summary; templates; retainer months | Done (the two follow-up automations added) |
| 22 | Desktop, laptop, tablet, mobile; team updates tasks from phones | Responsive app, installable on phones (Add to Home screen) | Done; app-store apps are a later decision |
| 23–24 | Everything connected; client history from first enquiry to final payment; project-level view | Client page timeline; project page (client, date, services, team, tasks, deliverables, payments, expenses, profit, communication) | Done |
| 25 | Integrations: WhatsApp, Gmail, Google Calendar, Google Drive, payment gateway, accounting, Meta/Instagram lead forms, **website forms**, other platforms | WhatsApp Cloud API, Gmail, Calendar, Drive, Razorpay, Instagram DMs, **website enquiry form (`/enquire`)**; GST sales register for the CA | Done except accounting sync, Facebook Lead Ads and other platforms (decisions) |
| 26 | Phases 1–4 incl. client portal, advanced analytics, advanced automation, mobile app, AI | Phases 1–4 delivered; growth reports; installable app | AI and native apps await decisions |

Also requested by the studio during the build: amounts are typed as exact rupees everywhere (for example 58,950;
"2.5L" and "75k" also work), and the Tasks page groups by client.

## Waiting on the studio

- **Who raises invoices:** §6 says Sales create invoices; §10 lists invoices under Finance. Today Owner and Finance
  raise them and Sales see them. Allowing Sales to create *draft* invoices is a small change if wanted.
- **Facebook / Meta Lead Ads:** needs the Meta app to get the lead-retrieval permission through Meta's App Review.
- **Accounting software sync:** which software the CA uses (Tally, Zoho Books, QuickBooks). The GST sales register
  export covers filing until then.
- **Email notifications and client logins:** need outbound email (a wider Google permission or a mail service).
- **AI features** (draft replies, lead summaries, quote suggestions): need an AI provider account.
- **Aadhaar eSign / DSC:** online acceptance with an audit trail is live; certificate signatures need a paid provider.
- **Native mobile apps:** the installable web app covers phones today.
- **Their own content:** package prices, payment split, checklists, terms, SAC codes (confirm with the CA), and the
  Razorpay / WhatsApp / Google credentials in Settings → Integrations.
