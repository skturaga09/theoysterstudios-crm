import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "../lib/cn";

export const buttonVariants = cva(
  [
    "inline-flex items-center justify-center gap-1.5 whitespace-nowrap select-none",
    "rounded-control font-medium t-dense",
    "transition-[background-color,border-color,color,transform] duration-150 ease-out",
    "active:scale-[.98] disabled:pointer-events-none disabled:opacity-50",
    "[&_svg]:size-4 [&_svg]:shrink-0",
  ],
  {
    variants: {
      variant: {
        /** Primary. Ink background. */
        ink: "bg-ink text-on-ink hover:bg-ink/88",
        /** Default. Hairline border on surface. */
        outline: "border border-line-2 bg-surface text-ink hover:bg-hover hover:border-ink-3",
        ghost: "text-ink-2 hover:bg-hover hover:text-ink",
        /** The single most important contextual action on a screen. Use sparingly. */
        signal: "bg-grad text-white hover:brightness-105 [text-shadow:0_1px_0_rgb(0_0_0/0.08)]",
      },
      size: {
        default: "h-[34px] px-3",
        sm: "h-7 px-2.5 text-[12.5px] [&_svg]:size-3.5",
        icon: "size-[34px]",
        "icon-sm": "size-7 [&_svg]:size-3.5",
      },
    },
    defaultVariants: { variant: "outline", size: "default" },
  },
);

export type ButtonProps = ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean };

export function Button({ className, variant, size, asChild, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  return <Comp data-slot="button" className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
