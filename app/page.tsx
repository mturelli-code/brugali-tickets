import { getAllTickets, getOwnerHistory } from "@/lib/hubspot";
import type { OwnerHistoryMap } from "@/lib/hubspot";
import EjecutivaView from "@/components/EjecutivaView";

export const revalidate = 600;

export default async function ExecPage() {
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
        <p className="text-xs text-dim mt-4">
          Verificá que HUBSPOT_TOKEN esté configurado correctamente en Vercel.
        </p>
      </div>
    );
  }

  const fetchedAt = new Date().toISOString();

  // Solo bajamos historial de owners para tickets DEMORADOS — son los que importan
  const delayedIds = allTickets.filter((t) => t.isDelayed).map((t) => t.id);
  let historyMap: OwnerHistoryMap = new Map();
  try {
    historyMap = await getOwnerHistory(delayedIds);
  } catch {
    historyMap = new Map();
  }

  // Serializar history para pasarlo al cliente
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

  return <EjecutivaView tickets={serialized} fetchedAt={fetchedAt} ownerHistory={history} />;
}
