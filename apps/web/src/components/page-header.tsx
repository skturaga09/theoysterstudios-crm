import type { ReactNode } from "react";

export function PageHeader({ eyebrow, title, sub, actions }: { eyebrow?: ReactNode; title: ReactNode; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-8 flex flex-wrap items-end gap-4">
      <div className="min-w-0 flex-1 basis-[280px]">
        {eyebrow && <p className="t-eyebrow m-0 mb-3 text-ink-3">{eyebrow}</p>}
        <h1 className="t-title m-0">{title}</h1>
        {sub && <p className="t-body m-0 mt-2 max-w-[60ch] text-ink-2">{sub}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
