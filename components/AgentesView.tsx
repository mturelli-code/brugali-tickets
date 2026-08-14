"use client";
import { useState, useMemo, Fragment } from "react";
import type { Ticket, OwnerHistoryMap } from "@/lib/hubspot";
import { buildAgentDeepMetrics, fmtDate } from "@/lib/analytics";
import { SLA_TARGET_DAYS, type PriorityLevel } from "@/lib/hubspot";
import LastUpdate from "@/components/LastUpdate";
import PeriodFilter, { defaultRange, startOfDay, endOfDay } from "@/components/PeriodFilter";

// Niveles de urgencia con su meta de días, para las columnas de resolución por urgencia.
const URGENCY_COLS: { level: PriorityLevel; label: string }[] = [
  { level: "urgente", label: "Urgente" },
  { level: "alta", label: "Alta" },
  { level: "media", label: "Media" },
  { level: "baja", label: "Baja" },
];

// Color de una mediana de resolución vs su meta.
function resToneVsTarget(v: number | null, target: number | null): string {
  if (v === null) return "text-dim";
  if (target === null) return "text-text";
  if (v <= target) return "text-brugaligreen font-semibold";
  if (v <= target * 1.5) return "text-brugaliamber";
  return "text-brugalired font-semibold";
}

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

type SerializedHistoryEntry = {
  ownerId: string;
  ownerName: string;
  start: string;
  end: string | null;
  days: number;
};

type SortKey =
  | "name" | "currentOpen" | "currentDelayed" | "totalTouched" | "avgHolding" | "avgResolution" | "fastResponse"
  | "prio_urgente" | "prio_alta" | "prio_media" | "prio_baja";

