"use client";
import { useMemo, useState } from "react";
import type { Ticket } from "@/lib/hubspot";
import {
  PRIORITY_ORDER, PRIORITY_LABELS, PRIORITY_COLORS, SLA_TARGET_DAYS,
  type PriorityLevel,
} from "@/lib/hubspot";
import {
  buildRangeStats,
  buildPriorityObjectives,
  fmtDate,
  type PriorityObjective,
} from "@/lib/analytics";
import LastUpdate from "@/components/LastUpdate";
import PeriodFilter, {
  defaultRange, startOfDay, endOfDay,
  buildQuarters, quarterStartDate, quarterEndDate, DATA_START,
} from "@/components/PeriodFilter";

type SerializedTicket = Omit<
  Ticket, "createdAt" | "lastModifiedAt" | "closedAt" | "dueDate"
> & {
  createdAt: string;
  lastModifiedAt: string | null;
  closedAt: string | null;
  dueDate: string | null;
};

function hydrate(t: SerializedTicket): Ticket {
  return {
    ...t,
    createdAt: new Date(t.createdAt),
    lastModifiedAt: t.lastModifiedAt ? new Date(t.lastModifiedAt) : null,
    closedAt: t.closedAt ? new Date(t.closedAt) : null,
    dueDate: t.dueDate ? new Date(t.dueDate) : null,
  } as Ticket;
}

const AREA_NAMES = ["Sistemas", "Operaciones", "Administración", "Calidad", "Logística", "Marketing"];

function KpiCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="rounded-xl bg-surface border border-border p-4">
      <div className="text-[10px] uppercase tracking-wider text-muted font-semibold">{label}</div>
      <div className={`font-mono text-3xl font-semibold mt-1 ${color || "text-text"}`}>{value}</div>
      {sub && <div className="text-[11px] text-muted mt-0.5">{sub}</div>}
    </div>
  );
}

