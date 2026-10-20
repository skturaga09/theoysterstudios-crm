import { StageMeter } from "@pinnacle/ui";
import { stagesFor } from "../../data/pipeline";
import { useCrm } from "../../data/store";
import type { Deal } from "../../data/types";

/** The stage meter for a deal, using its business's stages. */
export function DealStage({ deal, label }: { deal: Deal; label?: boolean }) {
  const pipelines = useCrm((s) => s.pipelines);
  return <StageMeter stage={deal.stage} stages={stagesFor(pipelines, deal.business)} label={label} />;
}
