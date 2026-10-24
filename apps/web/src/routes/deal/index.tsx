import { Button } from "@pinnacle/ui";
import { ArrowLeft } from "lucide-react";
import { Link, useParams } from "react-router";
import { DealActivity, DealHeading, DealMenu, DealProperties, DealSide, NextStep } from "../../components/deal/deal-detail";
import { StageBar } from "../../components/deal/stage-bar";
import { EmptyState } from "../../components/empty-state";
import { useCrm } from "../../data/store";
import { FileQuestion } from "lucide-react";

/** Full deal record for deep work. The sheet is the quick view. */
export function DealRoute() {
  const { id } = useParams();
  const deal = useCrm((s) => s.deals.find((d) => d.id === id));
  if (!deal)
    return (
      <EmptyState
        icon={FileQuestion}
        title="This deal doesn't exist"
        body="It may have been deleted, or the link is wrong."
        action={<Button asChild><Link to="/pipeline">Back to pipeline</Link></Button>}
      />
    );
  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center">
        <Link to="/pipeline" className="inline-flex items-center gap-1.5 fs-12.5 text-ink-2 hover:text-ink">
          <ArrowLeft size={14} strokeWidth={1.5} /> Pipeline
        </Link>
        <span className="ml-auto"><DealMenu deal={deal} /></span>
      </div>
      <DealHeading deal={deal} size="page" />
      <StageBar dealId={deal.id} stage={deal.stage} business={deal.business} />
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-8">
          <NextStep key={deal.id + (deal.nextStep ?? "")} deal={deal} />
          <section>
            <h2 className="t-eyebrow m-0 mb-3 text-ink-2">Activity</h2>
            <DealActivity deal={deal} />
          </section>
        </div>
        <aside className="flex flex-col gap-8">
          <section>
            <h2 className="t-eyebrow m-0 mb-1 text-ink-2">Properties</h2>
            <DealProperties key={deal.id} deal={deal} />
          </section>
          <DealSide deal={deal} />
        </aside>
      </div>
    </div>
  );
}
