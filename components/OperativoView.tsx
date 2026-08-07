"use client";
import { useState, useMemo } from "react";
import type { Ticket } from "@/lib/hubspot";
import {
  buildAreaMetrics,
  buildBranchMetrics,
  detectProductAlerts,
  fmtDate,
} from "@/lib/analytics";
import AreaSection from "@/components/AreaSection";
import BranchTable from "@/components/BranchTable";
import LastUpdate from "@/components/LastUpdate";

// Tickets serializados llegan con fechas como string desde el server
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

// Primer trimestre con datos cargados en HubSpot (Q1 2026).
// A partir de aca los trimestres se generan solos segun la fecha actual.
const DATA_START = new Date(Date.UTC(2026, 0, 1));

function quarterOf(d: Date) {
  return Math.floor(d.getUTCMonth() / 3) + 1; // 1..4
}
function quarterStartDate(year: number, q: number) {
  return new Date(Date.UTC(year, (q - 1) * 3, 1));
}
function quarterEndDate(year: number, q: number) {
  // Dia 0 del mes siguiente al trimestre = ultimo dia del trimestre
  return new Date(Date.UTC(year, q * 3, 0, 23, 59, 59, 999));
}
function quarterKey(year: number, q: number) {
  return `q-${year}-${q}`;
}

// Lista de trimestres desde DATA_START hasta el trimestre en curso (inclusive).
// Cuando el reloj entre en un nuevo trimestre, aparece solo sin tocar el codigo.
function buildQuarters(from: Date, now: Date) {
  const list: { year: number; q: number; key: string; label: string; current: boolean }[] = [];
  let y = from.getUTCFullYear();
  let q = quarterOf(from);
  const endY = now.getUTCFullYear();
  const endQ = quarterOf(now);
  while (y < endY || (y === endY && q <= endQ)) {
    list.push({
      year: y,
      q,
      key: quarterKey(y, q),
      label: `Q${q} ${y}`,
      current: y === endY && q === endQ,
    });
    q++;
    if (q > 4) {
      q = 1;
      y++;
    }
  }
  return list;
}

type EffectiveOwnerInfo = { ownerName: string; reasonText: string; daysWaiting: number };

// Orden de la tabla "Carga por responsable"
type OwnerSortKey = "name" | "total" | "open" | "closed" | "rate" | "delayed";

