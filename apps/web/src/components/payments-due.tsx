import { fmtDate, formatFull } from "@pinnacle/shared";
import { Button, MoneyText, Pill } from "@pinnacle/ui";
import { MessageCircle } from "lucide-react";
import { Link } from "react-router";
import { invoiceStage, paymentsDue, whatsappReminder } from "../data/finance";
import { useAccess, useCrm, useWorkspace } from "../data/store";
import { STAGE_TONE } from "./deal/deal-money";

/** Payment stages to chase this week: overdue first. Invoice them, or send the client a WhatsApp reminder. */
export function PaymentsDue({ limit = 8 }: { limit?: number }) {
  const s = useCrm();
  const studio = useWorkspace();
  const canInvoice = useAccess("finance") === "edit";
  const due = paymentsDue(s.deals, s.invoices);
  return (
    <section>
      <h2 className="t-eyebrow m-0 mb-2 text-ink-2">Payments due · {due.length}</h2>
      {!due.length ? (
        <p className="t-dense m-0 text-ink-3">Nothing due this week. Payment stages come from accepted quotations or a deal's payment schedule.</p>
      ) : (
        <ul className="m-0 list-none border-t border-line p-0">
          {due.slice(0, limit).map(({ deal, item, state, amountPaise }) => {
            const company = s.companies.find((c) => c.id === deal.companyId);
            const contact = s.contacts.find((c) => c.id === deal.contactId) ?? s.contacts.find((c) => c.companyId === deal.companyId);
            const inv = item.invoiceId ? s.invoices.find((i) => i.id === item.invoiceId) : undefined;
            const text = `Hello ${contact?.name?.split(" ")[0] ?? ""}, a gentle reminder from ${studio.studioName}: ${item.label.toLowerCase()} of ${formatFull(amountPaise)}${inv ? ` (invoice ${inv.number})` : ""} is due${item.dueDate ? ` by ${fmtDate(item.dueDate)}` : ""}. Thank you!`;
            return (
              <li key={`${deal.id}-${item.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line py-2.5">
                <span className="min-w-0 flex-1 basis-[200px]">
                  <Link to={`/deals/${deal.id}`} className="t-dense block truncate font-medium hover:underline">{company?.name ?? deal.title}</Link>
                  <span className="text-[11.5px] text-ink-3">{item.label}{item.dueDate ? ` · ${fmtDate(item.dueDate)}` : ""}{inv ? ` · ${inv.number}` : ""}</span>
                </span>
                <MoneyText paise={amountPaise} />
                <Pill tone={STAGE_TONE[state]}>{state[0]!.toUpperCase() + state.slice(1)}</Pill>
                {!inv && canInvoice && <Button size="sm" onClick={() => void invoiceStage(deal.id, item.id)}>Invoice</Button>}
                {contact?.phone && (
                  <Button size="sm" variant="ghost" asChild>
                    <a href={whatsappReminder(contact.phone, text)} target="_blank" rel="noreferrer"><MessageCircle strokeWidth={1.5} /> Remind</a>
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
