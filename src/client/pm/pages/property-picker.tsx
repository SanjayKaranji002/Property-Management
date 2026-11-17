import { useEffect, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useStore } from "../store";
import { Modal } from "../ui";

export interface Move { propertyId: number; from: string }

/** "Are you sure?" before a property changes manager. */
export function ReassignConfirm({ moves, to, onConfirm, onCancel }: { moves: Move[]; to: string; onConfirm: () => void; onCancel: () => void }) {
  const s = useStore();
  const one = moves.length === 1;
  return (
    <Modal open onClose={onCancel} title={one ? "Reassign this property?" : `Reassign ${moves.length} properties?`}
      footer={<><Button variant="ghost" onClick={onCancel}>Cancel</Button><Button onClick={onConfirm}>Yes, reassign</Button></>}>
      <p className="text-sm">{one ? "This property already has a property manager. A property can have only one, so it will move to" : "These properties already have a property manager. A property can have only one, so they will move to"} <b>{to}</b>.</p>
      <ul className="max-h-64 divide-y divide-border/70 overflow-auto rounded-2xl border border-border/70 text-sm">
        {moves.map((m) => (
          <li key={m.propertyId} className="flex flex-wrap items-center gap-2 px-3 py-2">
            <span className="min-w-0 flex-1 font-medium">{s.propLabel(m.propertyId)}</span>
            <span className="text-muted-foreground">{m.from}</span><ArrowRight className="h-3.5 w-3.5 text-muted-foreground" /><span>{to}</span>
          </li>))}
      </ul>
      <p className="text-xs text-muted-foreground">{one ? `${moves[0].from} will no longer see this property.` : "The previous managers will no longer see these properties."}</p>
    </Modal>
  );
}

/**
 * Pick properties, grouped by landlord (a group's box selects all of that
 * landlord's properties). With `owner`, ticking a property that belongs to
 * another manager first asks to confirm the reassignment.
 */
export function PropertyChecklist({ ids, onChange, note, owner, assignee = "this manager" }: {
  ids: number[]; onChange: (ids: number[]) => void;
  /** A grey hint after a property (e.g. other brokers on it). */
  note?: (propertyId: number) => string | undefined;
  /** The other manager a property would move from, if any. */
  owner?: (propertyId: number) => string | undefined;
  assignee?: string;
}) {
  const s = useStore();
  const [q, setQ] = useState("");
  const [onlySelected, setOnlySelected] = useState(false);
  const [pending, setPending] = useState<{ next: number[]; moves: Move[] } | null>(null);

  const query = q.trim().toLowerCase();
  const match = (pid: number) => { const p = s.property(pid)!; return `${s.propLabel(pid)} ${p.community} ${p.emirate}`.toLowerCase().includes(query); };
  const groups = s.landlords.map((l) => ({
    l, all: s.properties.filter((p) => p.landlord_id === l.id).map((p) => p.id),
  })).map((g) => ({ ...g, shown: g.all.filter((pid) => (!query || match(pid) || g.l.name.toLowerCase().includes(query)) && (!onlySelected || ids.includes(pid))) }))
    .filter((g) => g.shown.length);

  /** Adds properties, asking first if any would move from another manager. */
  function add(pids: number[]) {
    const next = [...new Set([...ids, ...pids])];
    const moves = pids.filter((pid) => !ids.includes(pid)).map((pid) => ({ propertyId: pid, from: owner?.(pid) ?? "" })).filter((m) => m.from);
    if (moves.length) setPending({ next, moves }); else onChange(next);
  }
  const remove = (pids: number[]) => onChange(ids.filter((x) => !pids.includes(x)));

  return (
    <div className="col-span-2 space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-medium">{ids.length} propert{ids.length === 1 ? "y" : "ies"} selected</span>
        <span className="flex-1" />
        <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={onlySelected} onChange={(e) => setOnlySelected(e.target.checked)} />Show selected only</label>
        {ids.length > 0 && <button type="button" className="text-xs text-muted-foreground hover:underline" onClick={() => onChange([])}>Clear all</button>}
      </div>
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search property, area or landlord" className="h-9" />
      <div className="max-h-72 overflow-auto rounded-2xl border border-input">
        {groups.length === 0 && <p className="p-3 text-sm text-muted-foreground">No properties match.</p>}
        {groups.map(({ l, all, shown }) => {
          const picked = all.filter((pid) => ids.includes(pid)).length;
          return (
            <div key={l.id} className="border-b border-border/70 last:border-0">
              <label className="flex cursor-pointer items-center gap-2 bg-muted/60 px-3 py-2 text-sm">
                <GroupBox state={picked === 0 ? "none" : picked === all.length ? "all" : "some"} onChange={(on) => (on ? add(all) : remove(all))} />
                <span className="font-medium">{l.name}</span>
                <span className="text-xs text-muted-foreground">{picked} of {all.length} selected · tick to select all</span>
              </label>
              <div className="grid grid-cols-1 gap-x-4 px-3 py-1.5 sm:grid-cols-2">
                {shown.map((pid) => {
                  const from = owner?.(pid); const hint = note?.(pid);
                  return (
                    <label key={pid} className="flex items-center gap-2 py-1 text-sm">
                      <input type="checkbox" checked={ids.includes(pid)} onChange={(e) => (e.target.checked ? add([pid]) : remove([pid]))} />
                      <span className="min-w-0 truncate">{s.propLabel(pid)}
                        {from && !ids.includes(pid) && <span className="text-xs text-[#9a6a1f]"> · managed by {from}</span>}
                        {hint && <span className="text-xs text-muted-foreground"> · {hint}</span>}</span>
                    </label>);
                })}
              </div>
            </div>);
        })}
      </div>
      {pending && <ReassignConfirm moves={pending.moves} to={assignee} onCancel={() => setPending(null)} onConfirm={() => { onChange(pending.next); setPending(null); }} />}
    </div>
  );
}

/** A checkbox that also shows "some selected". */
function GroupBox({ state, onChange }: { state: "none" | "some" | "all"; onChange: (on: boolean) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (ref.current) ref.current.indeterminate = state === "some"; }, [state]);
  return <input ref={ref} type="checkbox" className={cn(state === "some" && "accent-current")} checked={state === "all"} onChange={(e) => onChange(e.target.checked)} />;
}
