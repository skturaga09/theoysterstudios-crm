import { Button, cn, Input, toast } from "@pinnacle/ui";
import { Check, Copy } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { api } from "../../lib/api";
import { IS_DEMO } from "../../lib/demo";

/**
 * Setup panels opened from the Integrations page (admins): the steps for connecting Gmail, Calendar and
 * Instagram. Covers only the client's own Google Workspace and Meta accounts — hosting, billing and costs
 * are managed outside the app.
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
};

/** Paste the keys from Google or Meta. Secrets are write-only: once saved they're never shown again. */
type KeyField = "googleClientId" | "googleClientSecret" | "instagramAppId" | "instagramAppSecret" | "metaAppSecret";

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
    { id: "g-apis", title: "Turn on the Gmail and Calendar APIs", body: <>APIs &amp; Services → Library → search for and <strong>Enable</strong> both <strong>Gmail API</strong> and <strong>Google Calendar API</strong>.</> },
    { id: "g-branding", title: "Name the app", body: <>Google Auth Platform → Branding: app name <em>The Oyster Studios CRM</em>; support and developer contact = your own email. Save.</> },
    { id: "g-internal", title: "Keep it inside your company", body: <>Google Auth Platform → Audience → choose <strong>Internal</strong>. Only theoysterstudios.com accounts can connect, and Google's long review is skipped.</> },
    {
      id: "g-scopes",
      title: "Allow read-only access",
      body: <>Google Auth Platform → Data access → Add or remove scopes → add exactly these two: <Copyable value="https://www.googleapis.com/auth/gmail.readonly" /><Copyable value="https://www.googleapis.com/auth/calendar.readonly" /></>,
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

export const setupProgress = (state: SetupState, kind: "google" | "meta") => {
  const steps = kind === "google" ? googleSteps("") : metaSteps("", "");
  return { done: steps.filter((s) => state.done.has(s.id)).length, total: steps.length };
};

/** Google Workspace steps + key fields: one setup connects both Gmail and Calendar. */
export function GoogleSetup({ state }: { state: SetupState }) {
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
