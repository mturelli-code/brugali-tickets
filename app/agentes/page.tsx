import { getAllTickets, getOwnerHistory } from "@/lib/hubspot";
import type { OwnerHistoryMap } from "@/lib/hubspot";
import AgentesView from "@/components/AgentesView";

export const revalidate = 600;

export default async function AgentesPage() {
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

  // Para métricas profundas necesitamos history de TODOS los tickets Q2 con historial
  // de owner, no solo demorados. Pero traer todo es caro: traemos solo demorados +
  // cerrados Q2 con muchos owners (los más relevantes para análisis).
  // Por simplicidad y rendimiento, mantenemos solo demorados (igual que en /alertas).
  const delayedIds = allTickets.filter((t) => t.isDelayed || t.isClosed).slice(0, 100).map((t) => t.id);

  let historyMap: OwnerHistoryMap = new Map();
  try {
    historyMap = await getOwnerHistory(delayedIds);
  } catch {
    historyMap = new Map();
  }

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

  const serialized = allTickets.map((t) => ({
    ...t,
    createdAt: t.createdAt.toISOString(),
    lastModifiedAt: t.lastModifiedAt ? t.lastModifiedAt.toISOString() : null,
    closedAt: t.closedAt ? t.closedAt.toISOString() : null,
    dueDate: t.dueDate ? t.dueDate.toISOString() : null,
  }));

  return <AgentesView tickets={serialized} fetchedAt={fetchedAt} ownerHistory={history} />;
}
