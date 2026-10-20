import { stageIn, type Business, type Pipelines, type PipelineStage } from "@pinnacle/shared";
import type { Deal } from "./types";

/**
 * Each business has its own stages (Settings → Pipelines & stages). These read a deal's stage from its
 * business's pipeline; a deal with no business yet uses the photography pipeline.
 */
export const stagesFor = (p: Pipelines, business?: Business) => p[business ?? "photography"];
/** The stages a deal moves through, without Lost (it sits outside the run). */
export const runFor = (p: Pipelines, business?: Business) => stagesFor(p, business).filter((s) => s.kind !== "lost");
export const stageOfDeal = (p: Pipelines, d: Deal): PipelineStage => stageIn(p, d.business, d.stage);
export const probabilityOf = (p: Pipelines, d: Deal) => stageOfDeal(p, d).probability;
/** Position in its pipeline (Lost sorts first) — for "most advanced deal" and sorting by stage. */
export const stageRank = (p: Pipelines, d: Deal) => (d.stage === "lost" ? -1 : stagesFor(p, d.business).findIndex((s) => s.id === d.stage));
