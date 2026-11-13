import { useRef, useState } from "react";
import { Copy, ExternalLink, Receipt, Upload, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { aed, PROVIDER_BY_EMIRATE, today, UTIL_LABEL, type UtilityType } from "../data";
import { useStore } from "../store";
import { Field, Modal, NSelect } from "../ui";

/** Each provider's official website, where bills are paid. */
export const PROVIDER_SITE: Record<string, string> = {
  DEWA: "https://www.dewa.gov.ae",
  ADDC: "https://www.addc.ae",
  AADC: "https://www.aadc.ae",
  SEWA: "https://www.sewa.gov.ae",
  "Etihad WE": "https://www.etihadwe.ae",
};

/** Provider and account for a tenancy, from its property's emirate and the account saved on the agreement. */
export function useUtilityAccount(contractId: number) {
  const s = useStore();
  const c = s.contract(contractId);
  const p = c ? s.property(c.property_id) : undefined;
  const provider = PROVIDER_BY_EMIRATE[p?.emirate ?? ""] ?? "Other";
  return { contract: c, provider, account: c?.dewa_account ?? "", site: PROVIDER_SITE[provider] };
}

/** Opens the provider's payment site, with the account number ready to copy. */
export function PayBillButton({ contractId, amount, size = "sm" }: { contractId: number; amount?: number; size?: "sm" | "default" }) {
  const s = useStore();
  const { provider, account, site } = useUtilityAccount(contractId);
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size={size} variant="outline" onClick={() => setOpen(true)}><Zap className="h-4 w-4" />Pay bill</Button>
      {open && (
        <Modal open onClose={() => setOpen(false)} title={`Pay ${provider} bill`}
          footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Close</Button>
            {site && <Button onClick={() => { window.open(site, "_blank", "noopener,noreferrer"); }}><ExternalLink className="h-4 w-4" />Open {provider} website</Button>}</>}>
          <div className="space-y-3 text-sm">
            <div className="rounded-2xl bg-muted p-4">
              <div className="text-xs text-muted-foreground">{provider} account number</div>
              <div className="mt-1 flex items-center gap-2">
                <span className="text-2xl font-light tabular-nums">{account || "Not on file"}</span>
                {account && <Button size="sm" variant="ghost" onClick={() => { void navigator.clipboard?.writeText(account); s.notify("Copied", "Account number copied"); }}><Copy className="h-4 w-4" />Copy</Button>}
              </div>
              {amount != null && <div className="mt-2 text-muted-foreground">Amount on the bill: {aed(amount)}</div>}
            </div>
            <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
              <li>Open the {provider} website or app and choose to pay a bill (quick pay works without logging in).</li>
              <li>Paste the account number and pay.</li>
              <li>Come back here and use <b>"I've paid a bill"</b> (staff: <b>Record payment</b>) so the bill is marked paid.</li>
            </ol>
            {!site && <p className="text-xs text-muted-foreground">No website is set for this provider. Pay through the provider directly.</p>}
            {!account && <p className="text-xs text-[#9a3f22]">No account number is saved for this tenancy. Add it on the Ejari & DEWA page.</p>}
          </div>
        </Modal>)}
    </>
  );
}

/**
 * Report a bill that has been paid, without anyone adding the charge first.
 * A tenant's report needs a receipt and waits for staff to check it;
 * staff record it as paid straight away.
 */
