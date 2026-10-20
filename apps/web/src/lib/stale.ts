/**
 * After a new version is published, a tab opened earlier can ask for page files that no longer exist.
 * Those failures are recognised here and fixed by reloading once (never in a loop).
 */
export const isStaleBundle = (e: unknown) =>
  /dynamically imported module|Importing a module script failed|error loading dynamically imported module|Failed to fetch dynamically|MIME type/i.test(String((e as Error)?.message ?? e));

export function reloadForNewVersion() {
  try {
    const last = Number(sessionStorage.getItem("oyster.reloadedAt") ?? 0);
    if (Date.now() - last < 30_000) return false; // just reloaded: show the error instead of looping
    sessionStorage.setItem("oyster.reloadedAt", String(Date.now()));
  } catch {
    // storage blocked: reload anyway, once per page view
  }
  window.location.reload();
  return true;
}
