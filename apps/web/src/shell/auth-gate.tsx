import { Button } from "@pinnacle/ui";
import { FirebaseError } from "firebase/app";
import { onAuthStateChanged, signInWithPopup, signInWithRedirect, signOut } from "firebase/auth";
import { LogIn, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { setMeId } from "../data/seed";
import { loadCrm } from "../data/sync";
import { api, ApiError } from "../lib/api";
import { auth, google } from "../lib/firebase";
import { useSession, type SessionMember } from "../lib/session";


type Gate = { kind: "loading" } | { kind: "signed-out"; error?: string } | { kind: "not-on-team"; email: string } | { kind: "offline" } | { kind: "ready" };

export async function signIn() {
  try {
    await signInWithPopup(auth, google);
  } catch (e) {
    const code = e instanceof FirebaseError ? e.code : "";
    if (code === "auth/popup-blocked") return signInWithRedirect(auth, google);
    if (code !== "auth/popup-closed-by-user" && code !== "auth/cancelled-popup-request") throw e;
  }
}

/** Shows the app only to someone signed in with Google whose address is on the team list (checked by the API). */
export function AuthGate({ children }: { children: ReactNode }) {
  const [gate, setGate] = useState<Gate>({ kind: "loading" });

  const check = useCallback(async () => {
    setGate({ kind: "loading" });
    try {
      const me = await api<SessionMember>("/me");
      useSession.setState({ me });
      setMeId(me.id);
      await loadCrm();
      setGate({ kind: "ready" });
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) return setGate({ kind: "not-on-team", email: e.body?.email ?? auth.currentUser?.email ?? "" });
      if (e instanceof ApiError && e.status === 401) {
        await signOut(auth);
        return setGate({ kind: "signed-out", error: "That sign-in couldn't be verified. Please try again." });
      }
      setGate({ kind: "offline" });
    }
  }, []);

  useEffect(
    () =>
      onAuthStateChanged(auth, (user) => {
        if (user) void check();
        else {
          useSession.setState({ me: undefined });
          setGate((g) => (g.kind === "signed-out" ? g : { kind: "signed-out" }));
        }
      }),
    [check],
  );

  if (gate.kind === "ready") return children;
  return (
    <main className="grid min-h-dvh place-items-center bg-bg px-4">
      <div className="flex w-full max-w-[380px] flex-col items-center gap-5 text-center" aria-live="polite">
        <img src="/logo.png" alt="The Oyster Studios" className="h-28 w-auto" />
        {gate.kind === "loading" && <p className="t-body m-0 text-ink-3">Signing you in…</p>}
        {gate.kind === "signed-out" && <SignIn error={gate.error} />}
        {gate.kind === "not-on-team" && (
          <>
            <h1 className="t-sheet m-0">This account isn't on the team</h1>
            <p className="t-body m-0 text-ink-2">
              <span className="font-mono fs-13 text-ink">{gate.email}</span> can't open the CRM yet. Ask an admin to add it in Settings → Team & access.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <Button variant="ink" onClick={() => void signOut(auth).then(signIn)}>Use another account</Button>
              <Button onClick={() => void check()}><RefreshCw strokeWidth={1.5} /> Try again</Button>
            </div>
          </>
        )}
        {gate.kind === "offline" && (
          <>
            <h1 className="t-sheet m-0">Can't reach the CRM server</h1>
            <p className="t-body m-0 text-ink-2">Check your connection and try again. If it keeps happening, the server may be down.</p>
            <Button variant="ink" onClick={() => void check()}><RefreshCw strokeWidth={1.5} /> Try again</Button>
          </>
        )}
      </div>
    </main>
  );
}

function SignIn({ error: initial }: { error?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(initial);
  return (
    <>
      <h1 className="t-sheet m-0">Sign in to The Oyster Studios CRM</h1>
      <p className="t-body m-0 text-ink-2">Use the Google or Gmail address your admin added to the team.</p>
      <Button
        variant="ink"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(undefined);
          try {
            await signIn();
          } catch {
            setError("Google sign-in didn't complete. Please try again.");
          } finally {
            setBusy(false);
          }
        }}
      >
        <LogIn strokeWidth={1.5} /> {busy ? "Opening Google…" : "Continue with Google"}
      </Button>
      {error && <p role="alert" className="t-meta m-0 text-risk">{error}</p>}
    </>
  );
}
