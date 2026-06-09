import { getAllTickets } from "@/lib/hubspot";
import {
  buildAreaMetrics,
  buildBranchMetrics,
  detectProductAlerts,
  fmtDate,
} from "@/lib/analytics";
import AreaSection from "@/components/AreaSection";
import BranchTable from "@/components/BranchTable";

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

  const tickets = allTickets.filter((t) => t.quarter === 2);
  const areas = buildAreaMetrics(tickets);
  const branches = buildBranchMetrics(tickets);
  const alerts = detectProductAlerts(tickets);
  const today = new Date();

  const areaList = Object.values(areas).filter((a) => a.total > 0);

  return (
    <div className="space-y-10">
      <div>
        <h1 className="font-serif font-bold text-3xl text-accent">Vista operativa</h1>
        <p className="text-sm text-muted mt-1">
          Q2 2026 al {fmtDate(today)} · detalle por área y sucursal con links directos a HubSpot
        </p>
      </div>

      {/* Alertas Calidad */}
      <section>
        <h2 className="font-serif font-bold text-xl text-accent mb-4">
          Calidad — productos críticos en Q2
        </h2>
        {alerts.length > 0 ? (
          <div className="bg-surface border-2 border-brugalired rounded-xl divide-y divide-border">
            {alerts.map((a) => (
              <div key={a.product} className="p-4">
                <div className="font-semibold text-base mb-1">{a.product}</div>
                <div className="text-xs text-muted mb-2">
                  Sucursales: {a.branches.join(" · ") || "sin sucursal cargada"}
                </div>
                <div className="flex gap-2 flex-wrap">
                  <span className="bg-brugalired/10 text-brugalired px-3 py-1 rounded-full text-xs font-mono">
                    {a.count} reclamos
                  </span>
                  <span className="bg-brugalired/10 text-brugalired px-3 py-1 rounded-full text-xs font-mono">
                    {a.branches.length} sucursal{a.branches.length !== 1 ? "es" : ""}
                  </span>
                </div>
                <div className="mt-3 text-xs">
                  {a.tickets.slice(0, 5).map((t) => (
                    <a
                      key={t.id}
                      href={t.hubspotUrl}
                      target="_blank"
                      rel="noopener"
                      className="inline-block mr-3 mb-1 text-accent underline decoration-dotted"
                    >
                      Ticket {t.id}
                    </a>
                  ))}
                  {a.tickets.length > 5 && (
                    <span className="text-dim">+{a.tickets.length - 5} más</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-surface border border-brugaligreen rounded-xl p-6">
            <div className="text-brugaligreen font-semibold">
              ✓ Sin productos con 3+ reclamos en Q2
            </div>
          </div>
        )}
      </section>

      {/* Detalle por área — desplegable */}
      <section>
        <div className="flex items-baseline justify-between mb-4 gap-3 flex-wrap">
          <h2 className="font-serif font-bold text-xl text-accent">Detalle por área</h2>
          <span className="text-xs text-muted">
            Cliqueá cada área para ver el detalle de tipos de ticket y demorados.
          </span>
        </div>
        <div className="space-y-3">
          {areaList.map((a) => (
            <AreaSection key={a.pipelineId} area={a} />
          ))}
        </div>
      </section>

      {/* Tabla por sucursal */}
      <section>
        <h2 className="font-serif font-bold text-xl text-accent mb-4">
          Por sucursal — Q2 acumulado
        </h2>
        <BranchTable branches={branches} />
        <p className="text-xs text-dim mt-2">
          Cliqueá la fila de una sucursal para ver el desglose por área y los tickets demorados.
          Se excluyen tickets sin sucursal asignada (código 99).
        </p>
      </section>
    </div>
  );
}
