"use client";
import { useMemo, useState } from "react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, ReferenceLine,
} from "recharts";
import type { Ticket, DelaySource } from "@/lib/hubspot";
import {
  PRIORITY_ORDER, PRIORITY_LABELS, PRIORITY_COLORS, SLA_TARGET_DAYS,
  DELAY_LABELS, DELAY_COLORS,
  type PriorityLevel,
} from "@/lib/hubspot";
import {
  buildRangeStats,
  buildPriorityObjectives,
  buildPriorityWeeklyTrend,
  breakdownDelay,
  median,
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
const MONTHS_ES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const DELAY_ORDER: DelaySource[] = ["internal_unassigned", "internal_waiting", "internal_working", "external", "other"];

function monthKey(d: Date): string {
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
}

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

  // Tickets ingresados en el período
  const periodTickets = useMemo(
    () => allTickets.filter((t) => {
      const c = t.createdAt.getTime();
      return c >= fromMs && c <= toMs;
    }),
    [allTickets, fromMs, toMs]
  );

  // --- Volumen / resolución del período ---
  const total = periodTickets.length;
  const closed = periodTickets.filter((t) => t.isClosed).length;
  const closeRate = total ? Math.round((closed / total) * 100) : 0;
  const neto = total - closed; // ingresados que aún no cerraron (de este período)

  const closedInPeriod = periodTickets.filter((t) => t.isClosed && t.closedAt);
  const resolutionDays = closedInPeriod.map((t) => (t.closedAt!.getTime() - t.createdAt.getTime()) / 86400000);
  const medianResolution = median(resolutionDays);
  const avgResolution = resolutionDays.length
    ? resolutionDays.reduce((s, x) => s + x, 0) / resolutionDays.length
    : null;

  const slaEval = periodTickets.filter((t) => t.isClosed && t.slaCompliant !== null);
  const slaOk = slaEval.filter((t) => t.slaCompliant === true).length;
  const slaRate = slaEval.length ? Math.round((slaOk / slaEval.length) * 100) : null;

  // Backlog / demorados a hoy (no dependen del filtro: es la foto actual)
  const backlogNow = allTickets.filter((t) => t.isOpen).length;
  const delayedNow = allTickets.filter((t) => t.isDelayed).length;

  // --- Evolución mensual (últimos 8 meses): ingresados vs cerrados ---
  const evolution = useMemo(() => {
    const now = new Date();
    const buckets: { key: string; label: string; ingresados: number; cerrados: number }[] = [];
    const idx = new Map<string, number>();
    for (let i = 7; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = monthKey(d);
      idx.set(key, buckets.length);
      buckets.push({ key, label: `${MONTHS_ES[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`, ingresados: 0, cerrados: 0 });
    }
    for (const t of allTickets) {
      const ck = monthKey(t.createdAt);
      if (idx.has(ck)) buckets[idx.get(ck)!].ingresados++;
      if (t.closedAt) {
        const lk = monthKey(t.closedAt);
        if (idx.has(lk)) buckets[idx.get(lk)!].cerrados++;
      }
    }
    return buckets;
  }, [allTickets]);

  // --- Objetivo: tiempos por urgencia ---
  const objectives = useMemo(
    () => buildPriorityObjectives(allTickets, fromMs, toMs),
    [allTickets, fromMs, toMs]
  );
  const byLevel = useMemo(() => {
    const m = new Map<PriorityLevel, PriorityObjective>();
    for (const o of objectives) m.set(o.level, o);
    return m;
  }, [objectives]);
  const enMeta = PRIORITY_ORDER.map((l) => byLevel.get(l)).filter((o) => o?.onTarget).length;
  const priorityTrend = useMemo(
    () => buildPriorityWeeklyTrend(allTickets, fromMs, toMs),
    [allTickets, fromMs, toMs]
  );

  // --- Comparativo por trimestre (todos los Q) ---
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

  // --- Por área (del período) ---
  const areaStats = useMemo(
    () => buildRangeStats(allTickets, fromMs, toMs, "range", "período").byArea,
    [allTickets, fromMs, toMs]
  );

  // --- Cuellos de botella: dónde están los tickets abiertos y por qué esperan ---
  const stageBottlenecks = useMemo(() => {
    const open = allTickets.filter((t) => t.isOpen);
    const m = new Map<string, { stage: string; count: number; days: number[]; delayed: number }>();
    for (const t of open) {
      let r = m.get(t.stageLabel);
      if (!r) { r = { stage: t.stageLabel, count: 0, days: [], delayed: 0 }; m.set(t.stageLabel, r); }
      r.count++;
      r.days.push(t.daysInCurrentStage);
      if (t.isDelayed) r.delayed++;
    }
    return Array.from(m.values())
      .map((r) => ({
        stage: r.stage,
        count: r.count,
        delayed: r.delayed,
        avgDays: r.days.reduce((s, x) => s + x, 0) / r.days.length,
        maxDays: Math.max(...r.days),
      }))
      .sort((a, b) => b.avgDays * b.count - a.avgDays * a.count);
  }, [allTickets]);

  const delayBreak = useMemo(
    () => breakdownDelay(allTickets.filter((t) => t.isOpen && t.isDelayed)),
    [allTickets]
  );

  const periodLabel = `${fmtDate(new Date(range.from))} al ${fmtDate(new Date(range.to))}`;

  return (
    <div className="space-y-10">
      {/* HEADER */}
      <div>
        <h1 className="font-serif font-bold text-3xl text-accent">Dirección</h1>
        <p className="text-sm text-muted mt-1">
          Reporte de gestión para dirección y gerencia — volumen, resolución, cumplimiento del objetivo de tiempos y dónde mejorar el proceso.
        </p>
        <div className="mt-2"><LastUpdate fetchedAt={fetchedAt} /></div>
      </div>

      {/* FILTRO DE PERÍODO */}
      <PeriodFilter
        onChange={(from, to) => setRange({ from, to })}
        rightInfo={<>Período: <strong className="text-text font-semibold">{periodLabel}</strong> · <strong className="font-mono text-text">{total}</strong> tickets</>}
      />

      {/* 1. TICKETS INGRESADOS Y EVOLUCIÓN */}
      <section>
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
          <h2 className="font-serif font-bold text-xl text-accent">Ingresos y resolución — {periodLabel}</h2>
          <span className="text-[11px] text-dim">Cuánto trabajo entra, cuánto se resuelve y a qué velocidad.</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <KpiCard label="Ingresados" value={String(total)} sub="en el período" />
          <KpiCard label="Cerrados" value={String(closed)} sub={`${closeRate}% de cierre`} color={closeRate >= 75 ? "text-brugaligreen" : closeRate >= 50 ? "text-brugaliamber" : "text-brugalired"} />
          <KpiCard label="Sin cerrar" value={String(neto)} sub="del período, aún abiertos" color={neto === 0 ? "text-brugaligreen" : "text-text"} />
          <KpiCard label="Mediana resolución" value={medianResolution !== null ? `${medianResolution.toFixed(1)}d` : "s/d"} sub={avgResolution !== null ? `prom. ${avgResolution.toFixed(1)}d` : "sin cierres"} />
          <KpiCard label="Backlog hoy" value={String(backlogNow)} sub={`${delayedNow} demorados`} color={delayedNow >= 5 ? "text-brugalired" : delayedNow > 0 ? "text-brugaliamber" : "text-brugaligreen"} />
          <KpiCard label="SLA cumplido" value={slaRate === null ? "s/d" : `${slaRate}%`} sub={slaEval.length ? `sobre ${slaEval.length} cerrados` : "sin datos"} color={slaRate === null ? "text-muted" : slaRate >= 80 ? "text-brugaligreen" : slaRate >= 60 ? "text-brugaliamber" : "text-brugalired"} />
        </div>
        <div className="bg-surface border border-border rounded-xl p-6 mt-4">
          <div className="text-[11px] uppercase tracking-wider text-muted font-semibold mb-3">Ingresados vs cerrados por mes (últimos 8 meses)</div>
          <div style={{ width: "100%", height: 300 }}>
            <ResponsiveContainer>
              <BarChart data={evolution} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e6e2d8" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#6a6862" }} />
                <YAxis tick={{ fontSize: 11, fill: "#6a6862" }} allowDecimals={false} />
                <Tooltip contentStyle={{ background: "#fff", border: "1px solid #e6e2d8", borderRadius: 8, fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="ingresados" name="Ingresados" fill="#254957" radius={[3, 3, 0, 0]} />
                <Bar dataKey="cerrados" name="Cerrados" fill="#339f8f" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="text-[11px] text-dim mt-3">
            Si los cerrados quedan por debajo de los ingresados mes a mes, el backlog crece. La tendencia no depende del filtro de período.
          </p>
        </div>
      </section>

      {/* 2. TENDENCIA POR TRIMESTRE */}
      <section>
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
          <h2 className="font-serif font-bold text-xl text-accent">Tendencia por trimestre</h2>
          <span className="text-[11px] text-dim">¿Estamos mejorando trimestre a trimestre? No depende del filtro.</span>
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

      {/* 3. OBJETIVO: TIEMPOS DE RESOLUCIÓN POR URGENCIA */}
      <section>
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
          <h2 className="font-serif font-bold text-xl text-accent">Objetivo: tiempos de resolución por urgencia</h2>
          <span className="text-[11px] text-dim">
            En meta: <strong className={enMeta === PRIORITY_ORDER.length ? "text-brugaligreen" : enMeta === 0 ? "text-brugalired" : "text-brugaliamber"}>{enMeta}/{PRIORITY_ORDER.length}</strong> niveles
          </span>
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
                <th className="text-right py-3 px-3">Abiertos vencidos</th>
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
                    <td className="py-2 px-3 text-right font-mono" style={{ color: (o?.openOverTarget ?? 0) > 0 ? "#e63323" : "#6a6862" }}>{o?.openOverTarget ?? 0}</td>
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
        <div className="bg-surface border border-border rounded-xl p-6 mt-4">
          <div className="text-[11px] uppercase tracking-wider text-muted font-semibold mb-3">Evolución de la mediana de cierre por semana (líneas punteadas = metas)</div>
          <div style={{ width: "100%", height: 300 }}>
            <ResponsiveContainer>
              <LineChart data={priorityTrend} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e6e2d8" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#6a6862" }} />
                <YAxis tick={{ fontSize: 11, fill: "#6a6862" }} label={{ value: "días", angle: -90, position: "insideLeft", fontSize: 11, fill: "#a8a59a" }} />
                <Tooltip
                  contentStyle={{ background: "#fff", border: "1px solid #e6e2d8", borderRadius: 8, fontSize: 12 }}
                  formatter={(v: any) => (v === null || v === undefined ? "—" : `${Number(v).toFixed(1)}d`)}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <ReferenceLine y={SLA_TARGET_DAYS.urgente!} stroke={PRIORITY_COLORS.urgente} strokeDasharray="4 4" strokeOpacity={0.5} />
                <ReferenceLine y={SLA_TARGET_DAYS.media!} stroke={PRIORITY_COLORS.media} strokeDasharray="4 4" strokeOpacity={0.5} />
                <ReferenceLine y={SLA_TARGET_DAYS.baja!} stroke={PRIORITY_COLORS.baja} strokeDasharray="4 4" strokeOpacity={0.5} />
                <Line type="monotone" dataKey="urgente" stroke={PRIORITY_COLORS.urgente} strokeWidth={2} name="Urgente" dot={{ r: 3 }} connectNulls />
                <Line type="monotone" dataKey="alta" stroke={PRIORITY_COLORS.alta} strokeWidth={2} name="Alta" dot={{ r: 3 }} connectNulls />
                <Line type="monotone" dataKey="media" stroke={PRIORITY_COLORS.media} strokeWidth={2} name="Media" dot={{ r: 3 }} connectNulls />
                <Line type="monotone" dataKey="baja" stroke={PRIORITY_COLORS.baja} strokeWidth={2} name="Baja" dot={{ r: 3 }} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      {/* 4. DÓNDE MEJORAR EL PROCESO (CUELLOS DE BOTELLA) */}
      <section>
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
          <h2 className="font-serif font-bold text-xl text-accent">Dónde mejorar el proceso</h2>
          <span className="text-[11px] text-dim">Dónde se acumulan y por qué esperan los tickets abiertos (foto a hoy).</span>
        </div>

        {/* Naturaleza de las demoras */}
        <div className="bg-surface border border-border rounded-xl p-6">
          <div className="text-[11px] uppercase tracking-wider text-muted font-semibold mb-3">
            Por qué esperan los {delayBreak.total} tickets demorados
          </div>
          {delayBreak.total === 0 ? (
            <div className="text-sm text-brugaligreen font-medium">No hay tickets demorados. 🎯</div>
          ) : (
            <div className="space-y-2">
              {DELAY_ORDER.map((src) => {
                const n = delayBreak[src];
                if (!n) return null;
                const pct = Math.round((n / delayBreak.total) * 100);
                return (
                  <div key={src} className="flex items-center gap-3">
                    <div className="w-56 text-xs text-muted flex-shrink-0">
                      <span className="inline-block w-2.5 h-2.5 rounded-sm mr-2 align-middle" style={{ backgroundColor: DELAY_COLORS[src] }} />
                      {DELAY_LABELS[src]}
                    </div>
                    <div className="flex-1 h-4 bg-surface2 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: DELAY_COLORS[src] }} />
                    </div>
                    <div className="w-20 text-right font-mono text-xs">
                      <strong>{n}</strong> <span className="text-dim">({pct}%)</span>
                    </div>
                  </div>
                );
              })}
              <p className="text-[11px] text-dim mt-3">
                <strong>{Math.round(delayBreak.externalPct)}%</strong> de la demora depende de la sucursal/cliente (fuera del control directo del equipo). El resto es margen de mejora interno.
              </p>
            </div>
          )}
        </div>

        {/* Dónde se acumulan (por etapa) */}
        <div className="bg-surface border border-border rounded-xl overflow-x-auto mt-4">
          <table className="w-full text-sm">
            <thead className="bg-surface2 text-muted uppercase tracking-wider text-xs">
              <tr>
                <th className="text-left py-3 px-3">Etapa</th>
                <th className="text-right py-3 px-3">Abiertos</th>
                <th className="text-right py-3 px-3">Demorados</th>
                <th className="text-right py-3 px-3">Días prom. en etapa</th>
                <th className="text-right py-3 px-3">Máx.</th>
              </tr>
            </thead>
            <tbody>
              {stageBottlenecks.slice(0, 8).map((s) => {
                const tone = s.avgDays > 10 ? "text-brugalired font-semibold" : s.avgDays > 5 ? "text-brugaliamber" : "text-text";
                return (
                  <tr key={s.stage} className="border-t border-border">
                    <td className="py-2 px-3 font-medium">{s.stage}</td>
                    <td className="py-2 px-3 text-right font-mono">{s.count}</td>
                    <td className="py-2 px-3 text-right font-mono" style={{ color: s.delayed > 0 ? "#e63323" : "#6a6862" }}>{s.delayed || "—"}</td>
                    <td className={`py-2 px-3 text-right font-mono ${tone}`}>{s.avgDays.toFixed(1)}d</td>
                    <td className="py-2 px-3 text-right font-mono text-muted">{s.maxDays}d</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Por área */}
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3 mt-6">
          <h3 className="font-serif font-semibold text-base text-text">Por área — {periodLabel}</h3>
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
