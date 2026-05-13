import { getQ2Tickets } from "@/lib/hubspot";
import {
  buildAreaMetrics,
  buildBranchMetrics,
  detectProductAlerts,
  fmtDate,
} from "@/lib/analytics";

export const revalidate = 600;

export default async function OperativoPage() {
  let tickets;
  try {
    tickets = await getQ2Tickets();
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

  const areas = buildAreaMetrics(tickets);
  const branches = buildBranchMetrics(tickets);
  const alerts = detectProductAlerts(tickets);
  const today = new Date();

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

      {/* Detalle por área */}
      <section className="space-y-6">
        <h2 className="font-serif font-bold text-xl text-accent">Detalle por área</h2>
        {Object.values(areas).map((a) => (
          <div key={a.pipelineId} className="bg-surface border border-border rounded-xl p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-border pb-3 mb-4">
              <h3 className="font-serif font-bold text-xl text-accent">{a.name}</h3>
              <div className="text-xs text-muted flex gap-4 flex-wrap">
                <span>
                  Q2 <strong className="font-mono text-text">{a.total}</strong>
                </span>
                <span>
                  Cerrados <strong className="font-mono text-text">{a.closed}</strong> (
                  {Math.round(a.closeRate)}%)
                </span>
                <span>
                  Abiertos <strong className="font-mono text-text">{a.open}</strong>
                </span>
                <span>
                  Demorados <strong className="font-mono text-text">{a.delayedCount}</strong>
                </span>
              </div>
            </div>

            <h4 className="text-xs uppercase tracking-wider text-muted font-semibold mb-3">
              Tipos de ticket
            </h4>
            <div className="space-y-2 mb-6">
              {a.subjectBreakdown.slice(0, 10).map(([subj, cnt]) => {
                const max = a.subjectBreakdown[0][1];
                return (
                  <div key={subj} className="flex items-center gap-3 text-sm">
                    <span className="w-56 truncate">{subj}</span>
                    <div className="flex-1 h-1.5 bg-surface2 rounded">
                      <div
                        className="h-full bg-accent rounded"
                        style={{ width: `${(cnt / max) * 100}%` }}
                      />
                    </div>
                    <span className="font-mono text-xs text-muted w-20 text-right">
                      {cnt} ({Math.round((cnt / a.total) * 100)}%)
                    </span>
                  </div>
                );
              })}
            </div>

            {a.delayed.length > 0 ? (
              <div>
                <h4 className="text-xs uppercase tracking-wider text-brugalired font-semibold mb-2">
                  🔴 {a.delayedCount} tickets demorados (+7d)
                </h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-surface2 text-muted uppercase tracking-wider">
                      <tr>
                        <th className="text-left py-2 px-3 font-medium">Ticket</th>
                        <th className="text-left py-2 px-3 font-medium">Sucursal</th>
                        <th className="text-left py-2 px-3 font-medium">Etapa</th>
                        <th className="text-left py-2 px-3 font-medium">Ingresó</th>
                        <th className="text-right py-2 px-3 font-medium">Días</th>
                      </tr>
                    </thead>
                    <tbody>
                      {a.delayed.map((t) => (
                        <tr key={t.id} className="border-t border-border">
                          <td className="py-2 px-3">
                            <a
                              href={t.hubspotUrl}
                              target="_blank"
                              rel="noopener"
                              className="text-accent underline decoration-dotted hover:text-brugaliorange"
                            >
                              {t.subject}
                            </a>
                          </td>
                          <td className="py-2 px-3">{t.branch || "—"}</td>
                          <td className="py-2 px-3">{t.stageLabel}</td>
                          <td className="py-2 px-3">{fmtDate(t.createdAt)}</td>
                          <td className="py-2 px-3 text-right font-mono font-semibold text-brugalired">
                            {t.daysOpen}d
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="text-xs text-brugaligreen">✓ Sin tickets demorados</div>
            )}
          </div>
        ))}
      </section>

      {/* Tabla por sucursal */}
      <section>
        <h2 className="font-serif font-bold text-xl text-accent mb-4">
          Por sucursal — Q2 acumulado
        </h2>
        <div className="bg-surface border border-border rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface2 text-muted uppercase tracking-wider text-xs">
              <tr>
                <th className="text-left py-3 px-3">Sucursal</th>
                <th className="text-right py-3 px-3">Total Q2</th>
                <th className="text-right py-3 px-3">% Cierre</th>
                <th className="text-right py-3 px-3">Demorados</th>
                <th className="text-left py-3 px-3">Desglose por área</th>
                <th className="text-left py-3 px-3">Motivo predominante</th>
                <th className="text-left py-3 px-3">Última actualización</th>
              </tr>
            </thead>
            <tbody>
              {branches.slice(0, 20).map((b) => {
                const cierreColor =
                  b.closeRate >= 75
                    ? "text-brugaligreen"
                    : b.closeRate >= 50
                    ? "text-brugaliamber"
                    : "text-brugalired";
                const lastTxt =
                  b.daysSinceActivity === null
                    ? "—"
                    : b.daysSinceActivity === 0
                    ? "hoy"
                    : b.daysSinceActivity <= 7
                    ? `hace ${b.daysSinceActivity}d`
                    : `hace ${b.daysSinceActivity}d ⚠`;
                const lastColor = (b.daysSinceActivity || 0) > 7 ? "text-brugaliamber" : "text-text";
                return (
                  <tr key={b.name} className="border-t border-border">
                    <td className="py-2 px-3 font-medium">{b.name}</td>
                    <td className="py-2 px-3 text-right font-mono">{b.total}</td>
                    <td className={`py-2 px-3 text-right font-mono font-semibold ${cierreColor}`}>
                      {Math.round(b.closeRate)}%
                    </td>
                    <td className="py-2 px-3 text-right font-mono">
                      {b.delayed > 0 ? (
                        <span className="text-brugalired font-semibold">{b.delayed}</span>
                      ) : (
                        0
                      )}
                    </td>
                    <td className="py-2 px-3 text-xs">
                      {Object.entries(b.byArea)
                        .sort((a, b) => b[1] - a[1])
                        .map(([area, n]) => (
                          <span
                            key={area}
                            className="inline-block bg-surface2 text-muted px-2 py-0.5 rounded-full mr-1 mb-1 font-mono text-[10px]"
                          >
                            {area}: {n}
                          </span>
                        ))}
                    </td>
                    <td className="py-2 px-3 text-xs">
                      {b.topMotive[0]} ({b.topMotive[1]})
                    </td>
                    <td className={`py-2 px-3 text-xs ${lastColor}`}>{lastTxt}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-dim mt-2">
          Se excluyen tickets sin sucursal asignada (código &quot;99&quot;).
        </p>
      </section>
    </div>
  );
}
