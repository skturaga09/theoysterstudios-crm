import { fmtAgo, fmtDate, type Role } from "@pinnacle/shared";
import { Avatar, Button, cn, Input, Pill, Select, toast } from "@pinnacle/ui";
import { Copy, Lock, Trash2, UserPlus } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useState } from "react";
import { api } from "../../lib/api";
import { useMe } from "../../data/store";
import type { SessionMember as Member } from "../../lib/session";
import { SettingsHeader } from "./layout";

const ROLE_LABEL: Record<Role, string> = { admin: "Admin", manager: "Manager", member: "Member" };
const ROLE_HELP: Record<Role, string> = {
  admin: "Everything, including team, integrations and data export.",
  manager: "All deals and reports. Can reassign work. No team or integration settings.",
  member: "Their own deals and conversations, plus anything shared with them.",
};
const SIGN_IN_URL = window.location.origin;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Admin-only. Sign-in is Google; access is an allowlist of addresses managed here (stored by the API).
 * Any Google account works — Workspace or personal @gmail.com.
 */
export function TeamRoute() {
  const me = useMe();
  const [members, setMembers] = useState<Member[]>();
  const [loadError, setLoadError] = useState<string>();
  const reload = useCallback(() => api<Member[]>("/members").then(setMembers, (e: Error) => setLoadError(e.message)), []);
  useEffect(() => void reload(), [reload]);
  const isAdmin = me.role === "admin";

  if (!members)
    return (
      <>
        <SettingsHeader title="Team & access" body="Loading the team…" />
        {loadError && <p role="alert" className="t-meta text-risk">Couldn't load the team: {loadError}</p>}
      </>
    );
  const admins = members.filter((m) => m.role === "admin").length;

  return (
    <>
      <SettingsHeader
        title="Team & access"
        body="Only the Google or Gmail addresses listed here can sign in to The Oyster Studios. Remove someone and their access ends immediately. Their deals and tasks stay, ready to reassign."
      />
      {!isAdmin && (
        <p className="t-dense mb-6 flex items-center gap-2 rounded-card bg-sunken px-4 py-3 text-ink-2">
          <Lock size={14} strokeWidth={1.5} /> Only admins can add or remove people. Ask {members.find((m) => m.role === "admin")?.name} for changes.
        </p>
      )}

      {isAdmin && <AddMember members={members} onChange={reload} />}

      <section className="mt-10">
        <header className="mb-3 flex items-center gap-3">
          <h2 className="t-eyebrow m-0 text-ink-2">People with access</h2>
          <span className="font-mono text-[11.5px] whitespace-nowrap text-ink-3">{members.length} · {admins} {admins === 1 ? "admin" : "admins"}</span>
          <button
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(SIGN_IN_URL);
                toast("Sign-in link copied");
              } catch {
                toast(SIGN_IN_URL);
              }
            }}
            className="ml-auto inline-flex items-center gap-1.5 font-mono text-[11.5px] text-ink-2 hover:text-ink"
          >
            <Copy size={12} strokeWidth={1.5} /> {SIGN_IN_URL.replace("https://", "")}
          </button>
        </header>
        <ul className="m-0 list-none border-t border-line p-0">
          <AnimatePresence initial={false}>
            {[...members]
              .sort((a, b) => Number(b.id === me.id) - Number(a.id === me.id) || a.name.localeCompare(b.name))
              .map((m) => (
                <MemberRow key={m.id} m={m} isMe={m.id === me.id} canEdit={isAdmin} lastAdmin={m.role === "admin" && admins === 1} onChange={reload} />
              ))}
          </AnimatePresence>
        </ul>
      </section>

      <section className="mt-10">
        <h2 className="t-eyebrow m-0 mb-3 text-ink-2">Roles</h2>
        <dl className="m-0 grid grid-cols-1 gap-x-6 gap-y-2 border-t border-line pt-3 t-dense sm:grid-cols-[120px_1fr]">
          {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
            <div key={r} className="contents">
              <dt className="font-medium">{ROLE_LABEL[r]}</dt>
              <dd className="m-0 mb-2 text-ink-2 sm:mb-0">{ROLE_HELP[r]}</dd>
            </div>
          ))}
        </dl>
      </section>
    </>
  );
}

