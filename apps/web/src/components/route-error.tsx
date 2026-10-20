import { Button } from "@pinnacle/ui";
import { TriangleAlert } from "lucide-react";
import { useRouteError } from "react-router";
import { isStaleBundle, reloadForNewVersion } from "../lib/stale";
import { EmptyState } from "./empty-state";

/** Shown instead of a blank screen when a page fails to load; an outdated tab updates itself. */
export function RouteError() {
  const error = useRouteError();
  if (isStaleBundle(error) && reloadForNewVersion()) return <div className="p-8 t-dense text-ink-3">Updating to the latest version…</div>;
  return (
    <div className="p-8">
      <EmptyState
        icon={TriangleAlert}
        title="This page didn't load"
        body={<>Reload to try again. If it keeps happening, tell support what you clicked. <span className="font-mono text-[11px] text-ink-3">{String((error as Error)?.message ?? error).slice(0, 200)}</span></>}
        action={<Button variant="ink" onClick={() => window.location.reload()}>Reload</Button>}
      />
    </div>
  );
}