export default function AgentesView({
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

  // Hidratar history
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

  // Filtro de período (por defecto, trimestre en curso). Las métricas se recalculan
  // sobre los tickets creados en el rango elegido.
  const initRange = useMemo(() => defaultRange(new Date()), []);
  const [range, setRange] = useState<{ from: string; to: string }>({ from: initRange.from, to: initRange.to });
  const fromMs = startOfDay(new Date(range.from)).getTime();
  const toMs = endOfDay(new Date(range.to)).getTime();

  const periodTickets = useMemo(
    () => allTickets.filter((t) => {
      const c = t.createdAt.getTime();
      return c >= fromMs && c <= toMs;
    }),
    [allTickets, fromMs, toMs]
  );
  const agents = useMemo(() => buildAgentDeepMetrics(periodTickets, historyMap), [periodTickets, historyMap]);
  const hasHistory = historyMap.size > 0;

  const [sortKey, setSortKey] = useState<SortKey>("currentDelayed");
  const [asc, setAsc] = useState(false);
  const [search, setSearch] = useState("");
  const [activePipeline, setActivePipeline] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const pipelines = useMemo(() => {
    const s = new Set<string>();
    for (const a of agents) {
      for (const p of Object.keys(a.byPipeline)) s.add(p);
    }
    return Array.from(s).sort();
  }, [agents]);

  const filtered = useMemo(() => {
    let arr = [...agents];
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      arr = arr.filter((a) => a.ownerName.toLowerCase().includes(q));
    }
    if (activePipeline) {
      arr = arr.filter((a) => (a.byPipeline[activePipeline] || 0) > 0);
    }
    arr.sort((a, b) => {
      // Columnas de prioridad: los que no tienen dato ("—") van siempre al final.
      if (sortKey.startsWith("prio_")) {
        const lvl = sortKey.slice(5) as PriorityLevel;
        const na = a.resolutionByPriority[lvl];
        const nb = b.resolutionByPriority[lvl];
        if (na === null && nb === null) return 0;
        if (na === null) return 1;
        if (nb === null) return -1;
        return asc ? na - nb : nb - na;
      }
      let va: number | string = 0;
      let vb: number | string = 0;
      switch (sortKey) {
        case "name": va = a.ownerName; vb = b.ownerName; break;
        case "currentOpen": va = a.currentOpen; vb = b.currentOpen; break;
        case "currentDelayed": va = a.currentDelayed; vb = b.currentDelayed; break;
        case "totalTouched": va = a.totalTouchedQ2; vb = b.totalTouchedQ2; break;
        case "avgHolding": va = a.avgHoldingDays ?? -1; vb = b.avgHoldingDays ?? -1; break;
        case "avgResolution": va = a.avgResolutionDays ?? Number.MAX_SAFE_INTEGER; vb = b.avgResolutionDays ?? Number.MAX_SAFE_INTEGER; break;
        case "fastResponse": va = a.fastResponseRate ?? -1; vb = b.fastResponseRate ?? -1; break;
      }
      if (typeof va === "string") return asc ? va.localeCompare(vb as string) : (vb as string).localeCompare(va);
      return asc ? va - (vb as number) : (vb as number) - va;
    });
    return arr;
  }, [agents, search, activePipeline, sortKey, asc]);

  function handleSort(k: SortKey) {
    if (sortKey === k) setAsc(!asc);
    else { setSortKey(k); setAsc(k === "name"); }
  }

  function Th({ col, label, right }: { col: SortKey; label: string; right?: boolean }) {
    const active = sortKey === col;
    const arrow = active ? (asc ? " ↑" : " ↓") : "";
    return (
      <th
        onClick={() => handleSort(col)}
        className={`py-3 px-3 cursor-pointer select-none hover:text-accent whitespace-nowrap ${active ? "text-accent" : ""} ${right ? "text-right" : "text-left"}`}
      >
        {label}{arrow}
      </th>
    );
  }

  // KPIs globales agregados
  const totalActive = agents.length;
  const totalOpen = agents.reduce((s, a) => s + a.currentOpen, 0);
  const totalDelayed = agents.reduce((s, a) => s + a.currentDelayed, 0);
  const avgHolding =
    agents.filter((a) => a.avgHoldingDays !== null).reduce((s, a) => s + (a.avgHoldingDays ?? 0), 0) /
    Math.max(1, agents.filter((a) => a.avgHoldingDays !== null).length);

  // Top bottleneck: el agente con peor combinación de demorados + tiempo sosteniendo
  const bottleneck = [...agents]
    .filter((a) => a.currentDelayed > 0 && a.avgHoldingDays !== null)
    .sort((a, b) => (b.avgHoldingDays! * b.currentDelayed) - (a.avgHoldingDays! * a.currentDelayed))[0];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-serif font-bold text-3xl text-accent">Agentes</h1>
        <p className="text-sm text-muted mt-1">
          Análisis de performance por responsable — tiempos, embudos donde se trabajan más, cuellos de botella.
        </p>
        <div className="mt-2"><LastUpdate fetchedAt={fetchedAt} /></div>
        {!hasHistory && (
          <div className="mt-3 bg-brugaliamber/10 border border-brugaliamber/30 rounded-lg px-4 py-2 text-xs text-brugaliamber">
            ⚠ <strong>Métricas aproximadas:</strong> HubSpot no devolvió el historial de reasignaciones de los tickets. Las columnas <em>Días promedio sosteniendo</em> y <em>% &lt;2d</em> se calculan con el tiempo actual en etapa como aproximación. Para tener los datos reales, pedile al admin de HubSpot que active el permiso de <strong>"properties history"</strong> en la Service Key.
          </div>
        )}
      </div>

      {/* FILTRO DE PERÍODO */}
      <PeriodFilter onChange={(from, to) => setRange({ from, to })} />

      {/* KPIs */}
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border border-border p-4 bg-surface" style={{ borderTopWidth: 3, borderTopColor: "#254957" }}>
          <div className="text-[10px] uppercase tracking-wider text-muted font-semibold mb-1.5">Agentes activos</div>
          <div className="font-mono text-3xl font-semibold text-accent">{totalActive}</div>
        </div>
        <div className="rounded-xl border border-border p-4 bg-surface" style={{ borderTopWidth: 3, borderTopColor: "#339f8f" }}>
          <div className="text-[10px] uppercase tracking-wider text-muted font-semibold mb-1.5">Carga total</div>
          <div className="font-mono text-3xl font-semibold text-brugaligreen">{totalOpen}</div>
          <div className="text-[11px] text-muted">tickets abiertos en sus manos</div>
        </div>
        <div className="rounded-xl border border-border p-4 bg-surface" style={{ borderTopWidth: 3, borderTopColor: "#e63323" }}>
          <div className="text-[10px] uppercase tracking-wider text-muted font-semibold mb-1.5">Demorados</div>
          <div className="font-mono text-3xl font-semibold text-brugalired">{totalDelayed}</div>
          <div className="text-[11px] text-muted">requieren destrabe</div>
        </div>
        <div className="rounded-xl border border-border p-4 bg-surface" style={{ borderTopWidth: 3, borderTopColor: "#e6a303" }}>
          <div className="text-[10px] uppercase tracking-wider text-muted font-semibold mb-1.5">Promedio sosteniendo</div>
          <div className="font-mono text-3xl font-semibold text-brugaliamber">{avgHolding.toFixed(1)}d</div>
          <div className="text-[11px] text-muted">días por stint promedio</div>
        </div>
      </section>

      {/* Insight bottleneck */}
      {bottleneck && (
        <section>
          <div className="bg-surface border-2 border-brugalired rounded-xl p-5">
            <div className="text-xs font-bold uppercase tracking-wider text-brugalired mb-2">
              🚨 Posible cuello de botella humano
            </div>
            <div className="text-sm">
              <strong>{bottleneck.ownerName}</strong> sostiene <strong className="font-mono">{bottleneck.currentDelayed}</strong> tickets demorados con un promedio de <strong className="font-mono">{bottleneck.avgHoldingDays!.toFixed(1)} días</strong> sosteniendo cada uno.
              {bottleneck.worstPipeline && (
                <> Donde más se traba: <strong>{bottleneck.worstPipeline.name}</strong> ({bottleneck.worstPipeline.avgDays.toFixed(1)}d promedio).</>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Filtros */}
      <div className="bg-surface border border-border rounded-xl p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted text-xs">🔍</span>
            <input
              type="text"
              placeholder="Buscar agente..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm border border-border rounded-lg bg-bg focus:outline-none focus:border-accent"
            />
          </div>
          {(search || activePipeline) && (
            <button
              onClick={() => { setSearch(""); setActivePipeline(null); }}
              className="px-3 py-2 text-xs rounded-lg border border-border text-muted hover:bg-surface2 transition-colors ml-auto"
            >
              ✕ Limpiar filtros
            </button>
          )}
        </div>
        {pipelines.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] uppercase tracking-wider text-muted font-semibold mr-1">Pipeline:</span>
            <button
              onClick={() => setActivePipeline(null)}
              className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                activePipeline === null
                  ? "bg-accent text-white border-accent font-semibold"
                  : "border-border text-muted hover:border-accent hover:text-accent"
              }`}
            >
              Todos
            </button>
            {pipelines.map((p) => (
              <button
                key={p}
                onClick={() => setActivePipeline(activePipeline === p ? null : p)}
                className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                  activePipeline === p
                    ? "bg-accent text-white border-accent font-semibold"
                    : "border-border text-muted hover:border-accent hover:text-accent"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        )}
        <div className="text-[11px] text-muted">
          Mostrando <strong className="text-text font-mono">{filtered.length}</strong> agentes
        </div>
      </div>

      {/* Tabla detallada */}
      <section>
        <div className="bg-surface border border-border rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface2 text-muted uppercase tracking-wider text-xs">
              <tr>
                <Th col="name" label="Agente" />
                <Th col="currentOpen" label="Carga" right />
                <Th col="currentDelayed" label="Demorados" right />
                <Th col="totalTouched" label="Tickets" right />
                <Th col="avgHolding" label="Días prom. sosteniendo" right />
                <Th col="avgResolution" label="Tiempo resolución" right />
                {URGENCY_COLS.map((u) => {
                  const col = `prio_${u.level}` as SortKey;
                  const active = sortKey === col;
                  const arrow = active ? (asc ? " ↑" : " ↓") : "";
                  return (
                    <th
                      key={u.level}
                      onClick={() => handleSort(col)}
                      className={`py-3 px-3 text-right whitespace-nowrap cursor-pointer select-none hover:text-accent ${active ? "text-accent" : ""}`}
                      title={`Ordenar por mediana de resolución de tickets ${u.label} que cerró · meta ≤ ${SLA_TARGET_DAYS[u.level]}d`}
                    >
                      {u.label}{arrow}
                      <span className="block text-[9px] text-dim font-normal normal-case">≤{SLA_TARGET_DAYS[u.level]}d</span>
                    </th>
                  );
                })}
                <Th col="fastResponse" label="% &lt;2d" right />
                <th className="text-left py-3 px-3">Donde más se traba</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => {
                const delayedTone =
                  a.currentDelayed >= 5 ? "text-brugalired font-semibold"
                  : a.currentDelayed >= 2 ? "text-brugaliamber"
                  : "text-muted";
                const holdingTone =
                  (a.avgHoldingDays ?? 0) > 10 ? "text-brugalired font-semibold"
                  : (a.avgHoldingDays ?? 0) > 5 ? "text-brugaliamber"
                  : (a.avgHoldingDays ?? 0) > 0 ? "text-text"
                  : "text-dim";
                const fastTone =
                  (a.fastResponseRate ?? 0) >= 70 ? "text-brugaligreen font-semibold"
                  : (a.fastResponseRate ?? 0) >= 40 ? "text-brugaliamber"
                  : "text-brugalired";
                const isExp = expandedId === a.ownerId;
                const pipeEntries = Object.entries(a.byPipeline).sort((x, y) => y[1] - x[1]);
                return (
                  <Fragment key={a.ownerId}>
                    <tr
                      onClick={() => setExpandedId(isExp ? null : a.ownerId)}
                      className="border-t border-border cursor-pointer hover:bg-surface2/40 transition-colors"
                    >
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] font-mono transition-transform inline-block ${isExp ? "rotate-90" : ""}`}>▶</span>
                          <div className="w-7 h-7 rounded-full bg-accent/10 text-accent flex items-center justify-center font-bold text-xs flex-shrink-0">
                            {a.ownerName.charAt(0).toUpperCase()}
                          </div>
                          <span className="font-medium">{a.ownerName}</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-semibold">{a.currentOpen}</td>
                      <td className={`py-2.5 px-3 text-right font-mono ${delayedTone}`}>{a.currentDelayed || "—"}</td>
                      <td className="py-2.5 px-3 text-right font-mono text-muted">{a.totalTouchedQ2}</td>
                      <td className={`py-2.5 px-3 text-right font-mono ${holdingTone}`}>
                        {a.avgHoldingDays !== null ? `${a.avgHoldingDays.toFixed(1)}d` : "—"}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-muted">
                        {a.avgResolutionDays !== null ? `${a.avgResolutionDays.toFixed(1)}d` : "—"}
                      </td>
                      {URGENCY_COLS.map((u) => {
                        const v = a.resolutionByPriority[u.level];
                        return (
                          <td key={u.level} className={`py-2.5 px-3 text-right font-mono ${resToneVsTarget(v, SLA_TARGET_DAYS[u.level])}`}>
                            {v !== null ? `${v.toFixed(1)}d` : "—"}
                          </td>
                        );
                      })}
                      <td className={`py-2.5 px-3 text-right font-mono ${fastTone}`}>
                        {a.fastResponseRate !== null ? `${a.fastResponseRate.toFixed(0)}%` : "—"}
                      </td>
                      <td className="py-2.5 px-3 text-xs">
                        {a.worstPipeline ? (
                          <span>
                            <strong>{a.worstPipeline.name}</strong>{" "}
                            <span className="text-muted">({a.worstPipeline.avgDays.toFixed(1)}d prom)</span>
                          </span>
                        ) : "—"}
                      </td>
                    </tr>
                    {isExp && (
                      <tr className="bg-surface2/30 border-t border-border">
                        <td colSpan={12} className="px-6 py-4">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                              <div className="text-[11px] uppercase tracking-wider text-muted font-semibold mb-2">Tickets por embudo</div>
                              {pipeEntries.length === 0 ? (
                                <div className="text-xs text-muted">Sin datos en el período</div>
                              ) : (
                                <div className="flex flex-wrap gap-2">
                                  {pipeEntries.map(([name, n]) => (
                                    <span key={name} className="bg-bg border border-border px-2 py-1 rounded-full text-[11px] font-mono">
                                      {name}: <strong>{n}</strong>
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                            <div>
                              <div className="text-[11px] uppercase tracking-wider text-muted font-semibold mb-2">Detalle de tiempos</div>
                              <div className="grid grid-cols-3 gap-3 text-center">
                                <div>
                                  <div className="font-mono text-lg font-semibold text-text">{a.resolvedCount}</div>
                                  <div className="text-[10px] text-muted">cerrados por él</div>
                                </div>
                                <div>
                                  <div className="font-mono text-lg font-semibold text-text">{a.medianHoldingDays !== null ? `${a.medianHoldingDays.toFixed(1)}d` : "—"}</div>
                                  <div className="text-[10px] text-muted">mediana sosteniendo</div>
                                </div>
                                <div>
                                  <div className="font-mono text-lg font-semibold text-text">{a.totalHoldingDays > 0 ? `${a.totalHoldingDays}d` : "—"}</div>
                                  <div className="text-[10px] text-muted">días acumulados</div>
                                </div>
                              </div>
                              {a.worstPipeline && (
                                <div className="text-[11px] text-muted mt-3">
                                  Donde más se traba: <strong className="text-text">{a.worstPipeline.name}</strong> ({a.worstPipeline.avgDays.toFixed(1)}d promedio).
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="mt-3 text-right">
                            <a href="https://app.hubspot.com" target="_blank" rel="noopener" className="text-[11px] text-accent underline decoration-dotted">
                              Ver en HubSpot →
                            </a>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="mt-3 text-[11px] text-dim space-y-1">
          <div><strong>Carga</strong>: tickets abiertos asignados ahora. <strong>Demorados</strong>: de esa carga, cuántos están vencidos.</div>
          <div><strong>Tickets</strong>: cantidad de tickets distintos que pasaron por sus manos en el período. Cliqueá una fila para ver el detalle por embudo.</div>
          <div><strong>Días prom. sosteniendo</strong>: cuánto se sienta sobre un ticket antes de soltarlo (basado en historial real de reasignaciones).</div>
          <div><strong>Tiempo resolución</strong>: tiempo promedio que tardaron en cerrar los tickets que él cerró.</div>
          <div><strong>% &lt;2d</strong>: porcentaje de "stints" (períodos asignado) que duraron menos de 2 días — alta = pasa rápido, baja = sostiene mucho.</div>
          <div><strong>Donde más se traba</strong>: el embudo donde sus stints duran más días promedio (cuello de botella temático).</div>
          <div><strong>Urgente / Alta / Media / Baja</strong>: mediana de días que tardó en cerrar los tickets de ese nivel de urgencia. Verde = dentro de la meta (≤ meta), ámbar = hasta 1,5× la meta, rojo = por encima. "—" si no cerró tickets de ese nivel en el período.</div>
        </div>
      </section>
    </div>
  );
}
