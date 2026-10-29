import { fmtDate, formatFull, invoiceTotals } from "@pinnacle/shared";
import { Button, Input, MoneyText, Pill, toast } from "@pinnacle/ui";
import { FileSignature, MessageCircle, Plus, Trash2 } from "lucide-react";
import { Link, useNavigate } from "react-router";
import { useState } from "react";
import { createQuote, invoiceStage, planFor, setSchedule, stageState, whatsappReminder, type StageState } from "../../data/finance";
import { useAccess, useCanEdit, useCrm, useWorkspace } from "../../data/store";
import type { Deal } from "../../data/types";
import { useUi } from "../../lib/ui-store";
import { api } from "../../lib/api";
import { IS_DEMO } from "../../lib/demo";

export const STAGE_TONE: Record<StageState, "mute" | "warn" | "risk" | "ok"> = { planned: "mute", due: "warn", overdue: "risk", invoiced: "warn", "part paid": "warn", paid: "ok" };
const label = (st: StageState) => st[0]!.toUpperCase() + st.slice(1);

/** A lead's quotations: open one, or start a new one from the business's packages. */
export function DealQuotes({ deal }: { deal: Deal }) {
  const navigate = useNavigate();
  const quotes = useCrm((s) => s.quotes).filter((q) => q.dealId === deal.id);
  const canEdit = useCanEdit(deal.ownerId);
  return (
    <section>
      <h3 className="t-eyebrow m-0 mb-2 text-ink-3">Quotations · {quotes.length}</h3>
      <ul className="m-0 list-none p-0">
        {quotes.map((q) => (
          <li key={q.id}>
            <Link to={`/quotes/${q.id}`} onClick={() => useUi.getState().closeDeal()} className="flex items-center gap-2.5 border-b border-line py-2 last:border-0 hover:bg-hover">
              <FileSignature size={14} strokeWidth={1.5} className="text-ink-3" />
              <span className="flex-1 truncate font-mono fs-12">{q.number}</span>
              <MoneyText paise={invoiceTotals({ ...q, payments: [] }).total} className="fs-12" />
              <Pill tone={q.status === "accepted" ? "ok" : q.status === "declined" ? "risk" : q.status === "sent" ? "warn" : "mute"}>{q.status[0]!.toUpperCase() + q.status.slice(1)}</Pill>
            </Link>
          </li>
        ))}
      </ul>
      {canEdit && (
        <Button
          size="sm"
          className="mt-2"
          onClick={async () => {
            try {
              const q = await createQuote({ deal, companyId: deal.companyId, business: deal.business ?? "photography" });
              useUi.getState().closeDeal();
              navigate(`/quotes/${q.id}`);
            } catch (e) {
              toast(`Couldn't start a quotation — ${(e as Error).message}`);
            }
          }}
        >
          <Plus strokeWidth={1.5} /> New quotation
        </Button>
      )}
    </section>
  );
}

/** When the client pays what: stages from the accepted quotation (or the standard plan), each invoiced in turn. */
export function DealPayments({ deal }: { deal: Deal }) {
  const s = useCrm();
  const studio = useWorkspace();
  const canInvoice = useAccess("finance") === "edit";
  const canPlan = useCanEdit(deal.ownerId) || canInvoice;
  const whatsappConnected = !IS_DEMO && s.channels.some((c) => c.channel === "whatsapp");
  const [reminding, setReminding] = useState<string>();
  const schedule = deal.schedule ?? [];
  const contact = s.contacts.find((c) => c.id === deal.contactId) ?? s.contacts.find((c) => c.companyId === deal.companyId);
  const total = schedule.reduce((a, m) => a + m.amountPaise, 0);
  const change = (id: string, patch: Partial<(typeof schedule)[number]>) => setSchedule(deal.id, schedule.map((m) => (m.id === id ? { ...m, ...patch } : m)));

  return (
    <section>
      <h3 className="t-eyebrow m-0 mb-2 text-ink-3">Payment schedule{schedule.length ? ` · ${formatFull(total)} + GST` : ""}</h3>
      {!schedule.length ? (
        <>
          <p className="t-meta m-0 text-ink-3">No schedule yet. Accepting a quotation sets one, or use the standard plan for this deal's value.</p>
          {canPlan && deal.valuePaise > 0 && (
            <Button size="sm" className="mt-2" onClick={() => setSchedule(deal.id, planFor(deal))}>Use the standard plan</Button>
          )}
        </>
      ) : (
        <ul className="m-0 list-none p-0">
          {schedule.map((m) => {
            const st = stageState(m, s.invoices);
            const inv = m.invoiceId ? s.invoices.find((i) => i.id === m.invoiceId) : undefined;
            const owed = inv ? invoiceTotals(inv).due : Math.round(m.amountPaise * 1.18);
            const text = `Hello ${contact?.name?.split(" ")[0] ?? ""}, a gentle reminder from ${studio.studioName}: ${m.label.toLowerCase()} of ${formatFull(owed)}${inv ? ` (invoice ${inv.number})` : ""} is due${m.dueDate ? ` by ${fmtDate(m.dueDate)}` : ""}. Thank you!`;
            return (
              <li key={m.id} className="flex flex-col gap-1.5 border-b border-line py-2 last:border-0">
                <div className="flex items-center gap-2">
                  <span className="t-dense min-w-0 flex-1 truncate">{m.label}</span>
                  <MoneyText paise={m.amountPaise} className="fs-12" />
                  <Pill tone={STAGE_TONE[st]}>{label(st)}</Pill>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {inv ? (
                    <Link to={`/invoices?open=${inv.id}`} className="font-mono fs-11.5 text-ink-2 hover:underline">{inv.number}</Link>
                  ) : (
                    <Input type="date" aria-label={`${m.label} due`} disabled={!canPlan} value={m.dueDate ?? ""} onChange={(e) => change(m.id, { dueDate: e.target.value || undefined })} className="h-7 w-[140px] fs-12" />
                  )}
                  <span className="ml-auto flex items-center gap-1">
                    {!inv && canInvoice && <><Button size="sm" onClick={() => void invoiceStage(deal.id, m.id)}>GST invoice</Button><Button size="sm" variant="ghost" onClick={() => void invoiceStage(deal.id, m.id, "cash")}>Cash bill</Button></>}
                    {st !== "paid" && st !== "planned" && contact?.phone && (whatsappConnected ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={reminding === m.id}
                        onClick={async () => {
                          setReminding(m.id);
                          try {
                            await api(`/deals/${deal.id}/schedule/${m.id}/remind`, { method: "POST" });
                            toast("WhatsApp reminder sent");
                          } catch (e) {
                            toast(`Couldn't send reminder — ${(e as Error).message}`);
                          } finally {
                            setReminding(undefined);
                          }
                        }}
                      >
                        <MessageCircle strokeWidth={1.5} /> {reminding === m.id ? "Sending…" : "Remind"}
                      </Button>
                    ) : (
                      <Button size="sm" variant="ghost" asChild>
                        <a href={whatsappReminder(contact.phone, text)} target="_blank" rel="noreferrer"><MessageCircle strokeWidth={1.5} /> Remind</a>
                      </Button>
                    ))}
                    {!inv && canPlan && (
                      <Button size="icon-sm" variant="ghost" aria-label={`Remove ${m.label}`} onClick={() => setSchedule(deal.id, schedule.filter((x) => x.id !== m.id))}><Trash2 strokeWidth={1.5} /></Button>
                    )}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
