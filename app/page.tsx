import { getAllTickets } from "@/lib/hubspot";
import {
  buildAreaMetrics,
  buildBranchMetrics,
  buildWeeklyTrend,
  buildQuarterStats,
  detectProductAlerts,
  lastClosedWeekRange,
  inRange,
  fmtDate,
} from "@/lib/analytics";
import KpiCard from "@/components/KpiCard";
import WeeklyTrend from "@/components/WeeklyTrend";
import Heatmap from "@/components/Heatmap";

export const revalidate = 600;

function delta(q2: number, q1: number) {
  const d = q2 - q1;
  const sign = d >= 0 ? "+" : "";
  return { text: `${sign}${d.toFixed(1)} vs Q1`, positive: d >= 0 };
}

function pctDelta(q2: number, q1: number) {
  const d = q2 - q1;
  const sign = d >= 0 ? "+" : "";
  return { text: `${sign}${d.toFixed(1)}pp vs Q1`, positive: d >= 0 };
}

export default async function ExecPage() {
  let tickets;
  try {
    tickets = await getAllTickets();
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

  const q2Tickets = tickets.filter((t) => t.quarter === 2);
  const areas = buildAreaMetrics(q2Tickets);
  const branches = buildBranchMetrics(q2Tickets);
  const trend = buildWeeklyTrend(q2Tickets);
  const alerts = detectProductAlerts(q2Tickets);
  const q1 = buildQuarterStats(tickets, 1);
  const q2 = buildQuarterStats(tickets, 2);

  const total = q2Tickets.length;
  const closed = q2Tickets.filter((t) => t.isClosed).length;
  const open = q2Tickets.filter((t) => t.isOpen).length;
  const noCorresp = q2Tickets.filter((t) => t.isNoCorresp).length;
  const delayed = q2Tickets.filter((t) => t.isDelayed).length;

  const { start, end, prevStart, prevEnd } = lastClosedWeekRange();
  const weekT = q2Tickets.filter((t) => inRange(t, start, end));
  const prevT = q2Tickets.filter((t) => inRange(t, prevStart, prevEnd));
  const wNew = weekT.length;
  const wClosed = weekT.filter((t) => t.isClosed).length;
  const pNew = prevT.length;
  const pClosed = prevT.filter((t) => t.isClosed).length;

  const areaList = Object.values(areas);
  const topConcern = areaList
    .filter((a) => a.open > 0)
    .sort((a, b) => b.delayRate - a.delayRate)
    .slice(0, 3);
  const topBranches = branches.slice(0, 3);
  const today = new Date();

  const closedWithSla = q2Tickets.filter((t) => t.isClosed && t.slaCompliant !== null);
  const slaOk = closedWithSla.filter((t) => t.slaCompliant === true).length;
  const slaRate = closedWithSla.length ? Math.round((slaOk / closedWithSla.length) * 100) : null;

  const AREA_NAMES = ["Sistemas", "Operaciones", "Administración", "Calidad", "Logística", "Marketing"];

  return (
    <div className="space-y-10">
      {/* Header */}
      <div>
        <h1 className="font-serif font-bold text-3xl text-accent">Vista ejecutiva</h1>
        <p className="text-sm text-muted mt-1">
          Q2 2026 al {fmtDate(today)} · {Math.floor((today.getTime() - Date.UTC(2026, 3, 1)) / 86400000)} días transcurridos
        </p>
      </div>

      {/* KPIs Q2 */}
      <section>
        <h2 className="font-serif font-bold text-xl text-accent mb-4">Panorama Q2</h2>
        {(() => {
          const closeRate = total ? Math.round((closed / total) * 100) : 0;
          const delayRate = open ? Math.round((delayed / open) * 100) : 0;
          return (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              <KpiCard label="Tickets Q2" value={total} sub="ingresados desde 1-abr" tone="accent" />
              <KpiCard
                label="Cerrados"
                value={closed}
                sub={`${closeRate}% tasa de cierre`}
                tone={closeRate >= 70 ? "green" : closeRate >= 50 ? "amber" : "red"}
              />
              <KpiCard
                label="Abiertos"
                value={open}
                sub={`+ ${noCorresp} en "No corresponde"`}
                tone={open > 50 ? "red" : open > 20 ? "amber" : "green"}
              />
              <KpiCard
                label="Demorados"
                value={delayed}
                sub={`${delayRate}% de los abiertos`}
                tone={delayRate >= 30 ? "red" : delayRate >= 15 ? "amber" : "green"}
              />
              <KpiCard
                label="SLA Cumplido"
                value={slaRate !== null ? `${slaRate}%` : "—"}
                sub={`${slaOk} de ${closedWithSla.length} cerrados a tiempo`}
                tone={slaRate !== null && slaRate >= 80 ? "green" : slaRate !== null && slaRate >= 60 ? "amber" : "red"}
              />
            </div>
          );
        })()}
      </section>

      {/* Semana cerrada */}
      <section>
        <h2 className="font-serif font-bold text-xl text-accent mb-4">
          Semana cerrada · {fmtDate(start)} al {fmtDate(end)}
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KpiCard
            label="Nuevos"
            value={wNew}
            sub={`${wNew - pNew >= 0 ? "↑ +" : "↓ "}${wNew - pNew} vs semana ant.`}
            tone="accent"
          />
          <KpiCard
            label="Cerrados"
            value={wClosed}
            sub={`${wClosed - pClosed >= 0 ? "↑ +" : "↓ "}${wClosed - pClosed} vs semana ant.`}
            tone="green"
          />
          <KpiCard
            label="% Cierre semana"
            value={`${wNew ? Math.round((wClosed / wNew) * 100) : 0}%`}
            tone="amber"
          />
          <KpiCard label="Alertas Calidad" value={alerts.length} tone="red" />
        </div>
      </section>

      {/* Tendencia */}
      <section>
        <WeeklyTrend data={trend} />
      </section>

      {/* Top áreas + sucursales */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-surface border border-border rounded-xl p-6">
          <h3 className="font-serif font-semibold text-sm uppercase tracking-wider text-muted mb-4">
            Top 3 áreas que requieren atención
          </h3>
          {topConcern.map((a) => (
            <div key={a.pipelineId} className="flex justify-between items-center py-2 border-b border-border last:border-0">
              <div>
                <div className="font-medium">{a.name}</div>
                <div className="text-xs text-muted">
                  {a.delayedCount} demorados · {a.open} abiertos · {Math.round(a.closeRate)}% cierre
                </div>
              </div>
              <div className="font-mono text-brugalired font-semibold text-lg">
                {Math.round(a.delayRate)}%
              </div>
            </div>
          ))}
        </div>
        <div className="bg-surface border border-border rounded-xl p-6">
          <h3 className="font-serif font-semibold text-sm uppercase tracking-wider text-muted mb-4">
            Top 3 sucursales con más tickets Q2
          </h3>
          {topBranches.map((b) => (
            <div key={b.name} className="flex justify-between items-center py-2 border-b border-border last:border-0">
              <div>
                <div className="font-medium">{b.name}</div>
                <div className="text-xs text-muted">
                  {Math.round(b.closeRate)}% cierre · {b.delayed} demorados · {b.topMotive[0]}
                </div>
              </div>
              <div className="font-mono text-accent font-semibold text-lg">{b.total}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Heatmap */}
      <section>
        <Heatmap branches={branches} />
      </section>

      {/* Tiempo resolución */}
      <section>
        <div className="bg-surface border border-border rounded-xl p-6">
          <h3 className="font-serif font-semibold text-sm uppercase tracking-wider text-muted mb-4">
            Tiempo promedio de resolución por área
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {areaList.map((a) => (
              <div key={a.pipelineId} className="text-center p-3 rounded-lg bg-surface2">
                <div className="text-xs text-muted">{a.name}</div>
                <div className="font-mono text-2xl font-semibold text-accent">
                  {a.avgResolutionDays !== null ? a.avgResolutionDays.toFixed(1) : "—"}
                </div>
                <div className="text-xs text-dim">días promedio</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Q1 vs Q2 */}
      <section>
        <h2 className="font-serif font-bold text-xl text-accent mb-4">
          Comparativo Q1 vs Q2
        </h2>
        <div className="bg-surface border border-border rounded-xl p-6 space-y-6">
          {/* Resumen general */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              {
                label: "Tickets",
                q1v: q1.total,
                q2v: q2.total,
                fmt: (v: number) => String(v),
                higherIsBetter: false,
              },
              {
                label: "% Cierre",
                q1v: q1.closeRate,
                q2v: q2.closeRate,
                fmt: (v: number) => `${v.toFixed(1)}%`,
                higherIsBetter: true,
              },
              {
                label: "Días resolución",
                q1v: q1.avgResolutionDays ?? 0,
                q2v: q2.avgResolutionDays ?? 0,
                fmt: (v: number) => v ? `${v.toFixed(1)}d` : "—",
                higherIsBetter: false,
              },
              {
                label: "SLA cumplido",
                q1v: q1.slaCompliance ?? 0,
                q2v: q2.slaCompliance ?? 0,
                fmt: (v: number) => v ? `${v.toFixed(1)}%` : "—",
                higherIsBetter: true,
              },
            ].map(({ label, q1v, q2v, fmt, higherIsBetter }) => {
              const improved = higherIsBetter ? q2v > q1v : q2v < q1v;
              const same = Math.abs(q2v - q1v) < 0.5;
              const trendColor = same ? "text-muted" : improved ? "text-brugaligreen" : "text-brugalired";
              const trendArrow = same ? "→" : improved ? "↑" : "↓";
              return (
                <div key={label} className="rounded-lg bg-surface2 p-4">
                  <div className="text-xs text-muted uppercase tracking-wider mb-2">{label}</div>
                  <div className="flex items-end gap-3">
                    <div>
                      <div className="text-xs text-dim mb-0.5">Q1</div>
                      <div className="font-mono font-semibold text-lg text-muted">{fmt(q1v)}</div>
                    </div>
                    <div className={`text-xl font-bold pb-0.5 ${trendColor}`}>{trendArrow}</div>
                    <div>
                      <div className="text-xs text-dim mb-0.5">Q2</div>
                      <div className="font-mono font-semibold text-lg text-accent">{fmt(q2v)}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Por área */}
          <div>
            <h4 className="text-xs uppercase tracking-wider text-muted font-semibold mb-3">
              Por área — % cierre y SLA
            </h4>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-surface2 text-muted uppercase tracking-wider text-xs">
                  <tr>
                    <th className="text-left py-2 px-3">Área</th>
                    <th className="text-right py-2 px-3">Q1 tickets</th>
                    <th className="text-right py-2 px-3">Q1 cierre</th>
                    <th className="text-right py-2 px-3">Q1 SLA</th>
                    <th className="text-right py-2 px-3">Q2 tickets</th>
                    <th className="text-right py-2 px-3">Q2 cierre</th>
                    <th className="text-right py-2 px-3">Q2 SLA</th>
                    <th className="text-right py-2 px-3">Tendencia cierre</th>
                  </tr>
                </thead>
                <tbody>
                  {AREA_NAMES.map((name) => {
                    const a1 = q1.byArea[name];
                    const a2 = q2.byArea[name];
                    if (!a1 || !a2) return null;
                    const diff = a2.closeRate - a1.closeRate;
                    const trendColor = diff > 2 ? "text-brugaligreen" : diff < -2 ? "text-brugalired" : "text-muted";
                    const trendText = diff > 0 ? `↑ +${diff.toFixed(1)}pp` : diff < 0 ? `↓ ${diff.toFixed(1)}pp` : "→ sin cambio";
                    return (
                      <tr key={name} className="border-t border-border">
                        <td className="py-2 px-3 font-medium">{name}</td>
                        <td className="py-2 px-3 text-right font-mono text-muted">{a1.total}</td>
                        <td className="py-2 px-3 text-right font-mono text-muted">{a1.closeRate.toFixed(1)}%</td>
                        <td className="py-2 px-3 text-right font-mono text-muted">
                          {a1.slaCompliance !== null ? `${a1.slaCompliance.toFixed(1)}%` : "—"}
                        </td>
                        <td className="py-2 px-3 text-right font-mono">{a2.total}</td>
                        <td className="py-2 px-3 text-right font-mono">{a2.closeRate.toFixed(1)}%</td>
                        <td className="py-2 px-3 text-right font-mono">
                          {a2.slaCompliance !== null ? `${a2.slaCompliance.toFixed(1)}%` : "—"}
                        </td>
                        <td className={`py-2 px-3 text-right font-semibold ${trendColor}`}>
                          {trendText}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      {/* Alertas Calidad */}
      {alerts.length > 0 && (
        <section>
          <div className="bg-surface border-2 border-brugalired rounded-xl p-6">
            <h3 className="font-serif font-bold text-base text-brugalired mb-3">
              Alertas Calidad — productos críticos
            </h3>
            <ul className="space-y-2">
              {alerts.map((a) => (
                <li key={a.product} className="text-sm">
                  <strong>{a.product}</strong> · {a.count} reclamos · sucursales:{" "}
                  {a.branches.join(" · ") || "—"}
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}
    </div>
  );
}
