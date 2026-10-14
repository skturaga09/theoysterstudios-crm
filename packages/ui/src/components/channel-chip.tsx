import { CHANNEL_LABEL, CHANNEL_MONOGRAM, type Channel } from "@pinnacle/shared";
import { cn } from "../lib/cn";

/** 20px mono monogram in a hairline box. No brand logos in app chrome. */
export function ChannelChip({ channel, className }: { channel: Channel; className?: string }) {
  return (
    <span
      title={CHANNEL_LABEL[channel]}
      aria-label={CHANNEL_LABEL[channel]}
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-control border border-line-2 px-1",
        "font-mono text-[9.5px] leading-none font-medium tracking-[0.04em] text-ink-2",
        className,
      )}
    >
      {CHANNEL_MONOGRAM[channel]}
    </span>
  );
}
