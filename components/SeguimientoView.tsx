"use client";
import { useState, useMemo } from "react";
import type { Ticket, DelaySource } from "@/lib/hubspot";
import { DELAY_COLORS, DELAY_LABELS } from "@/lib/hubspot";
import { fmtDate } from "@/lib/analytics";
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

type SerializedHistoryEntry = {
  ownerId: string;
  ownerName: string;
  start: string;
  end: string | null;
  days: number;
};

type SerializedActivity = {
  id: string;
  type: string;
  subject: string | null;
  body: string | null;
  assigneeOwnerId: string | null;
  assigneeOwnerName: string | null;
  timestamp: string;
  status: string | null;
};

type EffectiveOwnerData = {
  ownerId: string;
  ownerName: string;
  reason: string;
  reasonText: string;
  daysWaiting: number;
};

const ACTIVITY_ICON: Record<string, string> = {
  task: "📋",
  note: "📝",
  email: "✉️",
  call: "📞",
  meeting: "📅",
  other: "•",
};

export default function SeguimientoView({
  tickets: raw,
  fetchedAt,
  ownerHistory = {},
  activities = {},
  effectiveOwners = {},
}: {
  tickets: SerializedTicket[];
  fetchedAt: string;
  ownerHistory?: Record<string, SerializedHistoryEntry[]>;
  activities?: Record<string, SerializedActivity[]>;
  effectiveOwners?: Record<string, EffectiveOwnerData>;
}) {
  const allTickets = useMemo(() => raw.map(hydrate), [raw]);

  const delayedTickets = useMemo(
    () =>
      allTickets.filter(
        (t) => t.quarter === 2 && t.isOpen && t.isDelayed
      ),
    [allTickets]
  );

  // FILTROS
  const [search, setSearch] = useState("");
  const [activeArea, setActiveArea] = useState<string | null>(null);
  const [activeOriginEmbudo, setActiveOriginEmbudo] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<DelaySource | null>(null);
  const [expandedTicketId, setExpandedTicketId] = useState<string | null>(null);

  const areasOrigin = useMemo(() => {
    const s = new Set<string>();
    for (const t of delayedTickets) s.add(t.pipelineName);
    return Array.from(s).sort();
  }, [delayedTickets]);

  // Aplicar filtros
  const filteredTickets = useMemo(() => {
    let arr = delayedTickets;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      arr = arr.filter((t) => {
        const eff = effectiveOwners[t.id];
        return (
          t.subject.toLowerCase().includes(q) ||
          (t.branch && t.branch.toLowerCase().includes(q)) ||
          (eff && eff.ownerName.toLowerCase().includes(q))
        );
      });
    }
    if (activeOriginEmbudo) arr = arr.filter((t) => t.pipelineName === activeOriginEmbudo);
    if (activeCategory) arr = arr.filter((t) => t.delaySource === activeCategory);
    return arr;
  }, [delayedTickets, search, activeOriginEmbudo, activeCategory, effectiveOwners]);

  // Agrupar por responsable efectivo
  const groupedByResponsable = useMemo(() => {
    const map = new Map<
      string,
      {
        ownerId: string;
        ownerName: string;
        tickets: Ticket[];
        // Distribución por embudo origen
        byOriginEmbudo: Record<string, number>;
      }
    >();
    for (const t of filteredTickets) {
      const eff = effectiveOwners[t.id];
      const key = eff ? eff.ownerId : (t.ownerId ?? "__sin__");
      const name = eff ? eff.ownerName : (t.ownerName ?? "Sin asignar");
      let g = map.get(key);
      if (!g) {
        g = { ownerId: key, ownerName: name, tickets: [], byOriginEmbudo: {} };
        map.set(key, g);
      }
      g.tickets.push(t);
      g.byOriginEmbudo[t.pipelineName] = (g.byOriginEmbudo[t.pipelineName] || 0) + 1;
    }
    // Ordenar tickets dentro de cada grupo por días de espera del responsable
    for (const g of Array.from(map.values())) {
      g.tickets.sort((a, b) => {
        const da = effectiveOwners[a.id]?.daysWaiting ?? a.daysOpen;
        const db = effectiveOwners[b.id]?.daysWaiting ?? b.daysOpen;
        return db - da;
      });
    }
    return Array.from(map.values()).sort((a, b) => b.tickets.length - a.tickets.length);
  }, [filteredTickets, effectiveOwners]);

  // Filtro adicional: si activeArea está set, filtrar grupos
  const finalGroups = useMemo(() => {
    if (!activeArea) return groupedByResponsable;
    return groupedByResponsable.filter((g) => g.ownerId === activeArea);
  }, [groupedByResponsable, activeArea]);

  const totalTickets = finalGroups.reduce((s, g) => s + g.tickets.length, 0);
  const hasFilters = !!search || !!activeArea || !!activeOriginEmbudo || !!activeCategory;
  function clearFilters() {
    setSearch("");
    setActiveArea(null);
    setActiveOriginEmbudo(null);
    setActiveCategory(null);
  }

  function Chip({
    active, onClick, children,
  }: {
    active: boolean;
    onClick: () => void;
    children: React.ReactNode;
  }) {
    return (
      <button
        onClick={onClick}
        className={`px-3 py-1 text-xs rounded-full border transition-colors ${
          active
            ? "bg-accent text-white border-accent font-semibold"
            : "border-border text-muted hover:border-accent hover:text-accent"
        }`}
      >
        {children}
      </button>
    );
  }

  function TimelineEntry({ children, color }: { children: React.ReactNode; color: string }) {
    return (
      <div className="flex gap-3 text-xs">
        <div className="flex flex-col items-center flex-shrink-0">
          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
          <div className="w-px flex-1 bg-border" />
        </div>
        <div className="pb-3 flex-1 min-w-0">{children}</div>
      </div>
    );
  }

  function TicketCard({ t }: { t: Ticket }) {
    const eff = effectiveOwners[t.id];
    const isExpanded = expandedTicketId === t.id;
    const sourceColor = DELAY_COLORS[t.delaySource];
    const history = ownerHistory[t.id] || [];
    const acts = activities[t.id] || [];

    const reasonBadge =
      eff?.reason === "last_assigned_task" ? "📋 Tarea pendiente"
      : eff?.reason === "last_assigned_note" ? "📝 Última actividad"
      : eff?.reason === "current_ticket_owner" ? "👤 Responsable actual"
      : "🚨 Sin asignar";

    return (
      <div className="border-t border-border first:border-t-0">
        <button
          onClick={() => setExpandedTicketId(isExpanded ? null : t.id)}
          className="w-full text-left px-4 py-3 hover:bg-surface2/40 transition-colors"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-[10px] transition-transform inline-block font-mono ${isExpanded ? "rotate-90" : ""}`}>▶</span>
                <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ backgroundColor: sourceColor }} />
                <span className="font-medium text-sm">{t.subject}</span>
                {t.branch && (
                  <span className="text-[11px] bg-surface2 text-muted px-2 py-0.5 rounded-full">{t.branch}</span>
                )}
                <span className="text-[11px] text-muted">{t.pipelineName}</span>
              </div>
              <div className="text-[11px] text-muted mt-1 ml-6">
                {reasonBadge} · Etapa: <strong>{t.stageLabel}</strong> · Ingresó {fmtDate(t.createdAt)}
                {eff?.reason !== "unassigned" && (
                  <> · Lleva <strong className="text-text">{eff?.daysWaiting ?? 0}d</strong> esperando</>
                )}
              </div>
              {eff?.reason === "last_assigned_task" && (
                <div className="text-[11px] text-brugaliamber mt-1 ml-6 italic">
                  {eff.reasonText}
                </div>
              )}
            </div>
            <div className="text-right flex-shrink-0">
              <div className="font-mono font-semibold text-sm text-brugalired">
                {t.daysOverdue !== null ? `${t.daysOverdue}d vencido` : `${t.daysOpen}d abierto`}
              </div>
              <div className="text-[10px] text-dim">
                {t.daysInCurrentStage}d en etapa actual
              </div>
            </div>
          </div>
        </button>

        {isExpanded && (
          <div className="px-6 py-4 bg-surface2/30 border-t border-border">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Timeline de owners */}
              <div>
                <div className="text-[11px] uppercase tracking-wider text-muted font-semibold mb-3">
                  📍 Por dónde pasó el ticket
                </div>
                {history.length === 0 ? (
                  <div className="text-xs text-muted">Sin historial disponible</div>
                ) : (
                  <div className="space-y-0">
                    {history.map((entry, i) => (
                      <TimelineEntry key={`${entry.ownerId}-${entry.start}`} color="#254957">
                        <div className="font-medium text-sm">{entry.ownerName}</div>
                        <div className="text-[10px] text-muted">
                          {fmtDate(new Date(entry.start))} {entry.end ? `→ ${fmtDate(new Date(entry.end))}` : "→ hoy"}
                          {" · "}
                          <strong className="text-text">{entry.days}d</strong>
                          {i === history.length - 1 && (
                            <span className="ml-2 text-[10px] text-brugaliorange font-semibold">Actual</span>
                          )}
                        </div>
                      </TimelineEntry>
                    ))}
                  </div>
                )}
              </div>

              {/* Actividades */}
              <div>
                <div className="text-[11px] uppercase tracking-wider text-muted font-semibold mb-3">
                  💬 Últimas actividades del ticket
                </div>
                {acts.length === 0 ? (
                  <div className="text-xs text-muted">Sin actividades registradas</div>
                ) : (
                  <div className="space-y-2 max-h-72 overflow-y-auto pr-2">
                    {acts.slice(0, 8).map((a) => (
                      <div key={a.id} className="text-xs border-l-2 border-border pl-3 py-1">
                        <div className="flex items-center gap-1.5">
                          <span>{ACTIVITY_ICON[a.type] || "•"}</span>
                          <span className="text-muted text-[10px] uppercase tracking-wider">{a.type}</span>
                          {a.status && a.status !== "COMPLETED" && (
                            <span className="bg-brugaliamber/10 text-brugaliamber px-1.5 rounded text-[10px]">
                              {a.status}
                            </span>
                          )}
                          {a.status === "COMPLETED" && (
                            <span className="bg-brugaligreen/10 text-brugaligreen px-1.5 rounded text-[10px]">
                              ✓ completada
                            </span>
                          )}
                        </div>
                        {a.subject && <div className="font-medium mt-0.5">{a.subject}</div>}
                        {a.body && a.body.length > 0 && (
                          <div className="text-muted mt-0.5 text-[11px] line-clamp-2">{a.body}</div>
                        )}
                        <div className="text-dim text-[10px] mt-0.5">
                          {fmtDate(new Date(a.timestamp))}
                          {a.assigneeOwnerName && <> · asignado a <strong>{a.assigneeOwnerName}</strong></>}
                        </div>
                      </div>
                    ))}
                    {acts.length > 8 && (
                      <div className="text-[10px] text-dim">
                        + {acts.length - 8} actividades más — abrí en HubSpot para ver todas
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="mt-4 flex justify-end">
              <a
                href={t.hubspotUrl}
                target="_blank"
                rel="noopener"
                className="text-xs text-accent border border-accent/30 hover:bg-accent hover:text-white px-3 py-1.5 rounded-full transition-colors"
              >
                Abrir ticket completo en HubSpot →
              </a>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="font-serif font-bold text-3xl text-accent">Seguimiento</h1>
        <p className="text-sm text-muted mt-1">
          Tickets demorados agrupados por <strong>responsable efectivo</strong> — a quién hay que empujar para que actúe.
        </p>
        <div className="mt-2"><LastUpdate fetchedAt={fetchedAt} /></div>
      </div>

      {/* FILTROS */}
      <div className="bg-surface border border-border rounded-xl p-4 space-y-3">
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
          {hasFilters && (
            <button
              onClick={clearFilters}
              className="px-3 py-2 text-xs rounded-lg border border-border text-muted hover:bg-surface2 transition-colors ml-auto"
            >
              ✕ Limpiar filtros
            </button>
          )}
        </div>

        {/* Categoría de demora */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] uppercase tracking-wider text-muted font-semibold mr-1">Tipo de demora:</span>
          <Chip active={activeCategory === null} onClick={() => setActiveCategory(null)}>Todos</Chip>
          {(["internal_waiting", "internal_unassigned", "internal_working", "external"] as DelaySource[]).map((src) => (
            <Chip
              key={src}
              active={activeCategory === src}
              onClick={() => setActiveCategory(activeCategory === src ? null : src)}
            >
              <span className="inline-block w-2 h-2 rounded-sm mr-1.5 align-middle" style={{ backgroundColor: DELAY_COLORS[src] }} />
              {DELAY_LABELS[src]}
            </Chip>
          ))}
        </div>

        {/* Embudo origen */}
        {areasOrigin.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] uppercase tracking-wider text-muted font-semibold mr-1">Embudo origen:</span>
            <Chip active={activeOriginEmbudo === null} onClick={() => setActiveOriginEmbudo(null)}>Todos</Chip>
            {areasOrigin.map((area) => (
              <Chip
                key={area}
                active={activeOriginEmbudo === area}
                onClick={() => setActiveOriginEmbudo(activeOriginEmbudo === area ? null : area)}
              >
                {area}
              </Chip>
            ))}
          </div>
        )}

        <div className="text-[11px] text-muted">
          <strong className="font-mono text-text">{totalTickets}</strong> ticket{totalTickets !== 1 ? "s" : ""} agrupado{totalTickets !== 1 ? "s" : ""} en <strong className="font-mono text-text">{finalGroups.length}</strong> responsable{finalGroups.length !== 1 ? "s" : ""} a empujar
        </div>
      </div>

      {/* Grupos */}
      {finalGroups.length === 0 ? (
        <div className="bg-surface border border-brugaligreen rounded-xl p-8 text-center">
          <div className="text-brugaligreen text-3xl mb-2">✓</div>
          <div className="font-semibold text-brugaligreen">
            {hasFilters ? "Ningún ticket cumple los filtros aplicados." : "Sin tickets demorados. ¡Felicitaciones!"}
          </div>
          {hasFilters && (
            <button onClick={clearFilters} className="mt-3 text-accent underline text-sm">
              Limpiar filtros
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {finalGroups.map((g) => {
            const breakdownByOrigin = Object.entries(g.byOriginEmbudo).sort((a, b) => b[1] - a[1]);
            return (
              <div key={g.ownerId} className="bg-surface border border-border rounded-xl overflow-hidden">
                {/* Header del grupo */}
                <div className="bg-surface2 px-5 py-4 border-b border-border flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-accent/10 text-accent flex items-center justify-center font-bold flex-shrink-0">
                      {g.ownerName.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="font-semibold text-base">{g.ownerName}</div>
                      <div className="text-[11px] text-muted">
                        Hay que empujarlo/a por <strong>{g.tickets.length}</strong> ticket{g.tickets.length !== 1 ? "s" : ""}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 text-[11px]">
                    {breakdownByOrigin.map(([area, n]) => (
                      <span
                        key={area}
                        className="bg-bg border border-border px-2 py-1 rounded-full font-mono"
                      >
                        {area}: <strong>{n}</strong>
                      </span>
                    ))}
                  </div>
                </div>

                {/* Tickets */}
                <div>
                  {g.tickets.map((t) => <TicketCard key={t.id} t={t} />)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
