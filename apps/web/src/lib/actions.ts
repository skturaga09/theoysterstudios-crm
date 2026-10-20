import { formatCompact, type Stage, stageIn } from "@pinnacle/shared";
import { toast } from "@pinnacle/ui";
import { canEditNow, useCrm } from "../data/store";
import { useUi } from "./ui-store";

/** Stage change from anywhere: writes an activity, undoable for 3.2s, Won pulses once. */
export function changeStage(dealId: string, stage: Stage, index?: number) {
  const deal = useCrm.getState().deals.find((d) => d.id === dealId);
  if (!deal) return;
  if (!canEditNow(deal.ownerId)) return void toast("Only the deal's owner or a manager can move it");
  const same = deal.stage === stage;
  const undo = useCrm.getState().moveDeal(dealId, stage, index);
  if (same) return;
  if (stage === "won") {
    useUi.setState({ wonPulse: dealId });
    window.setTimeout(() => useUi.setState({ wonPulse: undefined }), 700);
  }
  toast(
    stage === "won"
      ? `${stageIn(useCrm.getState().pipelines, deal.business, "won").label} · ${deal.title} · ${formatCompact(deal.valuePaise)}`
      : stage === "lost"
        ? `Marked lost · ${deal.title}`
        : `Moved to ${stageIn(useCrm.getState().pipelines, deal.business, stage).label} · ${deal.title}`,
    { action: { label: "Undo", onClick: undo } },
  );
}