export default function DireccionView({
  tickets: raw,
  fetchedAt,
}: {
  tickets: SerializedTicket[];
  fetchedAt: string;
}) {
  const allTickets = useMemo(() => raw.map(hydrate), [raw]);

  // Filtro de período (por defecto, trimestre en curso).
  const init = useMemo(() => defaultRange(new Date()), []);
  const [range, setRange] = useState<{ from: string; to: string }>({ from: init.from, to: init.to });
  const fromMs = startOfDay(new Date(range.from)).getTime();
  const toMs = endOfDay(new Date(range.to)).getTime();

  // Tickets del período (para volumen)
  const periodTickets = useMemo(
    () => allTickets.filter((t) => {
      const c = t.createdAt.getTime();
      return c >= fromMs && c <= toMs;
    }),
    [allTickets, fromMs, toMs]
  );

  // Volumen / cierre
  const total = periodTickets.length;
  const closed = periodTickets.filter((t) => t.isClosed).length;
  const open = periodTickets.filter((t) => t.isOpen).length;
  const delayed = periodTickets.filter((t) => t.isDelayed).length;
  const closeRate = total ? Math.round((closed / total) * 100) : 0;
  const slaEval = periodTickets.filter((t) => t.isClosed && t.slaCompliant !== null);
  const slaOk = slaEval.filter((t) => t.slaCompliant === true).length;
  const slaRate = slaEval.length ? Math.round((slaOk / slaEval.length) * 100) : null;

  // Tiempos y SLA por urgencia
  const objectives = useMemo(
    () => buildPriorityObjectives(allTickets, fromMs, toMs),
    [allTickets, fromMs, toMs]
  );
  const byLevel = useMemo(() => {
    const m = new Map<PriorityLevel, PriorityObjective>();
    for (const o of objectives) m.set(o.level, o);
    return m;
  }, [objectives]);

  // Comparativo por trimestre (todos los Q)
  const quarterStats = useMemo(() => {
    const qs = buildQuarters(DATA_START, new Date());
    return qs.map((q) =>
      buildRangeStats(
        allTickets,
        quarterStartDate(q.year, q.q).getTime(),
        quarterEndDate(q.year, q.q).getTime(),
        q.key,
        `Q${q.q} ${q.year}`
      )
    );
  }, [allTickets]);

  // Por área (del período)
  const areaStats = useMemo(
    () => buildRangeStats(allTickets, fromMs, toMs, "range", "período").byArea,
    [allTickets, fromMs, toMs]
  );

  const periodLabel = `${fmtDate(new Date(range.from))} al ${fmtDate(new Date(range.to))}`;

  return (
    <div className="space-y-10">
      <div>
        <h1 className="font-serif font-bold text-3xl text-accent">Dirección</h1>
        <p className="text-sm text-muted mt-1">
          Resumen ejecutivo de métricas — sin detalle de gestión operativa. Pensado para dirección y gerencia.
        </p>
        <div className="mt-2"><LastUpdate fetchedAt={fetchedAt} /></div>
      </div>

      {/* FILTRO DE PERÍODO */}
      <PeriodFilter
        onChange={(from, to) => setRange({ from, to })}
        rightInfo={<>Período: <strong className="text-text font-semibold">{periodLabel}</strong> · <strong className="font-mono text-text">{total}</strong> tickets</>}
      />

      {/* 1. VOLUMEN Y CIERRE */}
      <section>
        <h2 className="font-serif font-bold text-xl text-accent mb-4">Volumen y cierre — {periodLabel}</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          <KpiCard label="Tickets" value={String(total)} sub="ingresados en el período" />
          <KpiCard label="Cerrados" value={String(closed)} sub={`${closeRate}% de cierre`} color={closeRate >= 75 ? "text-brugaligreen" : closeRate >= 50 ? "text-brugaliamber" : "text-brugalired"} />
          <KpiCard label="Abiertos" value={String(open)} sub="sin cerrar" />
          <KpiCard label="Demorados" value={String(delayed)} sub="+7 días abiertos" color={delayed === 0 ? "text-brugaligreen" : delayed >= 5 ? "text-brugalired" : "text-brugaliamber"} />
          <KpiCard label="SLA cumplido" value={slaRate === null ? "s/d" : `${slaRate}%`} sub={slaEval.length ? `sobre ${slaEval.length} cerrados con SLA` : "sin datos"} color={slaRate === null ? "text-muted" : slaRate >= 80 ? "text-brugaligreen" : slaRate >= 60 ? "text-brugaliamber" : "text-brugalired"} />
        </div>
      </section>

      {/* 2. TIEMPOS Y SLA POR URGENCIA */}
      <section>
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
          <h2 className="font-serif font-bold text-xl text-accent">Tiempos y SLA por urgencia</h2>
          <span className="text-[11px] text-dim">Mediana de días de cierre vs la meta de cada nivel.</span>
        </div>
        <div className="bg-surface border border-border rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface2 text-muted uppercase tracking-wider text-xs">
              <tr>
                <th className="text-left py-3 px-3">Urgencia</th>
                <th className="text-right py-3 px-3">Meta</th>
                <th className="text-right py-3 px-3">Mediana cierre</th>
                <th className="text-right py-3 px-3">Promedio</th>
                <th className="text-right py-3 px-3">% en SLA</th>
                <th className="text-right py-3 px-3">Cerrados</th>
                <th className="text-right py-3 px-3">Estado</th>
              </tr>
            </thead>
            <tbody>
              {PRIORITY_ORDER.map((lvl) => {
                const o = byLevel.get(lvl);
                const target = SLA_TARGET_DAYS[lvl];
                const median = o?.medianDays ?? null;
                const medianColor = median === null || target === null ? "text-text"
                  : median <= target ? "text-brugaligreen font-semibold"
                  : median <= target * 1.5 ? "text-brugaliamber"
                  : "text-brugalired font-semibold";
                return (
                  <tr key={lvl} className="border-t border-border">
                    <td className="py-2 px-3 font-medium">
                      <span className="inline-block w-2.5 h-2.5 rounded-full mr-2 align-middle" style={{ backgroundColor: PRIORITY_COLORS[lvl] }} />
                      {PRIORITY_LABELS[lvl]}
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-muted">≤ {target}d</td>
                    <td className={`py-2 px-3 text-right font-mono ${medianColor}`}>{median !== null ? `${median.toFixed(1)}d` : "—"}</td>
                    <td className="py-2 px-3 text-right font-mono text-muted">{o && o.avgDays !== null ? `${o.avgDays.toFixed(1)}d` : "—"}</td>
                    <td className="py-2 px-3 text-right font-mono">{o && o.slaHitRate !== null ? `${Math.round(o.slaHitRate)}%` : "—"}</td>
                    <td className="py-2 px-3 text-right font-mono text-muted">{o?.closedCount ?? 0}</td>
                    <td className="py-2 px-3 text-right">
                      {o?.onTarget
                        ? <span className="text-brugaligreen font-semibold">✓ En meta</span>
                        : median !== null
                        ? <span className="text-brugalired font-semibold">Fuera de meta</span>
                        : <span className="text-muted">s/d</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* 3. COMPARATIVO POR TRIMESTRE */}
      <section>
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
          <h2 className="font-serif font-bold text-xl text-accent">Comparativo por trimestre</h2>
          <span className="text-[11px] text-dim">Tendencia trimestre a trimestre. No depende del filtro.</span>
        </div>
        <div className="bg-surface border border-border rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface2 text-muted uppercase tracking-wider text-xs">
              <tr>
                <th className="text-left py-3 px-3">Trimestre</th>
                <th className="text-right py-3 px-3">Tickets</th>
                <th className="text-right py-3 px-3">% Cierre</th>
                <th className="text-right py-3 px-3">Días resolución</th>
                <th className="text-right py-3 px-3">SLA cumplido</th>
              </tr>
            </thead>
            <tbody>
              {quarterStats.map((q, i) => {
                const prev = i > 0 ? quarterStats[i - 1] : null;
                const diff = prev ? q.closeRate - prev.closeRate : null;
                const trendColor = diff === null ? "" : diff > 2 ? "text-brugaligreen" : diff < -2 ? "text-brugalired" : "text-muted";
                const isLast = i === quarterStats.length - 1;
                return (
                  <tr key={q.key} className="border-t border-border">
                    <td className={`py-2 px-3 font-medium ${isLast ? "text-accent" : ""}`}>{q.label}{isLast ? " (en curso)" : ""}</td>
                    <td className="py-2 px-3 text-right font-mono">{q.total}</td>
                    <td className={`py-2 px-3 text-right font-mono ${trendColor}`}>
                      {q.closeRate.toFixed(1)}%
                      {diff !== null && Math.abs(diff) >= 0.1 && (
                        <span className="text-[10px]"> ({diff > 0 ? "+" : ""}{diff.toFixed(1)}pp)</span>
                      )}
                    </td>
                    <td className="py-2 px-3 text-right font-mono">{q.avgResolutionDays !== null ? `${q.avgResolutionDays.toFixed(1)}d` : "—"}</td>
                    <td className="py-2 px-3 text-right font-mono">{q.slaCompliance !== null ? `${q.slaCompliance.toFixed(1)}%` : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* 4. POR ÁREA */}
      <section>
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
          <h2 className="font-serif font-bold text-xl text-accent">Por área — {periodLabel}</h2>
          <span className="text-[11px] text-dim">Resumen por área, sin bajar a ticket.</span>
        </div>
        <div className="bg-surface border border-border rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface2 text-muted uppercase tracking-wider text-xs">
              <tr>
                <th className="text-left py-3 px-3">Área</th>
                <th className="text-right py-3 px-3">Tickets</th>
                <th className="text-right py-3 px-3">Cerrados</th>
                <th className="text-right py-3 px-3">% Cierre</th>
                <th className="text-right py-3 px-3">Días resolución</th>
                <th className="text-right py-3 px-3">SLA cumplido</th>
              </tr>
            </thead>
            <tbody>
              {AREA_NAMES.map((name) => {
                const a = areaStats[name];
                if (!a || a.total === 0) return null;
                const rateColor = a.closeRate >= 75 ? "text-brugaligreen" : a.closeRate >= 50 ? "text-brugaliamber" : "text-brugalired";
                return (
                  <tr key={name} className="border-t border-border">
                    <td className="py-2 px-3 font-medium">{name}</td>
                    <td className="py-2 px-3 text-right font-mono">{a.total}</td>
                    <td className="py-2 px-3 text-right font-mono text-muted">{a.closed}</td>
                    <td className={`py-2 px-3 text-right font-mono ${rateColor}`}>{a.closeRate.toFixed(0)}%</td>
                    <td className="py-2 px-3 text-right font-mono">{a.avgResolutionDays !== null ? `${a.avgResolutionDays.toFixed(1)}d` : "—"}</td>
                    <td className="py-2 px-3 text-right font-mono">{a.slaCompliance !== null ? `${a.slaCompliance.toFixed(0)}%` : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
