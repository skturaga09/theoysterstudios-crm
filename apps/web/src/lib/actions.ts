import { formatCompact, STAGE_LABEL, type Stage } from "@pinnacle/shared";
import { toast } from "@pinnacle/ui";
import { useCrm } from "../data/store";
import { useUi } from "./ui-store";

/** Stage change from anywhere: writes an activity, undoable for 3.2s, Won pulses once. */
export function changeStage(dealId: string, stage: Stage, index?: number) {
  const deal = useCrm.getState().deals.find((d) => d.id === dealId);
  if (!deal) return;
  const same = deal.stage === stage;
  const undo = useCrm.getState().moveDeal(dealId, stage, index);
  if (same) return;
  if (stage === "won") {
    useUi.setState({ wonPulse: dealId });
    window.setTimeout(() => useUi.setState({ wonPulse: undefined }), 700);
  }
  toast(
    stage === "won"
      ? `Won · ${deal.title} · ${formatCompact(deal.valuePaise)}`
      : stage === "lost"
        ? `Marked lost · ${deal.title}`
        : `Moved to ${STAGE_LABEL[stage]} · ${deal.title}`,
    { action: { label: "Undo", onClick: undo } },
  );
}
