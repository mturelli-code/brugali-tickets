"use client";
import { useState, useMemo } from "react";
import type { Ticket } from "@/lib/hubspot";
import { buildFollowUpByOwner, fmtDate } from "@/lib/analytics";
import LastUpdate from "@/components/LastUpdate";

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

const REASON_COLOR: Record<string, string> = {
  V: "bg-brugalired/10 text-brugalired",
  S: "bg-brugaliamber/10 text-brugaliamber",
  E: "bg-brugaliorange/10 text-brugaliorange",
};

function reasonTag(reason: string) {
  const color = reason.startsWith("Vencido")
    ? REASON_COLOR.V
    : reason.startsWith("Sin respuesta")
    ? REASON_COLOR.S
    : REASON_COLOR.E;
  return (
    <span
      key={reason}
      className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold mr-1 ${color}`}
    >
      {reason}
    </span>
  );
}

type UrgencyKey = "vencido" | "sin_respuesta" | "estancado";

export default function SeguimientoView({ tickets: raw, fetchedAt }: { tickets: SerializedTicket[]; fetchedAt: string }) {
  const allTickets = useMemo(() => raw.map(hydrate), [raw]);
  const today = new Date();

  // Q2 base
  const q2Tickets = useMemo(() => allTickets.filter((t) => t.quarter === 2), [allTickets]);

  // FILTROS
  const [search, setSearch] = useState("");
  const [activeOwner, setActiveOwner] = useState<string | null>(null);
  const [activeArea, setActiveArea] = useState<string | null>(null);
  const [activeBranch, setActiveBranch] = useState<string | null>(null);
  const [urgency, setUrgency] = useState<Set<UrgencyKey>>(new Set());

  // Catálogos para filtros (extraídos de los tickets abiertos)
  const openTickets = useMemo(() => q2Tickets.filter((t) => t.isOpen), [q2Tickets]);

  const owners = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of openTickets) {
      const key = t.ownerId ?? "__sin__";
      const name = t.ownerName ?? "Sin asignar";
      m.set(key, name);
    }
    return Array.from(m.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [openTickets]);

  const areas = useMemo(() => {
    const s = new Set<string>();
    for (const t of openTickets) s.add(t.pipelineName);
    return Array.from(s).sort();
  }, [openTickets]);

  const branches = useMemo(() => {
    const s = new Set<string>();
    for (const t of openTickets) if (t.branch) s.add(t.branch);
    return Array.from(s).sort();
  }, [openTickets]);

  // Aplicar filtros a los tickets antes de calcular el seguimiento
  const filteredTickets = useMemo(() => {
    let arr = openTickets;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      arr = arr.filter(
        (t) =>
          t.subject.toLowerCase().includes(q) ||
          (t.branch && t.branch.toLowerCase().includes(q)) ||
          (t.ownerName && t.ownerName.toLowerCase().includes(q))
      );
    }
    if (activeOwner) arr = arr.filter((t) => (t.ownerId ?? "__sin__") === activeOwner);
    if (activeArea) arr = arr.filter((t) => t.pipelineName === activeArea);
    if (activeBranch) arr = arr.filter((t) => t.branch === activeBranch);
    return arr;
  }, [openTickets, search, activeOwner, activeArea, activeBranch]);

  // Construir agrupado por owner sobre los filtrados
  const byOwner = useMemo(() => buildFollowUpByOwner(filteredTickets), [filteredTickets]);

  // Aplicar filtro de urgencia AL agrupado (queda solo los tickets que matchean)
  const finalByOwner = useMemo(() => {
    if (urgency.size === 0) return byOwner;
    return byOwner
      .map((owner) => ({
        ...owner,
        tickets: owner.tickets.filter((it) => {
          if (urgency.has("vencido") && it.ticket.isDelayed) return true;
          if (
            urgency.has("sin_respuesta") &&
            it.ticket.stageLabel === "Nuevo" &&
            it.ticket.daysSinceActivity > 2
          )
            return true;
          if (
            urgency.has("estancado") &&
            it.ticket.stageLabel === "Esp. resp. interna" &&
            it.ticket.daysSinceActivity > 5
          )
            return true;
          return false;
        }),
      }))
      .filter((o) => o.tickets.length > 0);
  }, [byOwner, urgency]);

  const totalTickets = finalByOwner.reduce((s, o) => s + o.tickets.length, 0);
  const hasFilters = !!search || activeOwner || activeArea || activeBranch || urgency.size > 0;

  function toggleUrg(k: UrgencyKey) {
    const next = new Set(urgency);
    if (next.has(k)) next.delete(k);
    else next.add(k);
    setUrgency(next);
  }

  function clearFilters() {
    setSearch("");
    setActiveOwner(null);
    setActiveArea(null);
    setActiveBranch(null);
    setUrgency(new Set());
  }

  // Botón chip reusable
  function Chip({
    active, onClick, children, color,
  }: {
    active: boolean;
    onClick: () => void;
    children: React.ReactNode;
    color?: string;
  }) {
    return (
      <button
        onClick={onClick}
        className={`px-3 py-1 text-xs rounded-full border transition-colors ${
          active
            ? `${color ?? "bg-accent border-accent"} text-white font-semibold`
            : "border-border text-muted hover:border-accent hover:text-accent"
        }`}
      >
        {children}
      </button>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="font-serif font-bold text-3xl text-accent">Seguimiento</h1>
        <p className="text-sm text-muted mt-1">
          {fmtDate(today)} · <strong className="text-text font-mono">{totalTickets}</strong> ticket
          {totalTickets !== 1 ? "s" : ""} requieren atención · {finalByOwner.length} responsable
          {finalByOwner.length !== 1 ? "s" : ""}
        </p>
        <div className="mt-2"><LastUpdate fetchedAt={fetchedAt} /></div>
      </div>

      {/* PANEL DE FILTROS */}
      <div className="bg-surface border border-border rounded-xl p-4 space-y-3">
        {/* Fila 1: search + urgencia */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted text-xs">🔍</span>
            <input
              type="text"
              placeholder="Buscar ticket, sucursal o responsable..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm border border-border rounded-lg bg-bg focus:outline-none focus:border-accent"
            />
          </div>

          <div className="flex gap-2 flex-wrap">
            <Chip
              active={urgency.has("vencido")}
              onClick={() => toggleUrg("vencido")}
              color="bg-brugalired border-brugalired"
            >
              🔴 Vencidos
            </Chip>
            <Chip
              active={urgency.has("sin_respuesta")}
              onClick={() => toggleUrg("sin_respuesta")}
              color="bg-brugaliamber border-brugaliamber"
            >
              🟡 Sin respuesta
            </Chip>
            <Chip
              active={urgency.has("estancado")}
              onClick={() => toggleUrg("estancado")}
              color="bg-brugaliorange border-brugaliorange"
            >
              🟠 Estancados
            </Chip>
          </div>

          {hasFilters && (
            <button
              onClick={clearFilters}
              className="px-3 py-2 text-xs rounded-lg border border-border text-muted hover:bg-surface2 transition-colors ml-auto"
            >
              ✕ Limpiar filtros
            </button>
          )}
        </div>

        {/* Fila 2: área */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] uppercase tracking-wider text-muted font-semibold mr-1">Área:</span>
          <Chip active={activeArea === null} onClick={() => setActiveArea(null)}>Todas</Chip>
          {areas.map((area) => (
            <Chip
              key={area}
              active={activeArea === area}
              onClick={() => setActiveArea(activeArea === area ? null : area)}
            >
              {area}
            </Chip>
          ))}
        </div>

        {/* Fila 3: responsable */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] uppercase tracking-wider text-muted font-semibold mr-1">Responsable:</span>
          <Chip active={activeOwner === null} onClick={() => setActiveOwner(null)}>Todos</Chip>
          {owners.map((o) => (
            <Chip
              key={o.id}
              active={activeOwner === o.id}
              onClick={() => setActiveOwner(activeOwner === o.id ? null : o.id)}
            >
              {o.name}
            </Chip>
          ))}
        </div>

        {/* Fila 4: sucursal */}
        {branches.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] uppercase tracking-wider text-muted font-semibold mr-1">Sucursal:</span>
            <Chip active={activeBranch === null} onClick={() => setActiveBranch(null)}>Todas</Chip>
            {branches.slice(0, 15).map((b) => (
              <Chip
                key={b}
                active={activeBranch === b}
                onClick={() => setActiveBranch(activeBranch === b ? null : b)}
              >
                {b}
              </Chip>
            ))}
            {branches.length > 15 && (
              <span className="text-[10px] text-dim self-center">
                +{branches.length - 15} más — usá el buscador
              </span>
            )}
          </div>
        )}
      </div>

      {/* Contenido */}
      {totalTickets === 0 ? (
        <div className="bg-surface border border-brugaligreen rounded-xl p-8 text-center">
          <div className="text-brugaligreen text-3xl mb-2">✓</div>
          <div className="font-semibold text-brugaligreen">
            {hasFilters
              ? "Ningún ticket cumple los filtros aplicados."
              : "Todo al día — sin tickets que requieran seguimiento."}
          </div>
          {hasFilters && (
            <button
              onClick={clearFilters}
              className="mt-3 text-accent underline text-sm"
            >
              Limpiar filtros
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {finalByOwner.map((owner) => (
            <div key={owner.ownerId ?? "sin"} className="bg-surface border border-border rounded-xl overflow-hidden">
              <div className="bg-surface2 px-6 py-4 flex flex-wrap items-center justify-between gap-3 border-b border-border">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-accent/10 text-accent flex items-center justify-center font-bold text-sm">
                    {owner.ownerName.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="font-semibold text-base">{owner.ownerName}</div>
                    <div className="text-xs text-muted">
                      {owner.tickets.length} ticket{owner.tickets.length !== 1 ? "s" : ""} para destrabar
                    </div>
                  </div>
                </div>
                <div className="flex gap-3 text-xs flex-wrap">
                  {owner.tickets.some((it) => it.ticket.isDelayed) && (
                    <span className="bg-brugalired/10 text-brugalired px-3 py-1 rounded-full font-mono font-semibold">
                      {owner.tickets.filter((it) => it.ticket.isDelayed).length} vencido(s)
                    </span>
                  )}
                </div>
              </div>

              <div className="divide-y divide-border">
                {owner.tickets.map(({ ticket: t, reasons }) => (
                  <div key={t.id} className="px-6 py-3 flex flex-wrap items-start justify-between gap-3">
                    <div className="flex flex-col gap-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <a
                          href={t.hubspotUrl}
                          target="_blank"
                          rel="noopener"
                          className="font-medium text-sm text-accent underline decoration-dotted hover:text-brugaliorange"
                        >
                          {t.subject}
                        </a>
                        <span className="text-xs text-muted">{t.pipelineName}</span>
                        {t.branch && (
                          <span className="text-xs bg-surface2 text-muted px-2 py-0.5 rounded-full">{t.branch}</span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {reasons.map((r) => reasonTag(r))}
                        <span className="text-xs text-dim ml-1">
                          Etapa: {t.stageLabel} · Ingresó {fmtDate(t.createdAt)}
                          {t.dueDate && ` · Vence ${fmtDate(t.dueDate)}`}
                        </span>
                      </div>
                    </div>
                    <a
                      href={t.hubspotUrl}
                      target="_blank"
                      rel="noopener"
                      className="text-xs text-accent border border-accent/30 hover:bg-accent hover:text-white px-3 py-1.5 rounded-full transition-colors shrink-0"
                    >
                      Ver en HubSpot →
                    </a>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
