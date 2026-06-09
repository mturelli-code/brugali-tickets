import { getAllTickets } from "@/lib/hubspot";
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

  // Serializar fechas para pasar a client
  const serialized = allTickets.map((t) => ({
    ...t,
    createdAt: t.createdAt.toISOString(),
    lastModifiedAt: t.lastModifiedAt ? t.lastModifiedAt.toISOString() : null,
    closedAt: t.closedAt ? t.closedAt.toISOString() : null,
    dueDate: t.dueDate ? t.dueDate.toISOString() : null,
  }));

  return <EjecutivaView tickets={serialized} />;
}
