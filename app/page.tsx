import { getQ2Tickets } from "@/lib/hubspot";
import {
  buildAreaMetrics,
  buildBranchMetrics,
  buildWeeklyTrend,
  detectProductAlerts,
  lastClosedWeekRange,
  inRange,
  fmtDate,
} from "@/lib/analytics";
import KpiCard from "@/components/KpiCard";
import WeeklyTrend from "@/components/WeeklyTrend";
import Heatmap from "@/components/Heatmap";

export const revalidate = 600; // ISR cache 10 min

export default async function ExecPage() {
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
        <p className="text-xs text-dim mt-4">
          Verificá que HUBSPOT_TOKEN esté configurado correctamente en Vercel.
        </p>
      </div>
    );
  }

  const areas = buildAreaMetrics(tickets);
  const branches = buildBranchMetrics(tickets);
  const trend = buildWeeklyTrend(tickets);
  const alerts = detectProductAlerts(tickets);

  const total = tickets.length;
  const closed = tickets.filter((t) => t.isClosed).length;
  const open = tickets.filter((t) => t.isOpen).length;
  const noCorresp = tickets.filter((t) => t.isNoCorresp).length;
  const delayed = tickets.filter((t) => t.isDelayed).length;

  const { start, end, prevStart, prevEnd } = lastClosedWeekRange();
  const weekT = tickets.filter((t) => inRange(t, start, end));
  const prevT = tickets.filter((t) => inRange(t, prevStart, prevEnd));
  const wNew = weekT.length;
  const wClosed = weekT.filter((t) => t.isClosed).length;
  const pNew = prevT.length;
  const pClosed = prevT.filter((t) => t.isClosed).length;

  // Top 3 áreas a mirar (mayor % demora s/abiertos)
  const areaList = Object.values(areas);
  const topConcern = areaList
    .filter((a) => a.open > 0)
    .sort((a, b) => b.delayRate - a.delayRate)
    .slice(0, 3);
  const topBranches = branches.slice(0, 3);
  const today = new Date();

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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard label="Tickets Q2" value={total} sub="ingresados desde 1-abr" tone="accent" />
          <KpiCard
            label="Cerrados"
            value={closed}
            sub={`${total ? Math.round((closed / total) * 100) : 0}% tasa de cierre`}
            tone="green"
          />
          <KpiCard
            label="Otro estado (abiertos)"
            value={open}
            sub={`+ ${noCorresp} en "No corresponde"`}
            tone="amber"
          />
          <KpiCard
            label="Demorados (+7d)"
            value={delayed}
            sub={`${open ? Math.round((delayed / open) * 100) : 0}% de los abiertos`}
            tone="red"
          />
        </div>
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
            sub={`${wNew - pNew >= 0 ? "↑ +" : "↓ "}${wNew - pNew} vs ${pNew}`}
            tone="accent"
          />
          <KpiCard
            label="Cerrados"
            value={wClosed}
            sub={`${wClosed - pClosed >= 0 ? "↑ +" : "↓ "}${wClosed - pClosed} vs ${pClosed}`}
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

      {/* Top áreas a mirar + sucursales más activas */}
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

      {/* Heatmap sucursal x area */}
      <section>
        <Heatmap branches={branches} />
      </section>

      {/* Tiempo de resolución por área */}
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

      {alerts.length > 0 && (
        <section>
          <div className="bg-surface border-2 border-brugalired rounded-xl p-6">
            <h3 className="font-serif font-bold text-base text-brugalired mb-3">
              🚨 Alertas Calidad — productos críticos
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