export default function OperativoView({ tickets: raw, fetchedAt, effectiveOwners = {} }: { tickets: SerializedTicket[]; fetchedAt: string; effectiveOwners?: Record<string, EffectiveOwnerInfo> }) {
  // Rehidratar fechas una sola vez
  const allTickets = useMemo(() => raw.map(hydrate), [raw]);

  const today = new Date();

  // Trimestres disponibles: se recalculan segun la fecha actual.
  const quarters = useMemo(() => buildQuarters(DATA_START, today), [today]);
  const currentQuarter = quarters[quarters.length - 1];

  // Por defecto arranca en el trimestre en curso.
  const defaultTo = new Date(Math.min(quarterEndDate(currentQuarter.year, currentQuarter.q).getTime(), endOfDay(today).getTime()));
  const [startDate, setStartDate] = useState<string>(toInputDate(quarterStartDate(currentQuarter.year, currentQuarter.q)));
  const [endDate, setEndDate] = useState<string>(toInputDate(defaultTo));
  const [activePreset, setActivePreset] = useState<string>(currentQuarter.key);

  // Filtro de contenido (busqueda)
  const [searchText, setSearchText] = useState<string>("");

  // Orden de la tabla de carga por responsable
  const [ownerSort, setOwnerSort] = useState<{ key: OwnerSortKey; asc: boolean }>({ key: "delayed", asc: false });

  // Sucursales colapsable (desplegable)
  const [branchOpen, setBranchOpen] = useState<boolean>(false);

  // Aplicar presets
  function applyPreset(key: string) {
    const now = new Date();
    let from: Date;
    let to: Date = endOfDay(now);
    if (key.startsWith("q-")) {
      const [, yStr, qStr] = key.split("-");
      const y = Number(yStr);
      const q = Number(qStr);
      from = quarterStartDate(y, q);
      // El trimestre en curso se corta en el dia de hoy; los cerrados van completos.
      const qEnd = quarterEndDate(y, q);
      to = qEnd.getTime() > endOfDay(now).getTime() ? endOfDay(now) : qEnd;
    } else if (key === "7d") {
      from = new Date(now);
      from.setUTCDate(now.getUTCDate() - 6);
      from = startOfDay(from);
    } else if (key === "30d") {
      from = new Date(now);
      from.setUTCDate(now.getUTCDate() - 29);
      from = startOfDay(from);
    } else if (key === "month") {
      from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    } else if (key === "prev_month") {
      from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
      to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0, 23, 59, 59, 999));
    } else {
      return;
    }
    setStartDate(toInputDate(from));
    setEndDate(toInputDate(to));
    setActivePreset(key);
  }

  // Filtrar tickets por rango de fecha
  const periodTickets = useMemo(() => {
    const from = startOfDay(new Date(startDate));
    const to = endOfDay(new Date(endDate));
    return allTickets.filter(
      (t) => t.createdAt >= from && t.createdAt <= to
    );
  }, [allTickets, startDate, endDate]);

  // Aplicar busqueda sobre el periodo
  const viewTickets = useMemo(() => {
    let arr = periodTickets;
    const q = searchText.trim().toLowerCase();
    if (q) {
      arr = arr.filter((t) =>
        (t.subject && t.subject.toLowerCase().includes(q)) ||
        (t.product && t.product.toLowerCase().includes(q)) ||
        (t.branch && t.branch.toLowerCase().includes(q)) ||
        t.id.includes(q)
      );
    }
    return arr;
  }, [periodTickets, searchText]);

  // KPIs del periodo/filtro
  const kpis = useMemo(() => {
    const total = viewTickets.length;
    const closed = viewTickets.filter((t) => t.isClosed).length;
    const open = viewTickets.filter((t) => t.isOpen).length;
    const delayed = viewTickets.filter((t) => t.isDelayed).length;
    const slaEval = viewTickets.filter((t) => t.slaCompliant !== null);
    const slaOk = slaEval.filter((t) => t.slaCompliant === true).length;
    const closeRate = total ? Math.round((closed / total) * 100) : 0;
    const slaRate = slaEval.length ? Math.round((slaOk / slaEval.length) * 100) : null;
    return { total, closed, open, delayed, closeRate, slaRate, slaEvalCount: slaEval.length };
  }, [viewTickets]);

  // Recalcular métricas con los tickets filtrados
  const areas = useMemo(() => buildAreaMetrics(viewTickets), [viewTickets]);
  const branches = useMemo(() => buildBranchMetrics(viewTickets), [viewTickets]);
  const alerts = useMemo(() => detectProductAlerts(viewTickets), [viewTickets]);

  const areaList = Object.values(areas).filter((a) => a.total > 0);
  const totalFiltered = viewTickets.length;
  const totalAll = allTickets.length;
  const hasContentFilter = !!searchText.trim();

  // Carga por responsable (owner). Se agrupa por ownerId; el nombre puede venir
  // como "ID:xxx" hasta que HubSpot resuelva los nombres (permisos).
  const ownerLoad = useMemo(() => {
    const m = new Map<string, { id: string; name: string; total: number; open: number; closed: number; delayed: number; rate: number }>();
    for (const t of viewTickets) {
      const id = t.ownerId || "__none__";
      const name = t.ownerName || "Sin asignar";
      let e = m.get(id);
      if (!e) { e = { id, name, total: 0, open: 0, closed: 0, delayed: 0, rate: 0 }; m.set(id, e); }
      e.total++;
      if (t.isOpen) e.open++;
      if (t.isClosed) e.closed++;
      if (t.isDelayed) e.delayed++;
    }
    const arr = Array.from(m.values());
    arr.forEach((e) => { e.rate = e.total ? Math.round((e.closed / e.total) * 100) : 0; });
    return arr;
  }, [viewTickets]);

  // Aplicar orden elegido a la tabla de carga por responsable
  const ownerLoadSorted = useMemo(() => {
    const arr = [...ownerLoad];
    const { key, asc } = ownerSort;
    arr.sort((a, b) => {
      if (key === "name") {
        return asc ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
      }
      const va = a[key] as number;
      const vb = b[key] as number;
      // Desempate secundario: total desc
      return (asc ? va - vb : vb - va) || (b.total - a.total);
    });
    return arr;
  }, [ownerLoad, ownerSort]);

  function toggleOwnerSort(key: OwnerSortKey) {
    setOwnerSort((prev) =>
      prev.key === key
        ? { key, asc: !prev.asc }
        : { key, asc: key === "name" } // nombre arranca A→Z, numeros de mayor a menor
    );
  }

  function PresetBtn({ k, label }: { k: string; label: string }) {
    const active = activePreset === k;
    return (
      <button
        onClick={() => applyPreset(k)}
        className={`px-3 py-1.5 text-xs rounded-full border transition-colors whitespace-nowrap ${
          active
            ? "bg-accent text-white border-accent font-semibold"
            : "border-border text-muted hover:border-accent hover:text-accent"
        }`}
      >
        {label}
      </button>
    );
  }

  // Header clickeable de la tabla de carga por responsable
  function OwnerTh({ col, label, right }: { col: OwnerSortKey; label: string; right?: boolean }) {
    const active = ownerSort.key === col;
    const arrow = active ? (ownerSort.asc ? " ↑" : " ↓") : "";
    return (
      <th
        onClick={() => toggleOwnerSort(col)}
        className={`py-3 px-3 cursor-pointer select-none hover:text-accent whitespace-nowrap ${active ? "text-accent" : ""} ${right ? "text-right" : "text-left"}`}
      >
        {label}{arrow}
      </th>
    );
  }

  function KpiCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
    return (
      <div className="rounded-xl bg-surface border border-border p-4">
        <div className="text-[10px] uppercase tracking-wider text-muted font-semibold">{label}</div>
        <div className={`font-mono text-2xl font-semibold mt-1 ${color || "text-text"}`}>{value}</div>
        {sub && <div className="text-[11px] text-muted mt-0.5">{sub}</div>}
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <div>
        <h1 className="font-serif font-bold text-3xl text-accent">Vista operativa</h1>
        <p className="text-sm text-muted mt-1">
          Detalle por área y sucursal con links directos a HubSpot
        </p>
        <div className="mt-2"><LastUpdate fetchedAt={fetchedAt} /></div>
      </div>

      {/* PANEL DE FILTRO */}
      <div className="bg-surface border border-border rounded-xl p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-[11px] uppercase tracking-wider text-muted font-semibold mr-1">
            Período:
          </span>
          {quarters.map((qt) => (
            <PresetBtn
              key={qt.key}
              k={qt.key}
              label={qt.current ? `${qt.label} (en curso)` : qt.label}
            />
          ))}
          <PresetBtn k="7d" label="Últimos 7 días" />
          <PresetBtn k="30d" label="Últimos 30 días" />
          <PresetBtn k="month" label="Mes en curso" />
          <PresetBtn k="prev_month" label="Mes anterior" />
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted font-semibold block mb-1">
              Desde
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setActivePreset("custom");
              }}
              className="px-3 py-1.5 text-sm border border-border rounded-lg bg-bg focus:outline-none focus:border-accent"
            />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted font-semibold block mb-1">
              Hasta
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setActivePreset("custom");
              }}
              className="px-3 py-1.5 text-sm border border-border rounded-lg bg-bg focus:outline-none focus:border-accent"
            />
          </div>
          <div className="ml-auto text-[11px] text-muted">
            Mostrando{" "}
            <strong className="text-text font-semibold font-mono">{totalFiltered}</strong> de{" "}
            {totalAll} tickets
          </div>
        </div>

        {/* Búsqueda */}
        <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-border">
          <div className="relative flex-1 min-w-[220px] max-w-md">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted text-xs">🔍</span>
            <input
              type="text"
              placeholder="Buscar por asunto, producto, sucursal o ID..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm border border-border rounded-lg bg-bg focus:outline-none focus:border-accent transition-colors"
            />
          </div>
          {hasContentFilter && (
            <button
              onClick={() => { setSearchText(""); }}
              className="px-3 py-1.5 text-xs rounded-lg border border-border text-muted hover:bg-surface2 transition-colors"
            >
              ✕ Limpiar
            </button>
          )}
        </div>
      </div>

      {/* FILA DE KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <KpiCard label="Tickets" value={String(kpis.total)} sub="en el período/filtro" />
        <KpiCard label="Cerrados" value={String(kpis.closed)} sub={`${kpis.closeRate}% del total`} color={kpis.closeRate >= 75 ? "text-brugaligreen" : kpis.closeRate >= 50 ? "text-brugaliamber" : "text-brugalired"} />
        <KpiCard label="Abiertos" value={String(kpis.open)} sub="sin cerrar" />
        <KpiCard label="Demorados +7d" value={String(kpis.delayed)} sub="abiertos con demora" color={kpis.delayed === 0 ? "text-brugaligreen" : kpis.delayed >= 5 ? "text-brugalired" : "text-brugaliamber"} />
        <KpiCard label="Cumplimiento SLA" value={kpis.slaRate === null ? "s/d" : `${kpis.slaRate}%`} sub={kpis.slaEvalCount ? `sobre ${kpis.slaEvalCount} con SLA` : "sin datos"} color={kpis.slaRate === null ? "text-muted" : kpis.slaRate >= 75 ? "text-brugaligreen" : kpis.slaRate >= 50 ? "text-brugaliamber" : "text-brugalired"} />
      </div>

      {/* Alertas Calidad */}
      <section>
        <h2 className="font-serif font-bold text-xl text-accent mb-4">
          Calidad — productos críticos en el período
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
              ✓ Sin productos con 3+ reclamos en el período seleccionado
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
        {areaList.length === 0 ? (
          <div className="bg-surface border border-border rounded-xl p-6 text-center text-muted text-sm">
            No hay tickets en el período seleccionado.
          </div>
        ) : (
          <div className="space-y-3">
            {areaList.map((a) => (
              <AreaSection key={a.pipelineId} area={a} effectiveOwners={effectiveOwners} />
            ))}
          </div>
        )}
      </section>

      {/* Carga por responsable (owner) */}
      <section>
        <div className="flex items-baseline justify-between mb-4 gap-3 flex-wrap">
          <h2 className="font-serif font-bold text-xl text-accent">Carga por responsable</h2>
          <span className="text-xs text-muted">
            Tickets por owner en el período/filtro. Cliqueá una columna para ordenar. Si aparece un ID en vez del nombre, es porque HubSpot todavía no resolvió ese owner.
          </span>
        </div>
        {ownerLoadSorted.length === 0 ? (
          <div className="bg-surface border border-border rounded-xl p-6 text-center text-muted text-sm">
            No hay tickets en el período seleccionado.
          </div>
        ) : (
          <div className="bg-surface border border-border rounded-xl overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface2 text-muted uppercase tracking-wider text-xs">
                <tr>
                  <OwnerTh col="name" label="Responsable" />
                  <OwnerTh col="total" label="Total" right />
                  <OwnerTh col="open" label="Abiertos" right />
                  <OwnerTh col="closed" label="Cerrados" right />
                  <OwnerTh col="rate" label="% cierre" right />
                  <OwnerTh col="delayed" label="Demorados" right />
                </tr>
              </thead>
              <tbody>
                {ownerLoadSorted.map((o) => {
                  const rateColor =
                    o.rate >= 75 ? "text-brugaligreen"
                    : o.rate >= 50 ? "text-brugaliamber"
                    : "text-brugalired";
                  return (
                    <tr key={o.id} className="border-t border-border">
                      <td className="py-2 px-3 whitespace-nowrap">{o.name}</td>
                      <td className="py-2 px-3 text-right font-mono font-semibold">{o.total}</td>
                      <td className="py-2 px-3 text-right font-mono">{o.open}</td>
                      <td className="py-2 px-3 text-right font-mono">{o.closed}</td>
                      <td className={`py-2 px-3 text-right font-mono ${rateColor}`}>{o.rate}%</td>
                      <td className="py-2 px-3 text-right font-mono">
                        {o.delayed > 0 ? (
                          <span className="text-brugalired font-semibold">{o.delayed}</span>
                        ) : (
                          <span className="text-muted">0</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Tabla por sucursal — desplegable */}
      <section>
        <button
          onClick={() => setBranchOpen((v) => !v)}
          className="w-full flex items-center justify-between gap-3 text-left"
        >
          <h2 className="font-serif font-bold text-xl text-accent flex items-center gap-2">
            <span className={`text-sm transition-transform inline-block font-mono ${branchOpen ? "rotate-90" : ""}`}>▶</span>
            Por sucursal — período seleccionado
          </h2>
          <span className="text-xs text-muted whitespace-nowrap">
            {branchOpen ? "Ocultar" : `Ver ${branches.length} sucursal${branches.length !== 1 ? "es" : ""}`}
          </span>
        </button>
        {branchOpen && (
          <div className="mt-4">
            <BranchTable branches={branches} />
            <p className="text-xs text-dim mt-2">
              Cliqueá la fila de una sucursal para ver el desglose por área y los tickets demorados.
              Se excluyen tickets sin sucursal asignada (código 99).
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
