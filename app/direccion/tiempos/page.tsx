import { getAllTickets } from "@/lib/hubspot";
import DireccionView from "@/components/DireccionView";

export const revalidate = 600;

export default async function DireccionTiemposPage() {
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

  const serialized = allTickets.map((t) => ({
    ...t,
    createdAt: t.createdAt.toISOString(),
    lastModifiedAt: t.lastModifiedAt ? t.lastModifiedAt.toISOString() : null,
    closedAt: t.closedAt ? t.closedAt.toISOString() : null,
    dueDate: t.dueDate ? t.dueDate.toISOString() : null,
  }));

  return <DireccionView tickets={serialized} fetchedAt={fetchedAt} view="tiempos" />;
}
