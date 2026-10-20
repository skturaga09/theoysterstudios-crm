import { Button, cn, Input, toast } from "@pinnacle/ui";
import { Check, Copy } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { fmtAgo } from "@pinnacle/shared";
import { useCrm, useMe } from "../../data/store";
import type { IntegrationStatus } from "../../data/sync";
import { api } from "../../lib/api";
import { IS_DEMO } from "../../lib/demo";

/**
 * Setup panels opened from the Integrations page (admins): Google, Instagram, WhatsApp and Razorpay.
 * Hosting, billing and costs are managed outside the app.
 */

/** A value to type exactly, with a copy button. */
function Copyable({ value }: { value: string }) {
  return (
    <span className="mt-1.5 flex max-w-full items-center gap-2 rounded-control bg-sunken px-2.5 py-1.5">
      <code className="min-w-0 flex-1 overflow-x-auto font-mono text-[12px] whitespace-nowrap">{value}</code>
      <button
        type="button"
        aria-label={`Copy ${value}`}
        className="shrink-0 text-ink-3 hover:text-ink"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            toast("Copied");
          } catch {
            toast(value);
          }
        }}
      >
        <Copy size={13} strokeWidth={1.5} />
      </button>
    </span>
  );
}

type Step = { id: string; title: string; body?: ReactNode };

