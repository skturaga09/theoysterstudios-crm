import type { Channel } from "./domain";
import type { Paise } from "./money";

export type RoutingRule = { id: string; channel?: Channel; city?: string; minPaise?: Paise; ownerId: string };
export type IncomingLead = { channel: Channel; city?: string; valuePaise?: Paise };

/**
 * Owner for a new lead: the first rule, top to bottom, whose every condition matches and whose owner is
 * still on the team. Undefined when none match (the lead stays unassigned). A value condition never matches
 * a lead whose value isn't known yet.
 */
export function routeLead(rules: RoutingRule[], lead: IncomingLead, isActive: (ownerId: string) => boolean = () => true): string | undefined {
  const city = lead.city?.trim().toLowerCase();
  return rules.find(
    (r) =>
      (!r.channel || r.channel === lead.channel) &&
      (!r.city || r.city.trim().toLowerCase() === city) &&
      (r.minPaise === undefined || (lead.valuePaise !== undefined && lead.valuePaise >= r.minPaise)) &&
      isActive(r.ownerId),
  )?.ownerId;
}
