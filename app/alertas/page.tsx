import {
  getAllTickets,
  getOwnerHistory,
  getTicketActivities,
  calcEffectiveOwners,
} from "@/lib/hubspot";
import type {
  OwnerHistoryMap,
  TicketActivitiesMap,
  EffectiveOwnerMap,
} from "@/lib/hubspot";
import SeguimientoView from "@/components/SeguimientoView";

export const revalidate = 600;

export default async function AlertasPage() {
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

  const delayedTickets = allTickets.filter((t) => t.isDelayed);
  const delayedIds = delayedTickets.map((t) => t.id);

  // Histórico de owners
  let historyMap: OwnerHistoryMap = new Map();
  try {
    historyMap = await getOwnerHistory(delayedIds);
  } catch {
    historyMap = new Map();
  }

  // Actividades del ticket
  let activitiesMap: TicketActivitiesMap = new Map();
  try {
    activitiesMap = await getTicketActivities(delayedIds);
  } catch {
    activitiesMap = new Map();
  }

  // Calcular responsable efectivo
  const effectiveOwnersMap: EffectiveOwnerMap = calcEffectiveOwners(delayedTickets, activitiesMap);

  // Serializar para el cliente
  const history: Record<string, { ownerId: string; ownerName: string; start: string; end: string | null; days: number }[]> = {};
  for (const [ticketId, entries] of Array.from(historyMap.entries())) {
    history[ticketId] = entries.map((e) => ({
      ownerId: e.ownerId,
      ownerName: e.ownerName,
      start: e.start.toISOString(),
      end: e.end ? e.end.toISOString() : null,
      days: e.days,
    }));
  }

  const activities: Record<string, {
    id: string; type: string; subject: string | null; body: string | null;
    assigneeOwnerId: string | null; assigneeOwnerName: string | null;
    timestamp: string; status: string | null;
  }[]> = {};
  for (const [ticketId, items] of Array.from(activitiesMap.entries())) {
    activities[ticketId] = items.map((a) => ({
      id: a.id,
      type: a.type,
      subject: a.subject,
      body: a.body,
      assigneeOwnerId: a.assigneeOwnerId,
      assigneeOwnerName: a.assigneeOwnerName,
      timestamp: a.timestamp.toISOString(),
      status: a.status,
    }));
  }

  const effectiveOwners: Record<string, { ownerId: string; ownerName: string; reason: string; reasonText: string; daysWaiting: number }> = {};
  for (const [ticketId, eff] of Array.from(effectiveOwnersMap.entries())) {
    effectiveOwners[ticketId] = {
      ownerId: eff.ownerId,
      ownerName: eff.ownerName,
      reason: eff.reason,
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

  return (
    <SeguimientoView
      tickets={serialized}
      fetchedAt={fetchedAt}
      ownerHistory={history}
      activities={activities}
      effectiveOwners={effectiveOwners}
    />
  );
}
