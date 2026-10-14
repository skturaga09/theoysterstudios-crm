import { Button, Sheet } from "@pinnacle/ui";
import { ArrowUpRight } from "lucide-react";
import { useNavigate } from "react-router";
import { useCrm } from "../../data/store";
import { useUi } from "../../lib/ui-store";
import { DealActivity, DealHeading, DealMenu, DealProperties, NextStep } from "./deal-detail";
import { StageBar } from "./stage-bar";

/** Right-side quick view for any deal. Full record lives at /deals/:id. */
export function DealSheet() {
  const id = useUi((s) => s.dealId);
  const deal = useCrm((s) => s.deals.find((d) => d.id === id));
  const navigate = useNavigate();
  const close = () => useUi.getState().closeDeal();
  return (
    <Sheet
      open={!!deal}
      onOpenChange={(o) => !o && close()}
      title={deal ? <span className="sr-only">Deal</span> : ""}
      footer={
        deal && (
          <div className="flex items-center gap-2">
            <DealMenu deal={deal} />
            <Button
              variant="ink"
              className="ml-auto"
              onClick={() => {
                close();
                navigate(`/deals/${deal.id}`, { viewTransition: true });
              }}
            >
              Open full record <ArrowUpRight strokeWidth={1.5} />
            </Button>
          </div>
        )
      }
    >
      {deal && (
        <div className="-mt-2 flex flex-col gap-6">
          <DealHeading deal={deal} />
          <StageBar dealId={deal.id} stage={deal.stage} />
          <NextStep key={deal.id + (deal.nextStep ?? "")} deal={deal} />
          <section>
            <h3 className="t-eyebrow m-0 mb-1 text-ink-3">Properties</h3>
            <DealProperties key={deal.id} deal={deal} />
          </section>
          <section>
            <h3 className="t-eyebrow m-0 mb-3 text-ink-3">Activity</h3>
            <DealActivity deal={deal} />
          </section>
        </div>
      )}
    </Sheet>
  );
}
