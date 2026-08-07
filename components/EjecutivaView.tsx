"use client";
import { useState, useMemo } from "react";
import type { Ticket, OwnerHistoryEntry, OwnerHistoryMap } from "@/lib/hubspot";
import {
  buildAreaMetrics,
  buildBranchMetrics,
  buildWeeklyTrend,
  buildRangeStats,
  detectProductAlerts,
  lastClosedWeekRange,
  inRange,
  fmtDate,
  buildAgentMetrics,
  breakdownDelay,
} from "@/lib/analytics";
import { DELAY_COLORS, DELAY_LABELS } from "@/lib/hubspot";
import KpiCard from "@/components/KpiCard";
import WeeklyTrend from "@/components/WeeklyTrend";
import Heatmap from "@/components/Heatmap";
import LastUpdate from "@/components/LastUpdate";
import PeriodFilter, {
  defaultRange,
  buildQuarters,
  quarterStartDate,
  quarterEndDate,
  DATA_START,
} from "@/components/PeriodFilter";

type SerializedTicket = Omit<
  Ticket,
  "createdAt" | "lastModifiedAt" | "closedAt" | "dueDate"
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

function toInputDate(d: Date) {
  return d.toISOString().slice(0, 10);
}
function startOfDay(d: Date) {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}
function endOfDay(d: Date) {
  const x = new Date(d);
  x.setUTCHours(23, 59, 59, 999);
  return x;
}

const Q2_START = new Date(Date.UTC(2026, 3, 1));

const AREA_NAMES = ["Sistemas", "Operaciones", "Administración", "Calidad", "Logística", "Marketing"];

type SerializedHistoryEntry = {
  ownerId: string;
  ownerName: string;
  start: string;
  end: string | null;
  days: number;
};