function Steps({ steps, done, toggle }: { steps: Step[]; done: Set<string>; toggle: (id: string) => void }) {
  return (
    <ol className="m-0 list-none border-t border-line p-0">
      {steps.map((s, i) => {
        const on = done.has(s.id);
        return (
          <li key={s.id} className="flex gap-3 border-b border-line py-3.5">
            <button
              type="button"
              role="checkbox"
              aria-checked={on}
              aria-label={`Step ${i + 1} done`}
              onClick={() => toggle(s.id)}
              className={cn("mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border", on ? "border-ok bg-ok text-white" : "border-line-2 text-transparent hover:border-ink-3")}
            >
              <Check size={12} strokeWidth={2.5} />
            </button>
            <div className={cn("t-dense min-w-0 flex-1", on && "text-ink-3")}>
              <p className="m-0"><span className="mr-1.5 font-mono text-[11px] text-ink-3">{i + 1}</span><span className="font-medium">{s.title}</span></p>
              {s.body && <div className="mt-1 text-ink-2">{s.body}</div>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

type Keys = {
  googleClientId: string;
  googleClientSecretSaved: boolean;
  instagramAppId: string;
  instagramAppSecretSaved: boolean;
  metaAppSecretSaved: boolean;
  /** Pasted into Meta so it can prove it's talking to this CRM; shown to admins. */
  webhookVerifyToken: string;
  razorpayKeyId: string;
  razorpayKeySecretSaved: boolean;
  razorpayWebhookSecretSaved: boolean;
  whatsappPhoneNumberId: string;
  whatsappTokenSaved: boolean;
  whatsappReminderTemplate: string;
  whatsappTemplateLanguage: string;
};

/** Paste the keys from Google or Meta. Secrets are write-only: once saved they're never shown again. */
type KeyField =
  | "googleClientId"
  | "googleClientSecret"
  | "instagramAppId"
  | "instagramAppSecret"
  | "metaAppSecret"
  | "razorpayKeyId"
  | "razorpayKeySecret"
  | "razorpayWebhookSecret"
  | "whatsappPhoneNumberId"
  | "whatsappToken"
  | "whatsappReminderTemplate"
  | "whatsappTemplateLanguage";

function KeysForm({ fields, keys, onSaved }: { fields: { key: KeyField; label: string; secret?: boolean; placeholder: string }[]; keys?: Keys; onSaved: (k: Keys) => void }) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="mt-4 flex flex-col gap-3 rounded-panel border border-line bg-surface p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!Object.values(values).some((v) => v.trim())) return setError("Paste at least one value.");
        setBusy(true);
        try {
          const saved = await api<Keys>("/setup/keys", { method: "PUT", body: values });
          onSaved(saved);
          setValues({});
          setError(undefined);
          toast("Saved");
        } catch (err) {
          const issues = (err as { body?: { issues?: { message: string }[] } }).body?.issues;
          setError(issues?.map((i) => i.message).join(" · ") ?? (err as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <p className="t-meta m-0 text-ink-3">Paste the values here instead of sending them to anyone. Secrets can't be viewed again once saved — only replaced.</p>
      {fields.map((f) => {
        const savedId = !f.secret ? (keys?.[f.key as keyof Keys] as string | undefined) : undefined;
        const savedSecret = f.secret && keys?.[`${f.key}Saved` as keyof Keys];
        return (
          <label key={f.key} className="flex flex-col gap-1.5">
            <span className="text-[12.5px] font-medium">
              {f.label}{" "}
              {(savedId || savedSecret) && <span className="font-normal text-ok">· saved{savedId ? `: ${savedId}` : ""}</span>}
            </span>
            <Input
              type={f.secret ? "password" : "text"}
              autoComplete="off"
              value={values[f.key] ?? ""}
              placeholder={savedSecret ? "Saved — paste a new one to replace it" : f.placeholder}
              onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
              className="font-mono"
            />
          </label>
        );
      })}
      {error && <p role="alert" className="t-meta m-0 text-risk">{error}</p>}
      <Button type="submit" variant="ink" className="self-end" disabled={busy || IS_DEMO}>{busy ? "Saving…" : "Save"}</Button>
    </form>
  );
}

/** Checklist progress and saved keys, shared by the Google and Meta panels on the Integrations page. */
export function useSetupState() {
  const [done, setDone] = useState<Set<string>>(new Set());
  const [keys, setKeys] = useState<Keys>();
  useEffect(() => {
    if (IS_DEMO) return;
    api<{ done: string[] }>("/setup/progress").then((p) => setDone(new Set(p.done)), () => {});
    api<Keys>("/setup/keys").then(setKeys, () => {});
  }, []);
  const toggle = (id: string) => {
    const next = new Set(done);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setDone(next);
    if (!IS_DEMO) api("/setup/progress", { method: "PUT", body: { done: [...next] } }).catch(() => { setDone(done); toast("Couldn't save that tick — try again"); });
  };
  return { done, toggle, keys, setKeys };
}
export type SetupState = ReturnType<typeof useSetupState>;

const googleSteps = (redirect: string): Step[] => {
  return [
    { id: "g-console", title: "Open Google Cloud as your Workspace super admin", body: <>Go to console.cloud.google.com, signed in with the theoysterstudios.com super admin account, and accept the terms if asked.</> },
    { id: "g-project", title: "Create a project inside your organisation", body: <>Name it <em>Oyster CRM Integrations</em> and choose <strong>theoysterstudios.com</strong> as the organisation — not "No organisation".</> },
    { id: "g-apis", title: "Turn on the Gmail, Calendar and Drive APIs", body: <>APIs &amp; Services → Library → enable <strong>Gmail API</strong>, <strong>Google Calendar API</strong> and <strong>Google Drive API</strong>.</> },
    { id: "g-branding", title: "Name the app", body: <>Google Auth Platform → Branding: app name <em>The Oyster Studios CRM</em>; support and developer contact = your own email. Save.</> },
    { id: "g-internal", title: "Keep it inside your company", body: <>Google Auth Platform → Audience → choose <strong>Internal</strong>. Only theoysterstudios.com accounts can connect, and Google's long review is skipped.</> },
    {
      id: "g-scopes",
      title: "Allow mail, calendar and CRM-created Drive folders",
      body: <>Google Auth Platform → Data access → Add or remove scopes → add exactly these three. The Drive scope can only manage files this CRM creates; it cannot browse the rest of Drive.<Copyable value="https://www.googleapis.com/auth/gmail.readonly" /><Copyable value="https://www.googleapis.com/auth/calendar.readonly" /><Copyable value="https://www.googleapis.com/auth/drive.file" /></>,
    },
    { id: "g-client", title: "Create the CRM's login client", body: <>Google Auth Platform → Clients → Create client → type <strong>Web application</strong>, name <em>CRM</em>. Under Authorised redirect URIs add exactly: <Copyable value={redirect} />Click Create. Google shows a Client ID and a Client secret — paste both below.</> },
    { id: "g-trust", title: "Let your team connect", body: <>admin.google.com → Security → Access and data control → API controls → Settings → tick <strong>Trust internal, domain-owned apps</strong>.</> },
  ];
};

const metaSteps = (site: string, verifyToken: string): Step[] => [
    { id: "m-business-account", title: "Check it's an Instagram Business account", body: <>In the Instagram app: Settings → Account type and tools → it should say <strong>Business</strong> (not Creator or Personal).</> },
    { id: "m-allow-messages", title: "Allow apps to read your messages", body: <>Instagram app → Settings → Messages and story replies → Message controls → Connected tools → turn on <strong>Allow access to messages</strong>.</> },
    { id: "m-assets", title: "Check your Page and Instagram are in your business portfolio", body: <>business.facebook.com → Settings → Accounts: both your Facebook Page and Instagram account should be listed under The Oyster Studios.</> },
    { id: "m-verify", title: "Verify the business (recommended)", body: <>Meta Business Suite → Settings → Security Center → Start verification. Use the legal name and address exactly as on your GST certificate, PAN, incorporation certificate, bank statement or utility bill (PDF or JPEG under 5 MB). Meta usually reviews within about 7 working days.</> },
    { id: "m-app", title: "Create the Meta app", body: <>developers.facebook.com, signed in as the business admin (register as a developer if asked) → My Apps → Create app → name <em>The Oyster Studios CRM</em>, use case <strong>Manage messaging &amp; content on Instagram</strong>, business portfolio <strong>The Oyster Studios</strong>. Because it serves only your own account, it needs no App Review. Keep its roles to your own team.</> },
    {
      id: "m-ig-login",
      title: "Set up Instagram sign-in",
      body: <>In the app: Instagram → API setup with Instagram login → <strong>Set up Instagram business login</strong> → Business login settings. Add this OAuth redirect URI: <Copyable value={`${site}/api/integrations/instagram/callback`} />On the same screen, copy the <strong>Instagram App ID</strong> and <strong>Instagram App secret</strong> and paste them below.</>,
    },
    {
      id: "m-basic",
      title: "Add the privacy pages and copy the app secret",
      body: <>App settings → Basic: Privacy Policy URL <Copyable value={`${site}/privacy`} />User data deletion → Data deletion instructions URL <Copyable value={`${site}/privacy#delete`} />Save, then copy the <strong>App secret</strong> on that page and paste it below as the Meta App secret.</>,
    },
    {
      id: "m-webhooks",
      title: "Send new messages to the CRM",
      body: verifyToken ? (
        <>Instagram → API setup with Instagram login → <strong>Configure webhooks</strong>. Callback URL: <Copyable value={`${site}/api/integrations/instagram/webhook`} />Verify token: <Copyable value={verifyToken} />Click Verify and save, then turn on the <strong>messages</strong> field.</>
      ) : (
        <>Save the keys below first; the values for this step appear here once they're saved.</>
      ),
    },
    { id: "m-live", title: "Switch the app to Live", body: <>At the top of the app dashboard, switch App mode from Development to <strong>Live</strong>. Meta only sends messages to Live apps.</> },
];

const whatsappSteps = (site: string, verifyToken: string): Step[] => [
  { id: "w-product", title: "Add WhatsApp to your Meta app", body: <>developers.facebook.com → your CRM app → Add products → <strong>WhatsApp</strong> → Set up. Choose the studio's Meta Business portfolio.</> },
  { id: "w-number", title: "Add and verify the studio's phone number", body: <>WhatsApp → API Setup → Add phone number. Complete Meta's display-name review and copy the <strong>Phone number ID</strong> shown on that page.</> },
  { id: "w-token", title: "Create a permanent access token", body: <>Business settings → Users → System users → create an Admin system user, add the CRM app and WhatsApp account, then generate a token with <strong>whatsapp_business_messaging</strong> and <strong>whatsapp_business_management</strong>. Paste it below.</> },
  {
    id: "w-webhook",
    title: "Send incoming messages to the CRM",
    body: verifyToken ? <>WhatsApp → Configuration → Webhook. Callback URL:<Copyable value={`${site}/api/integrations/whatsapp/webhook`} />Verify token:<Copyable value={verifyToken} />Verify and save, then subscribe to the <strong>messages</strong> field.</> : <>Open this step again after the keys below have loaded.</>,
  },
  {
    id: "w-template",
    title: "Submit the payment reminder template",
    body: <>WhatsApp Manager → Message templates → Create template. Category: <strong>Utility</strong>; name: <strong>payment_reminder</strong>; language: English. Body:<Copyable value="Hello {{1}}, this is a reminder from {{2}}: {{3}} of {{4}} is due by {{5}}." />Submit it to Meta, then paste the approved template name and language below.</>,
  },
];

const razorpaySteps = (site: string): Step[] => [
  { id: "r-account", title: "Open the studio's Razorpay account", body: <>Sign in at dashboard.razorpay.com and finish account activation before using Live keys.</> },
  { id: "r-keys", title: "Create API keys", body: <>Account &amp; Settings → API Keys → Generate Key. Copy the Key ID and Key secret and paste them below. Start with Test mode if you want to make a trial payment.</> },
  { id: "r-webhook", title: "Create the payment webhook", body: <>Account &amp; Settings → Webhooks → Add New Webhook. URL:<Copyable value={`${site}/api/integrations/razorpay/webhook`} />Create a strong webhook secret and paste the same value below. Subscribe to <strong>payment_link.paid</strong>.</> },
  { id: "r-test", title: "Make one test payment", body: <>From a sent test invoice, create a Payment link and complete it with Razorpay's test payment details. Confirm the invoice changes to Paid only once.</> },
];

export const setupProgress = (state: SetupState, kind: "google" | "meta" | "whatsapp" | "razorpay") => {
  const steps = kind === "google" ? googleSteps("") : kind === "meta" ? metaSteps("", "") : kind === "whatsapp" ? whatsappSteps("", "") : razorpaySteps("");
  return { done: steps.filter((s) => state.done.has(s.id)).length, total: steps.length };
};

/** Connected Google accounts, and the button that connects one. Used inside the Gmail and Calendar cards. */
export function GoogleAccounts({ status, onChanged }: { status?: IntegrationStatus; onChanged: () => void }) {
  const me = useMe();
  const members = useCrm((s) => s.members);
  const [busy, setBusy] = useState(false);
  const accounts = status?.google.accounts ?? [];
  const ready = !!status?.google.ready;
  const ago = (iso?: string) => (iso ? fmtAgo(iso) : "not yet");
  return (
    <div className="mt-4 rounded-panel border border-line p-4">
      <h4 className="t-eyebrow m-0 mb-2 text-ink-3">Connected Google accounts</h4>
      {accounts.length ? (
        <ul className="m-0 mb-3 list-none p-0">
          {accounts.map((a) => (
            <li key={a.email} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line py-2 last:border-0">
              <span className="t-dense min-w-0 flex-1 font-mono text-[12.5px]">{a.email}</span>
              <span className="t-meta text-ink-3">
                {a.error ? <span className="text-risk">{a.error}</span> : `checked ${ago(a.lastSyncAt)}`} · by {members.find((m) => m.id === a.connectedBy)?.name ?? (a.connectedBy === "support" ? "Support" : "a teammate")}
              </span>
              {(me.role === "admin" || a.connectedBy === me.id) && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    try {
                      await api(`/integrations/google/${encodeURIComponent(a.email)}`, { method: "DELETE" });
                      toast(`Disconnected ${a.email}`);
                      onChanged();
                    } catch (e) {
                      toast(`Couldn't disconnect — ${(e as Error).message}`);
                    }
                  }}
                >
                  Disconnect
                </Button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="t-dense m-0 mb-3 text-ink-3">None yet. Each person connects their own account; whoever has the enquiry@ login connects that one too.</p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="ink"
          size="sm"
          disabled={!ready || busy || IS_DEMO}
          title={ready ? undefined : "An admin needs to finish the Google setup steps first"}
          onClick={async () => {
            setBusy(true);
            try {
              const { url } = await api<{ url: string }>("/integrations/google/start", { method: "POST", body: { origin: window.location.origin } });
              window.location.href = url;
            } catch (e) {
              toast(`Couldn't start — ${(e as Error).message}`);
              setBusy(false);
            }
          }}
        >
          {busy ? "Opening Google…" : accounts.length ? "Connect another account" : "Connect a Google account"}
        </Button>
        {me.role === "admin" && accounts.length > 0 && (
          <Button
            size="sm"
            variant="ghost"
            onClick={async () => {
              try {
                const r = await api<{ stored: number }>("/integrations/google/sync", { method: "POST" });
                toast(r.stored ? `${r.stored} new ${r.stored === 1 ? "item" : "items"} — see Inbox` : "Nothing new");
                onChanged();
              } catch (e) {
                toast(`Couldn't check — ${(e as Error).message}`);
              }
            }}
          >
            Check now
          </Button>
        )}
        {!ready && <span className="t-meta text-ink-3">Available once the setup steps above are done and the keys saved.</span>}
      </div>
      <p className="t-meta m-0 mt-3 text-ink-3">Checked every minute. New emails from outside the company and new meetings with people you don't know yet become leads in Inbox; newsletters and automated mail are skipped. After enabling Drive, reconnect existing accounts once to grant the new folder permission.</p>
    </div>
  );
}

/** Google Workspace steps + key fields: one setup connects both Gmail and Calendar. */
export function GoogleSetup({ state, status, onChanged }: { state: SetupState; status?: IntegrationStatus; onChanged: () => void }) {
  const redirect = `${window.location.origin}/api/integrations/google/callback`;
  return (
    <div className="mt-4">
      <p className="t-meta m-0 mb-3 text-ink-3">For your Google Workspace super admin · about 20 minutes · one setup connects both Gmail and Calendar. Tick each step as you finish it — progress is saved for everyone.</p>
      <Steps steps={googleSteps(redirect)} done={state.done} toggle={state.toggle} />
      <p className="t-meta m-0 mt-3 text-ink-2">
        <strong className="font-medium">About enquiry@:</strong> if it's its own mailbox (it has a password), it can be connected like any inbox. If it's a Google Group that forwards to people, connect the inbox of whoever receives those emails instead.
      </p>
      <KeysForm
        keys={state.keys}
        onSaved={state.setKeys}
        fields={[
          { key: "googleClientId", label: "Client ID", placeholder: "…apps.googleusercontent.com" },
          { key: "googleClientSecret", label: "Client secret", secret: true, placeholder: "Paste the client secret" },
        ]}
      />
      <GoogleAccounts status={status} onChanged={onChanged} />
    </div>
  );
}

/** Meta steps, key fields and the Connect button for Instagram DMs. */
export function MetaSetup({ state, connected }: { state: SetupState; connected: boolean }) {
  const site = window.location.origin;
  const [busy, setBusy] = useState(false);
  const ready = !!state.keys?.instagramAppId && !!state.keys.instagramAppSecretSaved && !!state.keys.metaAppSecretSaved;
  return (
    <div className="mt-4">
      <p className="t-meta m-0 mb-3 text-ink-3">For your Meta Business portfolio admin · about 30 minutes. Tick each step as you finish it — progress is saved for everyone.</p>
      <Steps steps={metaSteps(site, state.keys?.webhookVerifyToken ?? "")} done={state.done} toggle={state.toggle} />
      <KeysForm
        keys={state.keys}
        onSaved={state.setKeys}
        fields={[
          { key: "instagramAppId", label: "Instagram App ID", placeholder: "From Business login settings" },
          { key: "instagramAppSecret", label: "Instagram App secret", secret: true, placeholder: "From Business login settings" },
          { key: "metaAppSecret", label: "Meta App secret", secret: true, placeholder: "From App settings → Basic" },
        ]}
      />
      <div className="mt-4 flex flex-wrap items-center gap-3 rounded-panel border border-line p-4">
        <p className="t-dense m-0 min-w-0 flex-1 text-ink-2">
          {connected ? "Instagram is connected. Reconnect if you change the app's keys or Meta asks you to sign in again." : ready ? "All set — sign in as your Instagram Business account to connect it." : "Save all three keys above, then connect."}
        </p>
        <Button
          variant="ink"
          disabled={!ready || busy || IS_DEMO}
          onClick={async () => {
            setBusy(true);
            try {
              const { url } = await api<{ url: string }>("/integrations/instagram/start", { method: "POST", body: { origin: site } });
              window.location.href = url;
            } catch (e) {
              toast(`Couldn't start — ${(e as Error).message}`);
              setBusy(false);
            }
          }}
        >
          {busy ? "Opening Instagram…" : connected ? "Reconnect Instagram" : "Connect Instagram"}
        </Button>
      </div>
    </div>
  );
}

/** WhatsApp Cloud API keys, webhook and approved reminder template. */
export function WhatsAppSetup({ state, connected }: { state: SetupState; connected: boolean }) {
  const site = window.location.origin;
  return (
    <div className="mt-4">
      <p className="t-meta m-0 mb-3 text-ink-3">For your Meta Business admin · about 25 minutes. Incoming messages and Inbox replies use the Cloud API; payment reminders use the approved template below.</p>
      <Steps steps={whatsappSteps(site, state.keys?.webhookVerifyToken ?? "")} done={state.done} toggle={state.toggle} />
      <KeysForm
        keys={state.keys}
        onSaved={state.setKeys}
        fields={[
          { key: "whatsappPhoneNumberId", label: "Phone number ID", placeholder: "From WhatsApp → API Setup" },
          { key: "whatsappToken", label: "Permanent access token", secret: true, placeholder: "Starts with EA…" },
          { key: "metaAppSecret", label: "Meta App secret (webhook signatures)", secret: true, placeholder: "From App settings → Basic" },
          { key: "whatsappReminderTemplate", label: "Approved reminder template", placeholder: "payment_reminder" },
          { key: "whatsappTemplateLanguage", label: "Template language", placeholder: "en or en_US" },
        ]}
      />
      <p className={cn("t-dense m-0 mt-4 rounded-panel border px-4 py-3", connected ? "border-ok/30 bg-ok-wash text-ok" : "border-line bg-surface text-ink-2")}>
        {connected ? "WhatsApp Cloud API is connected. New messages will arrive in Inbox and replies can be sent during the 24-hour window." : "Save the Phone number ID, permanent token and Meta App secret to connect WhatsApp."}
      </p>
    </div>
  );
}

/** Razorpay keys and paid-link webhook setup. */
export function RazorpaySetup({ state, ready, webhook }: { state: SetupState; ready: boolean; webhook: boolean }) {
  const site = window.location.origin;
  return (
    <div className="mt-4">
      <p className="t-meta m-0 mb-3 text-ink-3">For the studio's Razorpay owner · about 10 minutes. The CRM creates links only for sent invoices and records signed webhook payments once.</p>
      <Steps steps={razorpaySteps(site)} done={state.done} toggle={state.toggle} />
      <KeysForm
        keys={state.keys}
        onSaved={state.setKeys}
        fields={[
          { key: "razorpayKeyId", label: "Key ID", placeholder: "rzp_live_… or rzp_test_…" },
          { key: "razorpayKeySecret", label: "Key secret", secret: true, placeholder: "Paste the key secret" },
          { key: "razorpayWebhookSecret", label: "Webhook secret", secret: true, placeholder: "The secret entered in Razorpay" },
        ]}
      />
      <p className={cn("t-dense m-0 mt-4 rounded-panel border px-4 py-3", ready && webhook ? "border-ok/30 bg-ok-wash text-ok" : "border-line bg-surface text-ink-2")}>
        {ready && webhook ? "Razorpay is ready for payment links and signed payment webhooks." : ready ? "API keys are saved. Add the webhook secret to finish setup." : "Save the Key ID, Key secret and webhook secret to connect Razorpay."}
      </p>
    </div>
  );
}
