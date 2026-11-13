import { useRef, useState, type ReactNode } from "react";
import { Download, Eye, MoreHorizontal, Search, Trash2, Upload, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DOC_LABELS, fmtDate, today, type Doc, type DocCategory, type PropertyStatus } from "./data";
import { useStore } from "./store";

export function Page({ title, meta, actions, children }: { title: ReactNode; meta?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex shrink-0 flex-wrap items-end gap-x-4 gap-y-3 px-4 pb-2 pt-5 md:px-6">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-medium tracking-tight">{title}</h1>
          {meta && <div className="mt-0.5 truncate text-sm text-muted-foreground">{meta}</div>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </header>
      <div className="min-h-0 flex-1 overflow-auto">
        <div className="mx-auto w-full max-w-7xl space-y-5 p-4 md:p-6">{children}</div>
      </div>
    </div>
  );
}

export function Card({ title, actions, children, className }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("pm-card rounded-[1.75rem] border border-border/70 bg-card", className)}>
      {(title || actions) && (
        <div className="flex items-center gap-2 px-5 pt-5">
          <h2 className="flex-1 text-[15px] font-medium">{title}</h2>
          {actions ?? <MoreHorizontal className="h-4 w-4 text-muted-foreground" />}
        </div>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

const TONES = {
  green: "bg-[#1f3d2b] text-[#f4f1ea] dark:bg-[#8fb89a] dark:text-[#14231a]",
  blue: "bg-[#e6ede6] text-[#1f3d2b] dark:bg-[#2b3a30] dark:text-[#cfe3d3]",
  amber: "bg-[#f3e8d3] text-[#7a5a24] dark:bg-[#3a3122] dark:text-[#e2c58f]",
  red: "bg-[#f6e1d8] text-[#9a3f22] dark:bg-[#3d2620] dark:text-[#f0a98e]",
  violet: "bg-[#ece6dc] text-[#5b4a33] dark:bg-[#2f2a22] dark:text-[#d8c7a8]",
  gray: "bg-muted text-muted-foreground",
} as const;
export type Tone = keyof typeof TONES;

export function Pill({ tone = "gray", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={cn("inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-medium", TONES[tone])}>{children}</span>;
}

// Colour-coded property status, used everywhere a property appears.
export const STATUS_TONE: Record<PropertyStatus, Tone> = { rented: "green", occupied: "amber", vacant: "red" };
export const STATUS_HEX: Record<PropertyStatus, string> = { rented: "#1f3d2b", occupied: "#a9874f", vacant: "#c4704f" };
export function StatusPill({ status }: { status: PropertyStatus }) {
  return <Pill tone={STATUS_TONE[status]}><span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-current opacity-80" />{status[0].toUpperCase() + status.slice(1)}</Pill>;
}

export function Stat({ label, value, sub, tone, onClick, active }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "good" | "bad" | "warn"; onClick?: () => void; active?: boolean }) {
  return (
    <div className={cn("pm-card rounded-[1.75rem] border bg-card p-5 transition-colors", active ? "border-[#1f3d2b] ring-1 ring-[#1f3d2b] dark:border-[#8fb89a] dark:ring-[#8fb89a]" : "border-border/70",
      onClick && "cursor-pointer hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring")}
      {...(onClick ? { role: "button", tabIndex: 0, "aria-pressed": !!active, onClick, onKeyDown: (e: React.KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } } } : {})}>
      <div className="text-[13px] text-muted-foreground">{label}</div>
      <div className={cn("mt-2 text-[1.9rem] font-light leading-none tracking-tight tabular-nums", tone === "good" && "text-[#1f3d2b] dark:text-[#8fb89a]", tone === "bad" && "text-[#b4532f]", tone === "warn" && "text-gold")}>{value}</div>
      {sub && <div className="mt-2 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

export function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return <div className={cn("grid gap-1", className)}><Label className="text-xs">{label}</Label>{children}</div>;
}

export function NSelect({ value, onChange, options, className }: { value: string | number; onChange: (v: string) => void; options: (string | { value: string | number; label: string })[]; className?: string }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}
      className={cn("h-10 w-full rounded-full border border-input bg-card px-4 text-sm focus:outline-none focus:ring-2 focus:ring-ring", className)}>
      {options.map((o) => typeof o === "string" ? <option key={o} value={o}>{o}</option> : <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

export function Modal({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className={cn("max-h-[90vh] overflow-y-auto rounded-[1.75rem] bg-card", wide ? "sm:max-w-3xl" : "sm:max-w-lg")}>
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        {children}
        {footer && <DialogFooter className="mt-2 gap-2">{footer}</DialogFooter>}
      </DialogContent>
    </Dialog>
  );
}

export function Table({ head, children, empty }: { head: ReactNode[]; children: ReactNode; empty?: boolean }) {
  return (
    <div className="pm-card overflow-x-auto rounded-[1.75rem] border border-border/70 bg-card px-2 py-1">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="text-left text-[12px] text-muted-foreground">
          <tr>{head.map((h, i) => <th key={i} className="px-3 pb-2 pt-3 font-normal">{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-border/70">{children}</tbody>
      </table>
      {empty && <div className="p-8 text-center text-sm text-muted-foreground">Nothing here yet.</div>}
    </div>
  );
}
export const Td = ({ children, className, ...rest }: React.TdHTMLAttributes<HTMLTableCellElement>) =>
  <td className={cn("px-3 py-3 align-middle", className)} {...rest}>{children}</td>;

// ── Charts (dependency-free SVG) ─────────────────────────────────────

export function Donut({ data, size = 140 }: { data: { label: string; value: number; color: string }[]; size?: number }) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const r = 52, c = 2 * Math.PI * r;
  let off = 0;
  return (
    <div className="flex flex-wrap items-center gap-4">
      <svg width={size} height={size} viewBox="0 0 140 140" role="img" aria-label="Status breakdown">
        <circle cx="70" cy="70" r={r} fill="none" stroke="currentColor" className="text-muted" strokeWidth="18" />
        {data.map((d) => {
          const len = (d.value / total) * c;
          const el = <circle key={d.label} cx="70" cy="70" r={r} fill="none" stroke={d.color} strokeWidth="18" strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-off} transform="rotate(-90 70 70)" />;
          off += len; return el;
        })}
        <text x="70" y="68" textAnchor="middle" className="fill-foreground text-[22px] font-semibold">{data.reduce((s, d) => s + d.value, 0)}</text>
        <text x="70" y="88" textAnchor="middle" className="fill-muted-foreground text-[11px]">total</text>
      </svg>
      <ul className="space-y-1 text-sm">
        {data.map((d) => <li key={d.label} className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: d.color }} />{d.label}<span className="ml-2 font-medium tabular-nums">{d.value}</span></li>)}
      </ul>
    </div>
  );
}

export function Bars({ data, format = (n) => String(n) }: { data: { label: string; values: { v: number; color: string; name: string }[] }[]; format?: (n: number) => string }) {
  const max = Math.max(1, ...data.map((d) => d.values.reduce((s, x) => s + x.v, 0)));
  return (
    <div className="flex h-48 items-end gap-2">
      {data.map((d) => (
        <div key={d.label} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
          <div className="flex w-full max-w-10 flex-col-reverse overflow-hidden rounded-t" style={{ height: `${(d.values.reduce((s, x) => s + x.v, 0) / max) * 100}%` }}
            title={d.values.map((x) => `${x.name}: ${format(x.v)}`).join("\n")}>
            {d.values.map((x) => <div key={x.name} style={{ flexGrow: x.v, background: x.color }} />)}
          </div>
          <div className="w-full truncate text-center text-[11px] text-muted-foreground">{d.label}</div>
        </div>
      ))}
    </div>
  );
}

// ── Documents: upload, built-in viewer, download ─────────────────────

export function DocViewer({ doc, onClose }: { doc: Doc | null; onClose: () => void }) {
  if (!doc) return null;
  const isImg = doc.mime.startsWith("image/");
  const isPdf = doc.mime === "application/pdf";
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/80 p-2 md:p-6" role="dialog" aria-label={doc.name}>
      <div className="flex items-center gap-2 pb-2 text-white">
        <span className="flex-1 truncate text-sm font-medium">{doc.name}</span>
        <a href={doc.url} download={doc.name}><Button size="sm" variant="secondary"><Download className="h-4 w-4" />Download</Button></a>
        <Button size="sm" variant="secondary" onClick={onClose}><X className="h-4 w-4" /></Button>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto rounded-lg bg-neutral-900">
        {isImg ? <img src={doc.url} alt={doc.name} className="max-h-full max-w-full object-contain" />
          : isPdf ? <iframe src={doc.url} title={doc.name} className="h-full w-full bg-white" />
          : <p className="text-sm text-white/70">Preview not available for this file type — use Download.</p>}
      </div>
    </div>
  );
}

export function DocumentsPanel({ entity, entityId, categories, canUpload = false, canDelete = false, title = "Documents" }: {
  entity: Doc["entity"]; entityId: number; categories: DocCategory[]; canUpload?: boolean; canDelete?: boolean; title?: string;
}) {
  const s = useStore();
  const [viewing, setViewing] = useState<Doc | null>(null);
  const [cat, setCat] = useState<DocCategory>(categories[0]);
  const fileRef = useRef<HTMLInputElement>(null);
  const docs = s.docs.filter((d) => d.entity === entity && d.entity_id === entityId);

  function onFiles(files: FileList | null) {
    for (const f of Array.from(files ?? [])) {
      if (f.size > 10 * 1024 * 1024) { s.notify("File too large", `${f.name} is over 10 MB.`); continue; }
      const reader = new FileReader();
      reader.onload = () => {
        s.saveDoc({ entity, entity_id: entityId, category: cat, name: f.name, mime: f.type || "application/octet-stream", url: String(reader.result), uploaded_on: today() });
        s.notify("Document uploaded", f.name);
      };
      reader.readAsDataURL(f);
    }
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <Card title={`${title} (${docs.length})`} actions={canUpload && (
      <div className="flex items-center gap-2">
        <NSelect className="h-8 w-36" value={cat} onChange={(v) => setCat(v as DocCategory)} options={categories.map((c) => ({ value: c, label: DOC_LABELS[c] }))} />
        <input ref={fileRef} type="file" multiple accept="image/*,application/pdf" className="hidden" onChange={(e) => onFiles(e.target.files)} />
        <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}><Upload className="h-4 w-4" />Upload</Button>
      </div>
    )}>
      {docs.length === 0 ? <p className="text-sm text-muted-foreground">No documents yet.</p> : (
        <ul className="divide-y divide-border">
          {docs.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
              <Pill tone="violet">{DOC_LABELS[d.category]}</Pill>
              <span className="min-w-0 flex-1 truncate">{d.name}</span>
              {d.expiry && <span className="text-xs text-muted-foreground">expires {fmtDate(d.expiry)}</span>}
              <Button size="sm" variant="ghost" onClick={() => setViewing(d)} aria-label="View"><Eye className="h-4 w-4" /></Button>
              <a href={d.url} download={d.name}><Button size="sm" variant="ghost" aria-label="Download"><Download className="h-4 w-4" /></Button></a>
              {canDelete && <Button size="sm" variant="ghost" onClick={() => s.deleteDoc(d.id)} aria-label="Delete"><Trash2 className="h-4 w-4" /></Button>}
            </li>
          ))}
        </ul>
      )}
      <DocViewer doc={viewing} onClose={() => setViewing(null)} />
    </Card>
  );
}

export function SearchBox({ value, onChange, placeholder = "Search…" }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="relative w-full sm:w-64">
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="h-10 rounded-full bg-card pl-4 pr-10" />
      <Search className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
    </div>
  );
}

