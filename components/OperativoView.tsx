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

const Q2_START = new Date(Date.UTC(2026, 3, 1));

export default function OperativoView({ tickets: raw, fetchedAt }: { tickets: SerializedTicket[]; fetchedAt: string }) {
  // Rehidratar fechas una sola vez
  const allTickets = useMemo(() => raw.map(hydrate), [raw]);

  const today = new Date();
  const [startDate, setStartDate] = useState<string>(toInputDate(Q2_START));
  const [endDate, setEndDate] = useState<string>(toInputDate(today));
  const [activePreset, setActivePreset] = useState<string>("q2");

  // Aplicar presets
  function applyPreset(key: string) {
    const now = new Date();
    let from: Date;
    let to: Date = endOfDay(now);
    if (key === "q2") {
      from = Q2_START;
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

  // Filtrar tickets por rango
  const filteredTickets = useMemo(() => {
    const from = startOfDay(new Date(startDate));
    const to = endOfDay(new Date(endDate));
    return allTickets.filter(
      (t) => t.createdAt >= from && t.createdAt <= to
    );
  }, [allTickets, startDate, endDate]);

  // Recalcular métricas con los tickets filtrados
  const areas = useMemo(() => buildAreaMetrics(filteredTickets), [filteredTickets]);
  const branches = useMemo(() => buildBranchMetrics(filteredTickets), [filteredTickets]);
  const alerts = useMemo(() => detectProductAlerts(filteredTickets), [filteredTickets]);

  const areaList = Object.values(areas).filter((a) => a.total > 0);
  const totalFiltered = filteredTickets.length;
  const totalAll = allTickets.length;

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

  return (
    <div className="space-y-10">
      <div>
        <h1 className="font-serif font-bold text-3xl text-accent">Vista operativa</h1>
        <p className="text-sm text-muted mt-1">
          Detalle por área y sucursal con links directos a HubSpot
        </p>
        <div className="mt-2"><LastUpdate fetchedAt={fetchedAt} /></div>
      </div>

      {/* PANEL DE FILTRO DE FECHA */}
      <div className="bg-surface border border-border rounded-xl p-4">
        <div className="flex flex-wrap items-center gap-3 mb-3">
          <span className="text-[11px] uppercase tracking-wider text-muted font-semibold mr-1">
            Período:
          </span>
          <PresetBtn k="q2" label="Q2 completo" />
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
            {totalAll} tickets en el período
          </div>
        </div>
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
              <AreaSection key={a.pipelineId} area={a} />
            ))}
          </div>
        )}
      </section>

      {/* Tabla por sucursal */}
      <section>
        <h2 className="font-serif font-bold text-xl text-accent mb-4">
          Por sucursal — período seleccionado
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
