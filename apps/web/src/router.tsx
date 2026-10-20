import { Button } from "@pinnacle/ui";
import { Compass } from "lucide-react";
import { createBrowserRouter, createMemoryRouter, Link, Navigate, type RouteObject } from "react-router";
import { EmptyState } from "./components/empty-state";
import { AppShell } from "./shell/app-shell";
import { RouteError } from "./components/route-error";

/** Every screen is its own chunk, so charts and drag-and-drop load only where used. */
const routes: RouteObject[] = [
  // Printable invoice: full page, outside the app shell (no sidebar), still behind sign-in.
  { path: "/invoices/:id/print", errorElement: <RouteError />, lazy: async () => ({ Component: (await import("./routes/invoices/print")).InvoicePrintRoute }) },
  { path: "/quotes/:id/print", errorElement: <RouteError />, lazy: async () => ({ Component: (await import("./routes/invoices/print")).QuotePrintRoute }) },
  { path: "/quotes/:id/agreement", errorElement: <RouteError />, lazy: async () => ({ Component: (await import("./routes/invoices/print")).AgreementPrintRoute }) },
  { path: "/credit-notes/:id/print", errorElement: <RouteError />, lazy: async () => ({ Component: (await import("./routes/invoices/print")).CreditNotePrintRoute }) },
  {
    path: "/",
    element: <AppShell />,
    errorElement: <RouteError />,
    children: [
      { index: true, lazy: async () => ({ Component: (await import("./routes/home/index")).HomeRoute }) },
      { path: "inbox", lazy: async () => ({ Component: (await import("./routes/inbox/index")).InboxRoute }) },
      { path: "inbox/:id", lazy: async () => ({ Component: (await import("./routes/inbox/index")).InboxRoute }) },
      { path: "pipeline", lazy: async () => ({ Component: (await import("./routes/pipeline/index")).PipelineRoute }) },
      { path: "deals/:id", lazy: async () => ({ Component: (await import("./routes/deal/index")).DealRoute }) },
      { path: "tasks", lazy: async () => ({ Component: (await import("./routes/tasks/index")).TasksRoute }) },
      { path: "calendar", lazy: async () => ({ Component: (await import("./routes/calendar/index")).CalendarRoute }) },
      { path: "projects", lazy: async () => ({ Component: (await import("./routes/projects/index")).ProjectsRoute }) },
      { path: "projects/:id", lazy: async () => ({ Component: (await import("./routes/projects/index")).ProjectRoute }) },
      { path: "clients", lazy: async () => ({ Component: (await import("./routes/records/companies")).CompaniesRoute }) },
      { path: "clients/:id", lazy: async () => ({ Component: (await import("./routes/records/client")).ClientRoute }) },
      // Companies became Clients; old links still work.
      { path: "companies", element: <Navigate to="/clients" replace /> },
      { path: "contacts", lazy: async () => ({ Component: (await import("./routes/records/contacts")).ContactsRoute }) },
      { path: "quotes", lazy: async () => ({ Component: (await import("./routes/quotes/index")).QuotesRoute }) },
      { path: "quotes/:id", lazy: async () => ({ Component: (await import("./routes/quotes/index")).QuoteRoute }) },
      { path: "expenses", lazy: async () => ({ Component: (await import("./routes/money/expenses")).ExpensesRoute }) },
      { path: "profit", lazy: async () => ({ Component: (await import("./routes/money/profit")).ProfitRoute }) },
      { path: "invoices", lazy: async () => ({ Component: (await import("./routes/invoices/index")).InvoicesRoute }) },
      { path: "dashboard", lazy: async () => ({ Component: (await import("./routes/dashboard/index")).DashboardRoute }) },
      { path: "reports", lazy: async () => ({ Component: (await import("./routes/reports/index")).ReportsRoute }) },
      {
        path: "settings",
        lazy: async () => ({ Component: (await import("./routes/settings/layout")).SettingsLayout }),
        children: [
          { index: true, element: <Navigate to="team" replace /> },
          { path: "workspace", lazy: async () => ({ Component: (await import("./routes/settings/sections")).WorkspaceRoute }) },
          { path: "team", lazy: async () => ({ Component: (await import("./routes/settings/team")).TeamRoute }) },
          { path: "pipeline", lazy: async () => ({ Component: (await import("./routes/settings/sections")).PipelineSettingsRoute }) },
          // The setup guide now lives on each channel's card under Integrations.
          { path: "setup", element: <Navigate to="/settings/integrations" replace /> },
          { path: "packages", lazy: async () => ({ Component: (await import("./routes/settings/packages")).PackagesRoute }) },
          { path: "templates", lazy: async () => ({ Component: (await import("./routes/settings/templates")).TemplatesRoute }) },
          { path: "integrations", lazy: async () => ({ Component: (await import("./routes/settings/sections")).IntegrationsRoute }) },
          { path: "routing", lazy: async () => ({ Component: (await import("./routes/settings/sections")).RoutingRoute }) },
          { path: "notifications", lazy: async () => ({ Component: (await import("./routes/settings/sections")).NotificationsRoute }) },
          { path: "data", lazy: async () => ({ Component: (await import("./routes/settings/sections")).DataRoute }) },
        ],
      },
      { path: "styleguide", lazy: async () => ({ Component: (await import("./routes/styleguide")).StyleguideRoute }) },
      {
        path: "*",
        element: (
          <EmptyState
            icon={Compass}
            title="That page doesn't exist"
            body="The link may be old. Use ⌘K to jump anywhere."
            action={<Button asChild><Link to="/">Go home</Link></Button>}
          />
        ),
      },
    ],
  },
];

/** Preview builds (single HTML file) can't rely on server routing, so they keep routes in memory. */
export const router = import.meta.env.MODE === "preview" ? createMemoryRouter(routes) : createBrowserRouter(routes);
