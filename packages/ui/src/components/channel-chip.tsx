import instagram from "../assets/channels/instagram.png";
import facebook from "../assets/channels/facebook.png";
import whatsapp from "../assets/channels/whatsapp.png";
import gmail from "../assets/channels/gmail.png";
import calendar from "../assets/channels/calendar.png";
import web from "../assets/channels/web.png";
import { CHANNEL_LABEL, CHANNEL_MONOGRAM, type Channel } from "@pinnacle/shared";
import { cn } from "../lib/cn";

/** A channel at a glance: its logo (Instagram, Facebook, WhatsApp, Gmail, Calendar, website) or a 20px monogram. */
/** The real logo for channels that have one; the rest (referral, phone, event…) keep a short monogram. */
export const CHANNEL_ICON: Partial<Record<Channel, string>> = { instagram, facebook, whatsapp, gmail, calendar, web };

export function ChannelChip({ channel, className }: { channel: Channel; className?: string }) {
  const icon = CHANNEL_ICON[channel];
  return (
    <span
      title={CHANNEL_LABEL[channel]}
      role="img"
      aria-label={CHANNEL_LABEL[channel]}
      className={cn(
        "inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-control",
        icon ? "p-px" : "border border-line-2 px-1 font-mono fs-9.5 leading-none font-medium tracking-[0.04em] text-ink-2",
        className,
      )}
    >
      {icon ? <img src={icon} alt="" className="size-full max-h-[18px] max-w-[18px] object-contain" draggable={false} /> : CHANNEL_MONOGRAM[channel]}
    </span>
  );
}