export default function EjecutivaView({
  tickets: raw,
  fetchedAt,
  ownerHistory = {},
}: {
  tickets: SerializedTicket[];
  fetchedAt: string;
  ownerHistory?: Record<string, SerializedHistoryEntry[]>;
}) {
  const allTickets = useMemo(() => raw.map(hydrate), [raw]);
  const today = new Date();

  // Hidratar history serializado
  const historyMap: OwnerHistoryMap = useMemo(() => {
    const m: OwnerHistoryMap = new Map();
    for (const [ticketId, entries] of Object.entries(ownerHistory)) {
      m.set(
        ticketId,
        entries.map((e) => ({
          ownerId: e.ownerId,
          ownerName: e.ownerName,
          start: new Date(e.start),
          end: e.end ? new Date(e.end) : null,
          days: e.days,
        }))
      );
    }
    return m;
  }, [ownerHistory]);

  // Filtro de período (por defecto, trimestre en curso). El componente maneja
  // los presets dinámicos de trimestres; acá guardamos el rango elegido.
  const initRange = useMemo(() => defaultRange(new Date()), []);
  const [range, setRange] = useState<{ from: string; to: string }>({ from: initRange.from, to: initRange.to });
  const startDate = range.from;
  const endDate = range.to;

  // Tickets en el rango filtrado
  const filteredTickets = useMemo(() => {
    const from = startOfDay(new Date(startDate));
    const to = endOfDay(new Date(endDate));
    return allTickets.filter((t) => t.createdAt >= from && t.createdAt <= to);
  }, [allTickets, startDate, endDate]);

  // Q2 completo (para la tendencia y Q1 vs Q2)
  const q2Tickets = useMemo(() => allTickets.filter((t) => t.quarter === 2), [allTickets]);

  // Métricas del rango filtrado
  const areas = useMemo(() => buildAreaMetrics(filteredTickets), [filteredTickets]);
  const branches = useMemo(() => buildBranchMetrics(filteredTickets), [filteredTickets]);
  const alerts = useMemo(() => detectProductAlerts(filteredTickets), [filteredTickets]);
  // Tendencia siempre Q2 completo
  const trend = useMemo(() => buildWeeklyTrend(q2Tickets), [q2Tickets]);
  // Comparativo dinámico: stats por cada trimestre con datos (todos lado a lado).
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

  const total = filteredTickets.length;
  const closed = filteredTickets.filter((t) => t.isClosed).length;
  const open = filteredTickets.filter((t) => t.isOpen).length;
  const noCorresp = filteredTickets.filter((t) => t.isNoCorresp).length;
  const delayed = filteredTickets.filter((t) => t.isDelayed).length;

  // Semana cerrada (sobre TODOS los Q2, siempre semana actual)
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

  const closedWithSla = filteredTickets.filter((t) => t.isClosed && t.slaCompliant !== null);
  const slaOk = closedWithSla.filter((t) => t.slaCompliant === true).length;
  const slaRate = closedWithSla.length ? Math.round((slaOk / closedWithSla.length) * 100) : null;

  const periodLabel = `${fmtDate(new Date(startDate))} al ${fmtDate(new Date(endDate))}`;

  return (
    <div className="space-y-10">
      <div>
        <h1 className="font-serif font-bold text-3xl text-accent">Vista ejecutiva</h1>
        <p className="text-sm text-muted mt-1">
          Panorama del service desk · datos al {fmtDate(today)}
        </p>
        <div className="mt-2"><LastUpdate fetchedAt={fetchedAt} /></div>
      </div>

      {/* PANEL DE FILTRO DE PERÍODO */}
      <PeriodFilter
        onChange={(from, to) => setRange({ from, to })}
        rightInfo={<>Filtro aplicado: <strong className="text-text font-semibold">{periodLabel}</strong> · <strong className="font-mono text-text">{total}</strong> tickets</>}
      />

      {/* KPIs del período */}
      <section>
        <h2 className="font-serif font-bold text-xl text-accent mb-4">
          Panorama — {periodLabel}
        </h2>
        {(() => {
          const closeRate = total ? Math.round((closed / total) * 100) : 0;
          const delayRate = open ? Math.round((delayed / open) * 100) : 0;
          return (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              <KpiCard label="Tickets" value={total} sub={`del ${fmtDate(new Date(startDate))} al ${fmtDate(new Date(endDate))}`} tone="accent" />
              <KpiCard label="Cerrados" value={closed} sub={`${closeRate}% tasa de cierre`}
                tone={closeRate >= 70 ? "green" : closeRate >= 50 ? "amber" : "red"} />
              <KpiCard label="Abiertos" value={open} sub={`+ ${noCorresp} en "No corresponde"`}
                tone={open > 50 ? "red" : open > 20 ? "amber" : "green"} />
              <KpiCard label="Demorados" value={delayed} sub={`${delayRate}% de los abiertos`}
                tone={delayRate >= 30 ? "red" : delayRate >= 15 ? "amber" : "green"} />
              <KpiCard label="SLA Cumplido" value={slaRate !== null ? `${slaRate}%` : "—"}
                sub={`${slaOk} de ${closedWithSla.length} cerrados a tiempo`}
                tone={slaRate !== null && slaRate >= 80 ? "green" : slaRate !== null && slaRate >= 60 ? "amber" : "red"} />
            </div>
          );
        })()}
      </section>

      {/* Semana cerrada (fijo) */}
      <section>
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
          <h2 className="font-serif font-bold text-xl text-accent">
            Semana cerrada · {fmtDate(start)} al {fmtDate(end)}
          </h2>
          <span className="text-[11px] text-dim">No depende del filtro de período — siempre la última semana cerrada.</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KpiCard label="Nuevos" value={wNew}
            sub={`${wNew - pNew >= 0 ? "↑ +" : "↓ "}${wNew - pNew} vs semana ant.`} tone="accent" />
          <KpiCard label="Cerrados" value={wClosed}
            sub={`${wClosed - pClosed >= 0 ? "↑ +" : "↓ "}${wClosed - pClosed} vs semana ant.`} tone="green" />
          <KpiCard label="% Cierre semana" value={`${wNew ? Math.round((wClosed / wNew) * 100) : 0}%`} tone="amber" />
          <KpiCard label="Alertas Calidad" value={alerts.length} tone="red" />
        </div>
      </section>

      {/* Resumen de demoras — respeta el filtro de fecha */}
      {(() => {
        const allDelayed = filteredTickets.filter((t) => t.isDelayed);
        if (allDelayed.length === 0) return null;
        const bd = breakdownDelay(allDelayed);
        return (
          <section>
            <h2 className="font-serif font-bold text-xl text-accent mb-4">Resumen de demoras — {periodLabel}</h2>
            <div className="bg-surface border border-border rounded-xl p-5">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-xl bg-surface2 p-4 border-t-2 border-text">
                  <div className="text-[10px] uppercase tracking-wider text-muted font-semibold">Demorados totales</div>
                  <div className="font-mono text-3xl font-semibold text-text mt-1">{bd.total}</div>
                  <div className="text-[11px] text-muted">+ 7 días sin cerrar</div>
                </div>
                <div className="rounded-xl bg-surface2 p-4" style={{ borderTopWidth: 2, borderTopColor: DELAY_COLORS.internal_waiting, borderTopStyle: "solid" }}>
                  <div className="text-[10px] uppercase tracking-wider text-muted font-semibold">🔴 Bloqueados por otra área</div>
                  <div className="font-mono text-3xl font-semibold mt-1" style={{ color: DELAY_COLORS.internal_waiting }}>{bd.internal_waiting}</div>
                  <div className="text-[11px] text-muted">Necesitan escalamiento</div>
                </div>
                <div className="rounded-xl bg-surface2 p-4" style={{ borderTopWidth: 2, borderTopColor: DELAY_COLORS.internal_working, borderTopStyle: "solid" }}>
                  <div className="text-[10px] uppercase tracking-wider text-muted font-semibold">🟢 En el embudo</div>
                  <div className="font-mono text-3xl font-semibold mt-1" style={{ color: DELAY_COLORS.internal_working }}>{bd.internal_working + bd.internal_unassigned}</div>
                  <div className="text-[11px] text-muted">En progreso o sin asignar</div>
                </div>
                <div className="rounded-xl bg-surface2 p-4" style={{ borderTopWidth: 2, borderTopColor: DELAY_COLORS.external, borderTopStyle: "solid" }}>
                  <div className="text-[10px] uppercase tracking-wider text-muted font-semibold">🟠 Esperando local</div>
                  <div className="font-mono text-3xl font-semibold mt-1" style={{ color: DELAY_COLORS.external }}>{bd.external}</div>
                  <div className="text-[11px] text-muted">Pelota afuera de Brugali</div>
                </div>
              </div>
              {/* Barra apilada */}
              <div className="mt-4">
                <div className="flex w-full h-3 rounded overflow-hidden bg-surface2">
                  {(["internal_waiting", "internal_unassigned", "internal_working", "external"] as const).map((src) => {
                    const n = bd[src];
                    if (n === 0) return null;
                    return (
                      <div key={src} title={`${DELAY_LABELS[src]}: ${n}`} style={{ width: `${(n / bd.total) * 100}%`, backgroundColor: DELAY_COLORS[src] }} />
                    );
                  })}
                </div>
                <div className="flex flex-wrap gap-3 mt-2 text-[10px] text-muted">
                  {(["internal_waiting", "internal_unassigned", "internal_working", "external"] as const).map((src) => {
                    const n = bd[src];
                    if (n === 0) return null;
                    return (
                      <span key={src} className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: DELAY_COLORS[src] }} />
                        {DELAY_LABELS[src]}: <strong className="text-text">{n}</strong> ({Math.round((n / bd.total) * 100)}%)
                      </span>
                    );
                  })}
                </div>
              </div>
              <p className="text-[11px] text-dim mt-3">
                El detalle ticket por ticket y a quién hay que empujar para cada uno está en la pestaña <strong>Seguimiento</strong>.
              </p>
            </div>
          </section>
        );
      })()}

      {/* Tendencia Q2 (fijo) */}
      <section>
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
          <h2 className="font-serif font-bold text-xl text-accent">Tendencia semanal Q2</h2>
          <span className="text-[11px] text-dim">No depende del filtro de período — siempre Q2 completo.</span>
        </div>
        <WeeklyTrend data={trend} />
      </section>

      {/* Top áreas + sucursales (filtrado) */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-surface border border-border rounded-xl p-6">
          <h3 className="font-serif font-semibold text-sm uppercase tracking-wider text-muted mb-4">
            Top 3 áreas que requieren atención
          </h3>
          {topConcern.length === 0 ? (
            <div className="text-muted text-sm">Sin áreas con tickets abiertos en el período.</div>
          ) : (
            topConcern.map((a) => (
              <div key={a.pipelineId} className="flex justify-between items-center py-2 border-b border-border last:border-0">
                <div>
                  <div className="font-medium">{a.name}</div>
                  <div className="text-xs text-muted">
                    {a.delayedCount} demorados · {a.open} abiertos · {Math.round(a.closeRate)}% cierre
                  </div>
                </div>
                <div className="font-mono text-brugalired font-semibold text-lg">{Math.round(a.delayRate)}%</div>
              </div>
            ))
          )}
        </div>
        <div className="bg-surface border border-border rounded-xl p-6">
          <h3 className="font-serif font-semibold text-sm uppercase tracking-wider text-muted mb-4">
            Top 3 sucursales con más tickets
          </h3>
          {topBranches.length === 0 ? (
            <div className="text-muted text-sm">Sin sucursales con tickets en el período.</div>
          ) : (
            topBranches.map((b) => (
              <div key={b.name} className="flex justify-between items-center py-2 border-b border-border last:border-0">
                <div>
                  <div className="font-medium">{b.name}</div>
                  <div className="text-xs text-muted">
                    {Math.round(b.closeRate)}% cierre · {b.delayed} demorados · {b.topMotive[0]}
                  </div>
                </div>
                <div className="font-mono text-accent font-semibold text-lg">{b.total}</div>
              </div>
            ))
          )}
        </div>
      </section>

      {/* Heatmap (filtrado) */}
      {branches.length > 0 && (
        <section>
          <Heatmap branches={branches} />
        </section>
      )}

      {/* Tiempo resolución (filtrado) */}
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

      {/* Por agente — MOVIDO A PESTAÑA "AGENTES" */}
      {false && (
      <section>
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
          <h2 className="font-serif font-bold text-xl text-accent">Por agente</h2>
          <span className="text-[11px] text-dim">Calculado sobre Q2 completo (no se filtra por período).</span>
        </div>
        {(() => {
          const agents = buildAgentMetrics(q2Tickets, historyMap).slice(0, 12);
          if (agents.length === 0) {
            return (
              <div className="bg-surface border border-border rounded-xl p-6 text-center text-muted text-sm">
                Sin agentes asignados en el período.
              </div>
            );
          }
          return (
            <div className="bg-surface border border-border rounded-xl overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-surface2 text-muted uppercase tracking-wider text-xs">
                  <tr>
                    <th className="text-left py-3 px-3">Agente</th>
                    <th className="text-right py-3 px-3">Carga actual</th>
                    <th className="text-right py-3 px-3">Demorados</th>
                    <th className="text-right py-3 px-3">Cerrados Q2</th>
                    <th className="text-right py-3 px-3">Tiempo resolución</th>
                    <th className="text-right py-3 px-3">Días promedio sosteniendo</th>
                    <th className="text-right py-3 px-3">Días acumulados</th>
                  </tr>
                </thead>
                <tbody>
                  {agents.map((a) => {
                    const delayedTone = a.totalDelayed >= 5 ? "text-brugalired" : a.totalDelayed >= 2 ? "text-brugaliamber" : "text-muted";
                    const holdingTone = (a.avgDaysHolding ?? 0) > 10 ? "text-brugalired" : (a.avgDaysHolding ?? 0) > 5 ? "text-brugaliamber" : "text-text";
                    return (
                      <tr key={a.ownerId} className="border-t border-border">
                        <td className="py-2 px-3">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-accent/10 text-accent flex items-center justify-center font-bold text-xs flex-shrink-0">
                              {a.ownerName.charAt(0).toUpperCase()}
                            </div>
                            <span className="font-medium">{a.ownerName}</span>
                          </div>
                        </td>
                        <td className="py-2 px-3 text-right font-mono font-semibold">{a.totalOpen}</td>
                        <td className={`py-2 px-3 text-right font-mono font-semibold ${delayedTone}`}>{a.totalDelayed || "—"}</td>
                        <td className="py-2 px-3 text-right font-mono text-muted">{a.totalClosedQ2 || "—"}</td>
                        <td className="py-2 px-3 text-right font-mono text-muted">
                          {a.avgResolutionDays !== null ? `${a.avgResolutionDays.toFixed(1)}d` : "—"}
                        </td>
                        <td className={`py-2 px-3 text-right font-mono ${holdingTone}`}>
                          {a.avgDaysHolding !== null ? `${a.avgDaysHolding.toFixed(1)}d` : "—"}
                        </td>
                        <td className="py-2 px-3 text-right font-mono text-muted">
                          {a.totalDaysAccumulated > 0 ? `${a.totalDaysAccumulated}d` : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          );
        })()}
        <p className="text-[11px] text-dim mt-2">
          <strong>Carga actual</strong>: tickets abiertos asignados al agente. <strong>Días promedio sosteniendo</strong>: días promedio que el agente tuvo los tickets demorados antes de soltarlos o resolverlos (basado en historial de cambios de responsable). <strong>Días acumulados</strong>: suma total de días que el agente tuvo demorados pasando por sus manos.
        </p>
      </section>
      )}

      {/* Comparativo dinámico por trimestre (todos los Q lado a lado) */}
      <section>
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
          <h2 className="font-serif font-bold text-xl text-accent">Comparativo por trimestre</h2>
          <span className="text-[11px] text-dim">No depende del filtro — cada Q aparece solo cuando entra en curso.</span>
        </div>
        <div className="bg-surface border border-border rounded-xl p-6 space-y-6">
          {/* Resumen por trimestre */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface2 text-muted uppercase tracking-wider text-xs">
                <tr>
                  <th className="text-left py-2 px-3">Trimestre</th>
                  <th className="text-right py-2 px-3">Tickets</th>
                  <th className="text-right py-2 px-3">% Cierre</th>
                  <th className="text-right py-2 px-3">Días resolución</th>
                  <th className="text-right py-2 px-3">SLA cumplido</th>
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
                      <td className={`py-2 px-3 font-medium ${isLast ? "text-accent" : ""}`}>
                        {q.label}{isLast ? " (en curso)" : ""}
                      </td>
                      <td className="py-2 px-3 text-right font-mono">{q.total}</td>
                      <td className={`py-2 px-3 text-right font-mono ${trendColor}`}>
                        {q.closeRate.toFixed(1)}%
                        {diff !== null && Math.abs(diff) >= 0.1 && (
                          <span className="text-[10px]"> ({diff > 0 ? "+" : ""}{diff.toFixed(1)}pp)</span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-right font-mono">
                        {q.avgResolutionDays !== null ? `${q.avgResolutionDays.toFixed(1)}d` : "—"}
                      </td>
                      <td className="py-2 px-3 text-right font-mono">
                        {q.slaCompliance !== null ? `${q.slaCompliance.toFixed(1)}%` : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* % cierre por área y trimestre */}
          <div>
            <h4 className="text-xs uppercase tracking-wider text-muted font-semibold mb-3">
              % cierre por área y trimestre
            </h4>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-surface2 text-muted uppercase tracking-wider text-xs">
                  <tr>
                    <th className="text-left py-2 px-3">Área</th>
                    {quarterStats.map((q) => (
                      <th key={q.key} className="text-right py-2 px-3">{q.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {AREA_NAMES.map((name) => {
                    const cells = quarterStats.map((q) => q.byArea[name]);
                    if (cells.every((c) => !c || c.total === 0)) return null;
                    return (
                      <tr key={name} className="border-t border-border">
                        <td className="py-2 px-3 font-medium">{name}</td>
                        {cells.map((c, i) => (
                          <td key={i} className="py-2 px-3 text-right font-mono">
                            {c && c.total > 0 ? (
                              <>
                                {c.closeRate.toFixed(0)}%
                                <span className="text-dim text-[10px]"> ({c.total})</span>
                              </>
                            ) : (
                              "—"
                            )}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-dim mt-2">Cada celda: % de cierre y, entre paréntesis, la cantidad de tickets del trimestre.</p>
          </div>
        </div>
      </section>
    </div>
  );
}
