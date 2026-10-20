import { BUSINESS_LABEL, type Business } from "@pinnacle/shared";
import { cn } from "@pinnacle/ui";
import { Camera, Megaphone } from "lucide-react";

/** The business colour for text: the studio's rose for wedding photography, teal for marketing. */
export const BUSINESS_TEXT: Record<Business, string> = { photography: "text-signal", marketing: "text-ok" };

/** A round badge that tells the two businesses apart at a glance: a camera for photography, a megaphone for marketing. */
export function BusinessIcon({ business, size = "md", className }: { business: Business; size?: "sm" | "md"; className?: string }) {
  const Icon = business === "marketing" ? Megaphone : Camera;
  return (
    <span
      role="img"
      aria-label={BUSINESS_LABEL[business]}
      title={BUSINESS_LABEL[business]}
      className={cn(
        "grid shrink-0 place-items-center rounded-full",
        business === "marketing" ? "bg-ok-wash text-ok" : "bg-signal-wash text-signal",
        size === "sm" ? "size-6" : "size-10",
        className,
      )}
    >
      <Icon size={size === "sm" ? 13 : 18} strokeWidth={1.75} aria-hidden />
    </span>
  );
}
