/**
 * How to show a pasted link inside the CRM: Google Drive files, folders and Docs, YouTube, Vimeo and Instagram
 * as their embeddable players; direct image and video files as themselves. Anything else opens in a new tab.
 * Drive files only play for people they're shared with (or "anyone with the link").
 */
export type Embed = { kind: "frame" | "image" | "video"; src: string; source: string } | undefined;

export function embedOf(raw: string): Embed {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return undefined;
  }
  if (u.protocol !== "https:") return undefined;
  const host = u.hostname.replace(/^www\.|^m\./, "");
  const path = u.pathname;
  const file = /\.(jpe?g|png|webp|gif|avif)$/i.test(path) ? "image" : /\.(mp4|webm|mov|m4v)$/i.test(path) ? "video" : undefined;

  if (host === "drive.google.com") {
    const id = path.match(/\/file\/d\/([\w-]+)/)?.[1] ?? (path === "/open" || path === "/uc" ? u.searchParams.get("id") : null);
    if (id) return { kind: "frame", src: `https://drive.google.com/file/d/${id}/preview`, source: "Google Drive" };
    const folder = path.match(/\/folders\/([\w-]+)/)?.[1];
    if (folder) return { kind: "frame", src: `https://drive.google.com/embeddedfolderview?id=${folder}#grid`, source: "Google Drive folder" };
  }
  if (host === "docs.google.com") {
    const m = path.match(/^\/(document|spreadsheets|presentation)\/d\/([\w-]+)/);
    if (m) return { kind: "frame", src: `https://docs.google.com/${m[1]}/d/${m[2]}/preview`, source: "Google Docs" };
  }
  const yt = host === "youtu.be" ? path.slice(1) : host === "youtube.com" ? (u.searchParams.get("v") ?? path.match(/^\/(?:shorts|embed|live)\/([\w-]+)/)?.[1]) : undefined;
  if (yt && /^[\w-]{6,20}$/.test(yt)) return { kind: "frame", src: `https://www.youtube.com/embed/${yt}`, source: "YouTube" };
  const vimeo = host === "vimeo.com" ? path.match(/^\/(\d+)/)?.[1] : undefined;
  if (vimeo) return { kind: "frame", src: `https://player.vimeo.com/video/${vimeo}`, source: "Vimeo" };
  const ig = host === "instagram.com" ? path.match(/^\/(p|reel|tv)\/([\w-]+)/) : null;
  if (ig) return { kind: "frame", src: `https://www.instagram.com/${ig[1]}/${ig[2]}/embed`, source: "Instagram" };
  if (file) return { kind: file, src: u.href, source: "File" };
  return undefined;
}