// ── WhatsApp / Email / Both picker ───────────────────────────────────

export function ViaPicker<T extends string>({ value, onChange, options, size = "md" }: {
  value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; size?: "sm" | "md";
}) {
  return (
    <div role="radiogroup" className="inline-flex flex-wrap gap-1 rounded-full border border-border/70 bg-card p-1">
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)}
          className={cn("rounded-full transition-colors", size === "sm" ? "px-3 py-1 text-xs" : "px-4 py-1.5 text-sm",
            value === o.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>{o.label}</button>))}
    </div>
  );
}

// ── Uploads picked in a "new record" form, attached when it is saved ──

export interface PendingFile { name: string; mime: string; url: string; size: number; category: DocCategory; expiry?: string }

export function PendingUploads({ files, onChange, categories, title = "Documents", withExpiry = [] }: {
  files: PendingFile[]; onChange: (f: PendingFile[]) => void; categories: DocCategory[]; title?: string; withExpiry?: DocCategory[];
}) {
  const s = useStore();
  const ref = useRef<HTMLInputElement>(null);
  const [cat, setCat] = useState<DocCategory>(categories[0]);
  function add(list: FileList | null) {
    const picked = Array.from(list ?? []);
    const next: PendingFile[] = [];
    let left = picked.length;
    if (!left) return;
    for (const f of picked) {
      if (f.size > 10 * 1024 * 1024) { s.notify("File too large", `${f.name} is over 10 MB.`); if (--left === 0) onChange([...files, ...next]); continue; }
      const r = new FileReader();
      r.onload = () => { next.push({ name: f.name, mime: f.type || "application/octet-stream", url: String(r.result), size: f.size, category: cat }); if (--left === 0) onChange([...files, ...next]); };
      r.readAsDataURL(f);
    }
    if (ref.current) ref.current.value = "";
  }
  const update = (i: number, patch: Partial<PendingFile>) => onChange(files.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  return (
    <div className="rounded-[1.25rem] border border-dashed border-border p-3" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); add(e.dataTransfer.files); }}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex-1 text-sm font-medium">{title}</span>
        <NSelect className="h-8 w-40" value={cat} onChange={(v) => setCat(v as DocCategory)} options={categories.map((c) => ({ value: c, label: DOC_LABELS[c] }))} />
        <input ref={ref} type="file" multiple accept="application/pdf,image/*" className="hidden" onChange={(e) => add(e.target.files)} />
        <Button type="button" size="sm" variant="outline" onClick={() => ref.current?.click()}><Upload className="h-4 w-4" />Upload</Button>
      </div>
      {files.length === 0 ? <p className="mt-1 text-xs text-muted-foreground">Choose the document type, then upload. PDF or image, up to 10 MB. Drag and drop works too.</p> : (
        <ul className="mt-2 space-y-1.5 text-sm">{files.map((f, i) => (
          <li key={i} className="flex flex-wrap items-center gap-2">
            <NSelect className="h-8 w-36" value={f.category} onChange={(v) => update(i, { category: v as DocCategory })} options={categories.map((c) => ({ value: c, label: DOC_LABELS[c] }))} />
            <span className="min-w-0 flex-1 truncate">{f.name}</span>
            {withExpiry.includes(f.category) && <Input type="date" aria-label="Expiry date" className="h-8 w-40" value={f.expiry ?? ""} onChange={(e) => update(i, { expiry: e.target.value })} />}
            <span className="text-xs text-muted-foreground">{Math.ceil(f.size / 1024)} KB</span>
            <button type="button" aria-label={`Remove ${f.name}`} onClick={() => onChange(files.filter((_, j) => j !== i))}><X className="h-4 w-4 text-muted-foreground hover:text-foreground" /></button>
          </li>))}
        </ul>)}
    </div>
  );
}

/** Saves picked files against the record that was just created or edited. */
export function attachUploads(s: ReturnType<typeof useStore>, entity: Doc["entity"], entityId: number, files: PendingFile[]) {
  for (const f of files) s.saveDoc({ entity, entity_id: entityId, category: f.category, name: f.name, mime: f.mime, url: f.url, uploaded_on: today(), expiry: f.expiry || undefined });
  if (files.length) s.notify("Documents uploaded", `${files.length} file${files.length > 1 ? "s" : ""} attached`);
}