export function ReportPaymentDialog({ contractId: fixedContract, onClose, asTenant }: { contractId?: number; onClose: () => void; asTenant?: boolean }) {
  const s = useStore();
  const tenancies = s.contracts.filter((c) => c.status === "active");
  const [contractId, setContractId] = useState<number>(fixedContract ?? tenancies[0]?.id ?? 0);
  const { provider } = useUtilityAccount(contractId);
  const [f, setF] = useState({ type: "combined" as UtilityType, period: prevMonth(), amount: 0, paid_on: today(), paid_ref: "" });
  const [file, setFile] = useState<{ name: string; mime: string; url: string } | null>(null);
  const ref = useRef<HTMLInputElement>(null);
  // Bills already on record for that month. "Electricity & water" covers separate electricity and water bills too.
  const onRecord = s.utilities.filter((u) => u.contract_id === contractId && u.period === f.period && (u.type === f.type || f.type === "combined"));
  const existing = onRecord.length ? onRecord : null;
  const recordedTotal = onRecord.reduce((t, u) => t + u.amount, 0);

  function pick(fl: File | undefined) {
    if (!fl) return;
    if (fl.size > 10 * 1024 * 1024) { s.notify("File too large", `${fl.name} is over 10 MB.`); return; }
    const r = new FileReader();
    r.onload = () => setFile({ name: fl.name, mime: fl.type || "application/octet-stream", url: String(r.result) });
    r.readAsDataURL(fl);
  }

  function save() {
    const bills = existing ? existing.filter((u) => u.status === "unpaid") : [s.saveUtility({ contract_id: contractId, type: f.type, period: f.period, amount: f.amount, status: "unpaid", provider })];
    for (const base of bills) {
      const doc = file ? s.saveDoc({ entity: "utility", entity_id: base.id, category: "utility_receipt", name: file.name, mime: file.mime, url: file.url, uploaded_on: today() }) : undefined;
      if (asTenant) s.saveUtility({ ...base, receipt_doc_id: doc?.id, receipt_status: "submitted", paid_ref: f.paid_ref || undefined, paid_on: f.paid_on });
      else s.saveUtility({ ...base, status: "paid", paid_on: f.paid_on, paid_method: "Paid to provider", paid_ref: f.paid_ref || (doc ? "Receipt attached" : undefined), paid_by: s.me.name, receipt_doc_id: doc?.id, receipt_status: doc ? "approved" : undefined });
    }
    if (asTenant) s.notify("Receipt sent", "Thank you. We'll check it and mark the bill paid.");
    else s.notify("Payment recorded", `${provider} ${UTIL_LABEL[f.type].toLowerCase()} ${f.period} · ${aed(existing ? recordedTotal : f.amount)}`);
    onClose();
  }

  const valid = contractId && f.period && (existing ? existing.some((u) => u.status === "unpaid") : f.amount > 0) && (!asTenant || file);
  return (
    <Modal open onClose={onClose} title={asTenant ? "I've paid a utility bill" : "Record a utility payment"}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button disabled={!valid} onClick={save}><Receipt className="h-4 w-4" />{asTenant ? "Send receipt" : "Record payment"}</Button></>}>
      <div className="grid grid-cols-2 gap-3">
        {!fixedContract && <Field label="Tenancy" className="col-span-2"><NSelect value={contractId} onChange={(v) => setContractId(Number(v))} options={tenancies.map((c) => ({ value: c.id, label: `${s.propLabel(c.property_id)} — ${s.tenantName(c.tenant_id)}` }))} /></Field>}
        <Field label="Bill for"><NSelect value={f.type} onChange={(v) => setF({ ...f, type: v as UtilityType })} options={[{ value: "combined", label: "Electricity & water" }, { value: "electricity", label: "Electricity" }, { value: "water", label: "Water" }]} /></Field>
        <Field label="Billing month"><Input type="month" value={f.period} onChange={(e) => setF({ ...f, period: e.target.value })} /></Field>
        {existing
          ? <p className="col-span-2 rounded-2xl bg-muted px-3 py-2 text-xs">Already on record: {existing.map((u) => `${UTIL_LABEL[u.type]} ${aed(u.amount)} (${u.status})`).join(", ")}. {existing.every((u) => u.status === "paid") ? "Nothing left to pay for this month." : asTenant ? "Your receipt will be attached to the unpaid bill(s)." : "The unpaid bill(s) will be marked paid."}</p>
          : <Field label="Amount paid (AED)"><Input type="number" value={f.amount || ""} onChange={(e) => setF({ ...f, amount: Number(e.target.value) })} /></Field>}
        <Field label="Paid on"><Input type="date" value={f.paid_on} onChange={(e) => setF({ ...f, paid_on: e.target.value })} /></Field>
        <Field label="Receipt / transaction no." className="col-span-2"><Input value={f.paid_ref} onChange={(e) => setF({ ...f, paid_ref: e.target.value })} placeholder={`From the ${provider} receipt`} /></Field>
        <div className="col-span-2 flex flex-wrap items-center gap-2 rounded-2xl border border-dashed border-border p-3">
          <input ref={ref} type="file" accept="application/pdf,image/*" className="hidden" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
          <Button type="button" size="sm" variant="outline" onClick={() => ref.current?.click()}><Upload className="h-4 w-4" />{file ? "Change receipt" : "Upload receipt"}</Button>
          <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{file ? file.name : asTenant ? "Required: a screenshot or PDF of the payment" : "Optional"}</span>
        </div>
      </div>
    </Modal>
  );
}

function prevMonth() {
  const d = new Date(); d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
