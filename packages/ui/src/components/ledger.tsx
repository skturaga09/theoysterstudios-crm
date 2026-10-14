import { compactParts, type Paise } from "@pinnacle/shared";
import { cn } from "../lib/cn";
import { CountUp } from "./count-up";
import { Sparkline } from "./sparkline";

export type LedgerCell = {
  label: string;
  /** Either money in paise… */
  paise?: Paise;
  /** …or a plain number with a unit ("4", "h"). */
  value?: number;
  unit?: string;
  decimals?: number;
  delta?: string;
  deltaTone?: "ok" | "risk" | "mute";
  spark?: number[];
};

const deltaTone = { ok: "text-ok", risk: "text-risk", mute: "text-ink-3" } as const;

/** KPI row: 1px ink rule on top, hairline dividers, serif numerals + mono units. No card boxes. */
export function Ledger({ cells, countUp = false, className }: { cells: LedgerCell[]; countUp?: boolean; className?: string }) {
  return (
    <div className={cn("@container", className)}>
    <dl
      className="m-0 grid grid-cols-2 border-t border-ink @[880px]:grid-cols-[repeat(var(--n),minmax(0,1fr))]"
      style={{ ["--n" as string]: cells.length }}
    >
      {cells.map((c, i) => {
        let num = c.value ?? 0;
        let unit = c.unit ?? "";
        let decimals = c.decimals ?? 0;
        if (c.paise !== undefined) {
          const p = compactParts(c.paise);
          num = Number(p.value);
          unit = p.unit;
          decimals = p.unit === "Cr" ? 2 : p.unit ? 1 : 0;
        }
        return (
          <div
            key={c.label}
            className={cn(
              "flex flex-col gap-3 py-4 pr-5",
              i % 2 === 1 && "border-l border-line pl-5",
              "@[880px]:border-l @[880px]:pl-5 @[880px]:first:border-l-0 @[880px]:first:pl-0",
              i >= 2 && "border-t border-line @[880px]:border-t-0",
            )}
          >
            <dt className="t-eyebrow text-ink-3">{c.label}</dt>
            <dd className="m-0 flex flex-wrap items-end justify-between gap-x-3 gap-y-2">
              <span className="flex items-baseline gap-1">
                {c.paise !== undefined && <span className="mr-0.5 font-mono text-[15px] text-ink-2">₹</span>}
                <CountUp value={num} decimals={decimals} run={countUp} className="t-kpi" />
                {unit && <span className="font-mono text-[13px] text-ink-2">{unit}</span>}
              </span>
              {c.spark && <Sparkline data={c.spark} />}
            </dd>
            {c.delta && <dd className={cn("m-0 font-mono text-[11.5px] tnum", deltaTone[c.deltaTone ?? "mute"])}>{c.delta}</dd>}
          </div>
        );
      })}
    </dl>
    </div>
  );
}
