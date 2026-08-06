import { getAllTickets, getTicketActivities, calcEffectiveOwners } from "@/lib/hubspot";
import type { TicketActivitiesMap, EffectiveOwnerMap } from "@/lib/hubspot";
import OperativoView from "@/components/OperativoView";

export const revalidate = 600;

export default async function OperativoPage() {
  let allTickets;
  try {
    allTickets = await getAllTickets();
  } catch (err: any) {
    return (
      <div className="p-8 bg-surface border border-brugalired rounded-xl">
        <h2 className="font-serif font-bold text-xl text-brugalired mb-2">
          Error consultando HubSpot
        </h2>
        <p className="text-sm text-muted">{err.message}</p>
      </div>
    );
  }

  const fetchedAt = new Date().toISOString();

  // Responsable efectivo: quien tiene que actuar segun la ultima tarea/nota asignada.
  // Requiere traer actividades, asi que solo se calcula para los demorados (igual que /alertas).
  const delayedTickets = allTickets.filter((t) => t.isDelayed);
  const delayedIds = delayedTickets.map((t) => t.id);

  let activitiesMap: TicketActivitiesMap = new Map();
  try {
    activitiesMap = delayedIds.length ? await getTicketActivities(delayedIds) : new Map();
  } catch {
    activitiesMap = new Map();
  }
  const effectiveOwnersMap: EffectiveOwnerMap = calcEffectiveOwners(delayedTickets, activitiesMap);

  const effectiveOwners: Record<string, { ownerName: string; reasonText: string; daysWaiting: number }> = {};
  for (const [ticketId, eff] of Array.from(effectiveOwnersMap.entries())) {
    effectiveOwners[ticketId] = {
      ownerName: eff.ownerName,
      reasonText: eff.reasonText,
      daysWaiting: eff.daysWaiting,
    };
  }

  const serialized = allTickets.map((t) => ({
    ...t,
    createdAt: t.createdAt.toISOString(),
    lastModifiedAt: t.lastModifiedAt ? t.lastModifiedAt.toISOString() : null,
    closedAt: t.closedAt ? t.closedAt.toISOString() : null,
    dueDate: t.dueDate ? t.dueDate.toISOString() : null,
  }));

  return <OperativoView tickets={serialized} fetchedAt={fetchedAt} effectiveOwners={effectiveOwners} />;
}
