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
  {
    id: "w-choose-number",
    title: "Choose the phone number",
    body: <>In this setup a number can't be on the WhatsApp Business app and the CRM at the same time. Recommended: a <strong>new number for the CRM</strong> (the current number keeps working in the app). Or move the current number: delete its WhatsApp account in the Business app first — old chats stay only on that phone. The number must receive one SMS or call for a code (landlines: choose the call).</>,
  },
  { id: "w-product", title: "Add WhatsApp to the same Meta app as Instagram", body: <>developers.facebook.com → My Apps → <em>The Oyster Studios CRM</em> → Add products → <strong>WhatsApp</strong> → Set up → business portfolio <strong>The Oyster Studios</strong>. Use this same app: the CRM checks Instagram and WhatsApp messages with one Meta App secret.</> },
  { id: "w-number", title: "Add and verify the number", body: <>WhatsApp → API Setup → Add phone number: display name (the studio's name as clients see it; Meta reviews it), category, number, then the code. If asked for a 6-digit two-step PIN, set one and keep it in the studio's password manager. Copy the <strong>Phone number ID</strong> under the number (a long number, not the phone number) and paste it below.</> },
  { id: "w-billing", title: "Add a payment method for WhatsApp", body: <>WhatsApp Manager → Payment settings. Meta charges a small amount per payment-reminder message (replies within 24 hours of a client's message are free); without a card, reminders fail.</> },
  { id: "w-token", title: "Create a permanent access token", body: <>business.facebook.com → Settings → Users → System users → Add: name <em>CRM</em>, role <strong>Admin</strong>. Assign assets: the app <em>The Oyster Studios CRM</em> and the studio's WhatsApp account, both full control. Generate new token → that app → expiry <strong>Never</strong> → tick <strong>whatsapp_business_messaging</strong> and <strong>whatsapp_business_management</strong>. Copy it (starts EA — shown once) and paste it below. Don't use the temporary token on API Setup; it stops after 24 hours.</> },
  {
    id: "w-webhook",
    title: "Send incoming messages to the CRM",
    body: verifyToken ? <>In the Meta app: WhatsApp → Configuration → Webhook → Edit. Callback URL:<Copyable value={`${site}/api/integrations/whatsapp/webhook`} />Verify token:<Copyable value={verifyToken} />Verify and save, then Webhook fields → Manage → subscribe to <strong>messages</strong>. The app must be <strong>Live</strong> (it already is if Instagram is connected).</> : <>Save the keys below first; this step's values appear once they're saved.</>,
  },
  {
    id: "w-template",
    title: "Submit the payment reminder template",
    body: <>WhatsApp Manager → Message templates → Create template. Category <strong>Utility</strong>, name <strong>payment_reminder</strong>, language <strong>English</strong>, no buttons, header or footer. Body, exactly — five blanks in this order:<Copyable value="Hello {{1}}, this is a friendly reminder from {{2}}. {{3}} of {{4}} is due by {{5}}. If you have already paid, please ignore this message. Thank you!" />Sample values: Riya · The Oyster Studios · Booking advance for Riya &amp; Arjun wedding · ₹1,18,000 · 25 October 2026. Approval takes minutes to about 24 hours; then enter template <strong>payment_reminder</strong> and language <strong>en</strong> below.</>,
  },
  { id: "w-test", title: "Test it with a teammate's phone", body: <>Send "hi" to the studio number: it appears in Inbox within about 30 seconds, and a reply from Inbox arrives on the phone. On a deal with a payment schedule and that phone as the contact, <strong>Remind</strong> should say "WhatsApp reminder sent".</> },
];

const razorpaySteps = (site: string): Step[] => [
  { id: "r-account", title: "Sign in to the studio's Razorpay account", body: <>dashboard.razorpay.com. If it isn't activated yet, finish activation (business PAN, GST certificate, bank account): Live keys need it; Test mode works straight away. Switch the dashboard to <strong>Test mode</strong> for the first run.</> },
  { id: "r-keys", title: "Create API keys", body: <>Account &amp; Settings → API Keys → Generate Key. Paste the <strong>Key ID</strong> (rzp_test_…) and <strong>Key secret</strong> below straight away — Razorpay shows the secret only once.</> },
  { id: "r-webhook", title: "Create the payment webhook", body: <>Make a long random phrase (20+ characters) as the webhook secret. Account &amp; Settings → Webhooks → Add New Webhook. URL:<Copyable value={`${site}/api/integrations/razorpay/webhook`} />Secret: that phrase. Active events: only <strong>payment_link.paid</strong>. Save, then paste the same phrase below.</> },
  { id: "r-test", title: "Make one ₹1 test payment", body: <>Mark a ₹1 test invoice as sent, click <strong>Payment link</strong>, pay with the test card or UPI details Razorpay shows. The invoice should turn <strong>Paid</strong> within a minute, once. The test invoice used a real number in the GST series: raise a credit note for it.</> },
  { id: "r-live", title: "Go live", body: <>Switch Razorpay to <strong>Live mode</strong>, generate Live keys (rzp_live_…) and add the webhook again — Test and Live webhooks are separate. Paste the Live Key ID, Key secret and webhook secret below, over the test ones.</> },
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

/** "If something doesn't work": the common causes and fixes, folded away under each panel. */
function Troubleshooting({ items }: { items: [string, string][] }) {
  return (
    <details className="mt-4 rounded-panel border border-line px-4 py-3">
      <summary className="t-dense cursor-pointer font-medium">If something doesn't work</summary>
      <dl className="m-0 mt-3 grid gap-x-4 gap-y-2 t-meta sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        {items.map(([seen, fix]) => (
          <div key={seen} className="contents">
            <dt className="font-medium text-ink">{seen}</dt>
            <dd className="m-0 text-ink-2">{fix}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

/** WhatsApp Cloud API keys, webhook and approved reminder template. */
export function WhatsAppSetup({ state, connected }: { state: SetupState; connected: boolean }) {
  const site = window.location.origin;
  return (
    <div className="mt-4">
      <p className="t-meta m-0 mb-3 text-ink-3">For your Meta Business admin · about 60 minutes, plus Meta's template approval. Incoming messages and Inbox replies use the Cloud API; payment reminders use the approved template. Paste keys only here — never send them to anyone.</p>
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
      <Troubleshooting
        items={[
          ["“Verify and save” fails in Meta", "Save the keys here first, reload this panel and copy the verify token again."],
          ["Messages don't reach Inbox", "Subscribe the webhook to messages; add WhatsApp to the same Meta app as Instagram; the app must be Live."],
          ["“More than 24 hours since they last wrote”", "WhatsApp's free reply window has closed. Use Remind (the template) or call; replies reopen when the client writes."],
          ["Remind fails", "The template must be approved and match exactly (payment_reminder, en); add a WhatsApp payment method; the contact needs a phone number."],
          ["Remind opens WhatsApp instead of sending", "WhatsApp isn't connected here yet — the message is typed for you to press send."],
          ["Everything stopped after a day", "The temporary API Setup token was used. Create the system-user token and paste it."],
        ]}
      />
    </div>
  );
}

/** Razorpay keys and paid-link webhook setup. */
export function RazorpaySetup({ state, ready, webhook }: { state: SetupState; ready: boolean; webhook: boolean }) {
  const site = window.location.origin;
  return (
    <div className="mt-4">
      <p className="t-meta m-0 mb-3 text-ink-3">For the studio's Razorpay owner · about 30 minutes (account activation can take a few working days). The CRM creates links only for sent invoices and records each payment once. Paste keys only here — never send them to anyone.</p>
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
      <Troubleshooting
        items={[
          ["“Connect Razorpay first”", "Paste the Key ID and Key secret above and save."],
          ["“Mark the invoice as sent first”", "Payment links are only for sent invoices: check the draft, mark it sent, try again."],
          ["Client paid but the invoice isn't Paid", "Razorpay → Webhooks shows failed deliveries. Re-paste the same secret in both places; tick payment_link.paid in the mode you're using (Test or Live)."],
          ["Razorpay says authentication failed", "The Key ID and secret are from different pairs or modes. Generate a fresh pair and paste both."],
          ["A key may have leaked", "Regenerate the keys and change the webhook secret in Razorpay, then paste the new values here; the old ones stop at once."],
        ]}
      />
    </div>
  );
}