function AddMember({ members, onChange }: { members: Member[]; onChange: () => void }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("member");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const addr = email.trim().toLowerCase();
        if (!EMAIL_RE.test(addr)) return setError("Enter a full Google or Gmail address, like name@gmail.com.");
        if (members.some((m) => m.email.toLowerCase() === addr)) return setError(`${addr} already has access.`);
        setBusy(true);
        try {
          const m = await api<Member>("/members", { method: "POST", body: { email: addr, name: name.trim() || undefined, role } });
          toast(`Added ${m.name} · share the sign-in link with them`);
          setEmail("");
          setName("");
          setRole("member");
          setError(undefined);
          onChange();
        } catch (err) {
          setError((err as Error).message);
        } finally {
          setBusy(false);
        }
      }}
      className="rounded-panel border border-line bg-surface p-4 md:p-5"
      aria-labelledby="add-h"
    >
      <h2 id="add-h" className="m-0 mb-4 flex items-center gap-2 text-[14px] font-medium">
        <UserPlus size={16} strokeWidth={1.5} /> Add a person
      </h2>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_150px_auto] md:items-end">
        <label className="flex flex-col gap-1.5">
          <span className="text-[12.5px] font-medium">Google or Gmail address</span>
          <Input
            id="member-email"
            type="email"
            autoComplete="off"
            placeholder="name@gmail.com"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setError(undefined); }}
            aria-invalid={!!error}
            aria-describedby={error ? "member-error" : undefined}
            className="font-mono"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[12.5px] font-medium">Name <span className="font-normal text-ink-3">(optional)</span></span>
          <Input id="member-name" placeholder="Taken from Google if blank" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[12.5px] font-medium">Role</span>
          <Select id="member-role" value={role} onChange={(e) => setRole(e.target.value as Role)}>
            {(Object.keys(ROLE_LABEL) as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
          </Select>
        </label>
        <Button type="submit" variant="ink" disabled={busy}>{busy ? "Adding…" : "Add person"}</Button>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="t-meta text-ink-2">They sign in with Google at {SIGN_IN_URL.replace(/^https?:\/\//, "")}.</span>
        <span className="t-meta text-ink-3">{ROLE_HELP[role]}</span>
      </div>
      {error && <p id="member-error" role="alert" className="t-meta m-0 mt-3 text-risk">{error}</p>}
    </form>
  );
}

function MemberRow({ m, isMe, canEdit, lastAdmin, onChange }: { m: Member; isMe: boolean; canEdit: boolean; lastAdmin: boolean; onChange: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const lockReason = isMe ? "You can't remove yourself." : lastAdmin ? "The last admin can't be removed." : undefined;

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0, transition: { duration: 0.3 } }}
      className="overflow-hidden border-b border-line"
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
        <Avatar name={m.name} me={isMe} size="lg" />
        <div className="min-w-0 flex-1 basis-[200px] leading-tight">
          <div className="t-dense flex items-center gap-2 font-medium">
            {m.name}
            {isMe && <span className="text-[11px] font-normal text-ink-3">you</span>}
            {m.status === "invited" ? <Pill tone="new">Invited</Pill> : null}
          </div>
          <div className="mt-0.5 font-mono text-[11.5px] text-ink-3">{m.email}</div>
        </div>
        <div className="hidden w-[150px] font-mono text-[11px] text-ink-3 md:block">
          {m.status === "invited" ? `Added ${fmtDate(m.addedAt).replace(/^\w+ /, "")}` : m.lastSignInAt ? `Signed in ${fmtAgo(m.lastSignInAt)}` : "Never signed in"}
        </div>
        <div className="w-[140px]">
          {canEdit ? (
            <Select
              aria-label={`Role for ${m.name}`}
              value={m.role}
              disabled={lastAdmin}
              title={lastAdmin ? "Add another admin before changing this role." : undefined}
              onChange={async (e) => {
                const role = e.target.value as Role;
                try {
                  await api(`/members/${m.id}`, { method: "PATCH", body: { role } });
                  toast(`${m.name} is now ${ROLE_LABEL[role]}`);
                } catch (err) {
                  toast(`Couldn't change role: ${(err as Error).message}`);
                }
                onChange();
              }}
            >
              {(Object.keys(ROLE_LABEL) as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
            </Select>
          ) : (
            <span className="t-dense text-ink-2">{ROLE_LABEL[m.role]}</span>
          )}
        </div>
        {canEdit && (
          <div className="flex w-[36px] justify-end">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Remove ${m.name}`}
              title={lockReason}
              disabled={!!lockReason}
              onClick={() => setConfirming(true)}
              className={cn(!lockReason && "hover:text-risk")}
            >
              <Trash2 strokeWidth={1.5} />
            </Button>
          </div>
        )}
      </div>
      <AnimatePresence>
        {confirming && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="mb-3 flex flex-wrap items-center gap-3 rounded-card bg-risk-wash px-4 py-3">
              <p className="t-dense m-0 flex-1 text-ink">
                Remove <strong className="font-medium">{m.email}</strong>? They'll be signed out now and can't sign in again.
                <span className="text-ink-2"> Their deals and tasks stay assigned until you move them.</span>
              </p>
              <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>Cancel</Button>
              <Button
                size="sm"
                variant="ink"
                className="bg-risk hover:bg-risk/90"
                onClick={async () => {
                  try {
                    await api(`/members/${m.id}`, { method: "DELETE" });
                    const restore = () => void api("/members", { method: "POST", body: { email: m.email, name: m.name, role: m.role } }).then(onChange, (err: Error) => toast(`Couldn't undo: ${err.message}`));
                    toast(`Removed ${m.name}`, { action: { label: "Undo", onClick: restore } });
                  } catch (err) {
                    toast(`Couldn't remove: ${(err as Error).message}`);
                  }
                  setConfirming(false);
                  onChange();
                }}
              >
                Remove access
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.li>
  );
}
