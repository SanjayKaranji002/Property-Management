import { useState } from "react";
import { Building2, Mail, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { type User } from "../data";
import { L, useHref } from "../nav";
import { useStore } from "../store";
import { Modal, Page, Pill, SearchBox, Stat, Table, Td, ViaPicker } from "../ui";
import { PropertyChecklist } from "./property-picker";

type TeamRole = "manager" | "broker";
const TITLE: Record<TeamRole, string> = { manager: "Property Managers", broker: "Brokers" };

/**
 * Admin-only list of everyone in one role, the properties each one has, and
 * an Assign button. A property has one manager but can have several brokers.
 */
export function TeamPage({ role }: { role: TeamRole }) {
  const s = useStore();
  const h = useHref();
  const [q, setQ] = useState("");
  const [assigning, setAssigning] = useState<User | null>(null);
  const people = s.users.filter((u) => u.role === role && `${u.name} ${u.email} ${u.phone ?? ""}`.toLowerCase().includes(q.toLowerCase()));
  const all = s.users.filter((u) => u.role === role);
  const uncovered = s.properties.filter((p) => (role === "manager" ? !s.managersOf(p.id).length : !s.brokersOf(p.id).length));
  const allAccess = role === "manager" ? all.filter((u) => u.property_access !== "selected").length : 0;

  return (
    <Page title={TITLE[role]} meta={role === "manager" ? "One manager per property" : "A property can have several brokers"}>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat label={TITLE[role]} value={all.length} sub={role === "manager" && allAccess ? `${allAccess} with access to all properties` : undefined} />
        <Stat label={role === "manager" ? "Properties without a manager" : "Properties without a broker"} value={uncovered.length} tone={uncovered.length ? "warn" : "good"} />
        <Stat label="Properties" value={s.properties.length} />
      </div>
      <SearchBox value={q} onChange={setQ} placeholder={`Search ${TITLE[role].toLowerCase()}`} />
      <Table head={["Name", "Contact", "Properties", ""]} empty={!people.length}>
        {people.map((u) => {
          const mine = s.properties.filter((p) => u.property_ids?.includes(p.id));
          const everything = role === "manager" && u.property_access !== "selected";
          return (
            <tr key={u.id}>
              <Td className="font-medium">{u.name}{!u.active && <> <Pill>Disabled</Pill></>}</Td>
              <Td><div className="flex items-center gap-1.5 text-xs"><Mail className="h-3 w-3 text-muted-foreground" />{u.email}</div>{u.phone && <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Phone className="h-3 w-3" />{u.phone}</div>}</Td>
              <Td className="max-w-md">
                {everything ? <Pill tone="blue">All properties</Pill>
                  : mine.length === 0 ? <span className="text-xs text-muted-foreground">None assigned</span>
                  : <div className="flex flex-wrap gap-1">
                      {mine.slice(0, 4).map((p) => <span key={p.id} className="rounded-full bg-muted px-2 py-0.5 text-xs"><L to={h.property(p.id)}>{s.propLabel(p.id)}</L></span>)}
                      {mine.length > 4 && <button className="rounded-full px-2 py-0.5 text-xs text-muted-foreground hover:underline" onClick={() => setAssigning(u)}>+{mine.length - 4} more</button>}
                    </div>}
              </Td>
              <Td className="text-right"><Button size="sm" variant="outline" onClick={() => setAssigning(u)}><Building2 className="h-4 w-4" />Assign properties</Button></Td>
            </tr>);
        })}
      </Table>
      <p className="text-xs text-muted-foreground">To add a new {role === "manager" ? "property manager" : "broker"}, use Users &amp; access → Users → Add user.</p>
      {assigning && <AssignDialog user={assigning} onClose={() => setAssigning(null)} />}
    </Page>
  );
}

function AssignDialog({ user, onClose }: { user: User; onClose: () => void }) {
  const s = useStore();
  const isManager = user.role === "manager";
  const [access, setAccess] = useState<"all" | "selected">(isManager ? user.property_access ?? "all" : "selected");
  const [ids, setIds] = useState<number[]>(user.property_ids ?? []);

  // The manager a property would move from (asks first), or the other brokers on it.
  const owner = (pid: number) => (isManager ? s.managersOf(pid).find((u) => u.id !== user.id)?.name : undefined);
  const note = (pid: number) => {
    if (isManager) return undefined;
    const others = s.brokersOf(pid).filter((u) => u.id !== user.id).map((u) => u.name);
    return others.length ? `also ${others.join(", ")}` : undefined;
  };
  const moving = isManager && access === "selected" ? ids.filter((pid) => s.managersOf(pid).some((u) => u.id !== user.id)).length : 0;

  function save() {
    if (isManager) s.setManagerProperties(user.id, access, ids);
    else s.saveUser({ ...user, property_ids: ids });
    const count = isManager && access === "all" ? "all properties" : `${ids.length} propert${ids.length === 1 ? "y" : "ies"}`;
    s.notify("Properties assigned", `${user.name}: ${count}${moving ? ` · ${moving} moved from another manager` : ""}`);
    s.alert("Your properties changed", `You now handle ${count}.`, { users: [user.id] });
    onClose();
  }

  return (
    <Modal wide open onClose={onClose} title={`Assign properties · ${user.name}`}
      footer={<>
        {moving > 0 && <span className="mr-auto self-center text-xs text-[#9a6a1f]">{moving} propert{moving === 1 ? "y moves" : "ies move"} from another manager</span>}
        <Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={save}>Save</Button>
      </>}>
      {isManager && (
        <div className="space-y-1">
          <ViaPicker value={access} onChange={setAccess} options={[{ value: "all", label: "All properties" }, { value: "selected", label: "Selected properties" }]} />
          <p className="text-xs text-muted-foreground">{access === "all" ? "Sees every property. Properties assigned to other managers stay with them." : "Sees only the ticked properties. Each property has one manager, so ticking one already assigned moves it here."}</p>
        </div>)}
      {access === "selected" && <PropertyChecklist ids={ids} onChange={setIds} note={note} owner={owner} assignee={user.name} />}
    </Modal>
  );
}
