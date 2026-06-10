"use client";
import { useState, useMemo } from "react";
import type { Ticket, DelaySource, OwnerHistoryMap } from "@/lib/hubspot";
import { DELAY_COLORS, DELAY_LABELS } from "@/lib/hubspot";
import { fmtDate, buildAgentMetrics } from "@/lib/analytics";
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

export default function SeguimientoView({
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

  // Solo Q2 + abiertos
  const openTickets = useMemo(
    () => allTickets.filter((t) => t.quarter === 2 && t.isOpen),
    [allTickets]
  );

  // Tickets demorados (foco de la vista)
  const delayedTickets = useMemo(
    () => openTickets.filter((t) => t.isDelayed),
    [openTickets]
  );

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

  // FILTROS
  const [search, setSearch] = useState("");
  const [activeArea, setActiveArea] = useState<string | null>(null);
  const [activeBranch, setActiveBranch] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<DelaySource | null>(null);

  // Catálogos
  const areas = useMemo(() => {
    const s = new Set<string>();
    for (const t of delayedTickets) s.add(t.pipelineName);
    return Array.from(s).sort();
  }, [delayedTickets]);

  const branches = useMemo(() => {
    const s = new Set<string>();
    for (const t of delayedTickets) if (t.branch) s.add(t.branch);
    return Array.from(s).sort();
  }, [delayedTickets]);

  // Aplicar filtros
  const filtered = useMemo(() => {
    let arr = delayedTickets;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      arr = arr.filter(
        (t) =>
          t.subject.toLowerCase().includes(q) ||
          (t.branch && t.branch.toLowerCase().includes(q)) ||
          (t.ownerName && t.ownerName.toLowerCase().includes(q))
      );
    }
    if (activeArea) arr = arr.filter((t) => t.pipelineName === activeArea);
    if (activeBranch) arr = arr.filter((t) => t.branch === activeBranch);
    if (activeCategory) arr = arr.filter((t) => t.delaySource === activeCategory);
    return arr;
  }, [delayedTickets, search, activeArea, activeBranch, activeCategory]);

  // Particionar por categoría de demora
  const buckets = useMemo(() => {
    const b: Record<DelaySource, Ticket[]> = {
      internal_waiting: [],
      internal_unassigned: [],
      internal_working: [],
      external: [],
      other: [],
    };
    for (const t of filtered) b[t.delaySource].push(t);
    // Ordenar cada bucket por días en etapa desc
    for (const k of Object.keys(b) as DelaySource[]) {
      b[k].sort((a, z) => z.daysInCurrentStage - a.daysInCurrentStage);
    }
    return b;
  }, [filtered]);

  // Counts globales (sobre todos los demorados, no filtrados — para los KPIs arriba)
  const totalCounts = useMemo(() => {
    const c = { total: 0, external: 0, internal_waiting: 0, internal_working: 0, internal_unassigned: 0, other: 0 };
    for (const t of delayedTickets) {
      c.total++;
      c[t.delaySource]++;
    }
    return c;
  }, [delayedTickets]);

  // Agente metrics (sobre Q2 + history)
  const agents = useMemo(
    () => buildAgentMetrics(allTickets.filter((t) => t.quarter === 2), historyMap).slice(0, 8),
    [allTickets, historyMap]
  );

  const hasFilters = !!search || activeArea || activeBranch || activeCategory;
  function clearFilters() {
    setSearch("");
    setActiveArea(null);
    setActiveBranch(null);
    setActiveCategory(null);
  }

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

  function TicketRow({ t }: { t: Ticket }) {
    const sourceColor = DELAY_COLORS[t.delaySource];
    const stageDaysTone =
      t.daysInCurrentStage > 14 ? "text-brugalired"
      : t.daysInCurrentStage > 7 ? "text-brugaliamber"
      : "text-text";
    return (
      <div className="px-4 py-3 border-t border-border first:border-t-0 hover:bg-surface2/40 transition-colors">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ backgroundColor: sourceColor }} />
              <a
                href={t.hubspotUrl}
                target="_blank"
                rel="noopener"
                className="font-medium text-sm text-accent underline decoration-dotted hover:text-brugaliorange"
              >
                {t.subject}
              </a>
              {t.branch && (
                <span className="text-[11px] bg-surface2 text-muted px-2 py-0.5 rounded-full">{t.branch}</span>
              )}
              <span className="text-[11px] text-muted">{t.pipelineName}</span>
            </div>
            <div className="text-[11px] text-muted mt-1">
              Etapa: <strong>{t.stageLabel}</strong>
              {" · "}
              Responsable: <strong>{t.ownerName ?? "Sin asignar"}</strong>
              {" · "}
              Ingresó {fmtDate(t.createdAt)}
            </div>
          </div>
          <div className="text-right flex-shrink-0">
            <div className={`font-mono font-semibold text-sm ${stageDaysTone}`}>
              {t.daysInCurrentStage}d en etapa
            </div>
            <div className="text-[10px] text-dim">
              {t.daysOverdue !== null ? `${t.daysOverdue}d vencido` : `${t.daysOpen}d abiertos`}
            </div>
          </div>
        </div>
      </div>
    );
  }

  function Bucket({
    title, source, accent, description, priority,
  }: {
    title: string;
    source: DelaySource;
    accent: string;
    description: string;
    priority: "critical" | "informational";
  }) {
    const tickets = buckets[source];
    if (tickets.length === 0) return null;

    return (
      <div className={`bg-surface border-2 rounded-xl overflow-hidden ${priority === "critical" ? "border-brugalired" : "border-border"}`}>
        <div className={`px-5 py-4 ${priority === "critical" ? "bg-brugalired/5" : "bg-surface2"}`}>
          <div className="flex items-baseline justify-between gap-3 flex-wrap">
            <div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: accent }} />
                <h3 className="font-serif font-bold text-base" style={{ color: accent }}>{title}</h3>
                <span className="text-xs text-muted">({tickets.length} ticket{tickets.length !== 1 ? "s" : ""})</span>
              </div>
              <p className="text-xs text-muted mt-1">{description}</p>
            </div>
          </div>
        </div>
        <div className="max-h-[400px] overflow-y-auto">
          {tickets.map((t) => <TicketRow key={t.id} t={t} />)}
        </div>
      </div>
    );
  }

  // KPI helper
  function Kpi({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color: string }) {
    return (
      <div className="rounded-xl border border-border p-4 bg-surface" style={{ borderTopWidth: 3, borderTopColor: color }}>
        <div className="text-[10px] uppercase tracking-wider text-muted font-semibold mb-1.5">{label}</div>
        <div className="font-mono text-3xl font-semibold" style={{ color }}>{value}</div>
        {sub && <div className="text-[11px] text-muted mt-1">{sub}</div>}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="font-serif font-bold text-3xl text-accent">Seguimiento</h1>
        <p className="text-sm text-muted mt-1">
          Tickets demorados clasificados por dónde está la traba real.
        </p>
        <div className="mt-2"><LastUpdate fetchedAt={fetchedAt} /></div>
      </div>

      {/* KPIs de panorama */}
      <section>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Kpi
            label="Demorados totales"
            value={totalCounts.total}
            sub="+ 7 días sin cerrar"
            color="#1d1d1b"
          />
          <Kpi
            label="🔴 Bloqueados por otra área"
            value={totalCounts.internal_waiting}
            sub="Esperando escalamiento a otra área Brugali"
            color={DELAY_COLORS.internal_waiting}
          />
          <Kpi
            label="🟢 En progreso"
            value={totalCounts.internal_working + totalCounts.internal_unassigned}
            sub="Dentro del embudo (en proceso o sin asignar)"
            color={DELAY_COLORS.internal_working}
          />
          <Kpi
            label="🟠 Esperando local"
            value={totalCounts.external}
            sub="Pelota afuera de Brugali"
            color={DELAY_COLORS.external}
          />
        </div>
        {totalCounts.internal_waiting > 0 && (
          <div className="mt-3 text-xs text-brugalired font-medium">
            🚨 Hay <strong>{totalCounts.internal_waiting}</strong> tickets bloqueados esperando que otra área de Brugali actúe — el responsable del embudo no puede destrabarlos solo, hay que escalar.
          </div>
        )}
      </section>

      {/* PANEL DE FILTROS */}
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
              color={`border-2`}
            >
              <span className="inline-block w-2 h-2 rounded-sm mr-1.5 align-middle" style={{ backgroundColor: DELAY_COLORS[src] }} />
              {DELAY_LABELS[src]}
            </Chip>
          ))}
        </div>

        {/* Área */}
        {areas.length > 0 && (
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
        )}

        {/* Sucursal */}
        {branches.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] uppercase tracking-wider text-muted font-semibold mr-1">Sucursal:</span>
            <Chip active={activeBranch === null} onClick={() => setActiveBranch(null)}>Todas</Chip>
            {branches.slice(0, 12).map((b) => (
              <Chip
                key={b}
                active={activeBranch === b}
                onClick={() => setActiveBranch(activeBranch === b ? null : b)}
              >
                {b}
              </Chip>
            ))}
            {branches.length > 12 && (
              <span className="text-[10px] text-dim self-center">+{branches.length - 12} más — usá el buscador</span>
            )}
          </div>
        )}

        <div className="text-[11px] text-muted">
          Mostrando <strong className="text-text font-semibold font-mono">{filtered.length}</strong> de {delayedTickets.length} tickets demorados
        </div>
      </div>

      {/* Buckets en orden de prioridad */}
      {filtered.length === 0 ? (
        <div className="bg-surface border border-brugaligreen rounded-xl p-8 text-center">
          <div className="text-brugaligreen text-3xl mb-2">✓</div>
          <div className="font-semibold text-brugaligreen">
            {hasFilters
              ? "Ningún ticket demorado cumple los filtros aplicados."
              : "Sin tickets demorados. ¡Felicitaciones!"}
          </div>
          {hasFilters && (
            <button onClick={clearFilters} className="mt-3 text-accent underline text-sm">
              Limpiar filtros
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-5">
          <Bucket
            title="Bloqueados por otra área Brugali"
            source="internal_waiting"
            accent={DELAY_COLORS.internal_waiting}
            description="Estos tickets dependen de otra área de Brugali (Compras, IT, Logística, Gerencia, etc.) que tiene que actuar. El responsable del embudo no puede destrabarlos solo: hay que escalar al área correspondiente. Acción típica: identificar qué área traba y mandar mail/llamado."
            priority="critical"
          />
          <Bucket
            title="Sin asignar dentro del embudo"
            source="internal_unassigned"
            accent={DELAY_COLORS.internal_unassigned}
            description="Nadie del embudo agarró estos tickets todavía. Asignar responsable ahora."
            priority="critical"
          />
          <Bucket
            title="En progreso dentro del embudo"
            source="internal_working"
            accent={DELAY_COLORS.internal_working}
            description="El responsable del embudo está activamente trabajándolos. Si llevan más de 14 días en etapa, consultarle qué los traba."
            priority="informational"
          />
          <Bucket
            title="Esperando a la sucursal/cliente"
            source="external"
            accent={DELAY_COLORS.external}
            description="La pelota está afuera de Brugali. Útil para que la ejecutiva de cuenta llame al local. No es responsabilidad del embudo, pero conviene seguimiento."
            priority="informational"
          />
        </div>
      )}

      {/* Por agente */}
      {agents.length > 0 && (
        <section>
          <h2 className="font-serif font-bold text-xl text-accent mb-3">Por agente — quién sostiene más demorados</h2>
          <div className="bg-surface border border-border rounded-xl overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface2 text-muted uppercase tracking-wider text-xs">
                <tr>
                  <th className="text-left py-3 px-3">Agente</th>
                  <th className="text-right py-3 px-3">Carga actual</th>
                  <th className="text-right py-3 px-3">Demorados</th>
                  <th className="text-right py-3 px-3">Días promedio sosteniendo</th>
                  <th className="text-right py-3 px-3">Tiempo resolución</th>
                </tr>
              </thead>
              <tbody>
                {agents.map((a) => {
                  const delayedTone =
                    a.totalDelayed >= 5 ? "text-brugalired"
                    : a.totalDelayed >= 2 ? "text-brugaliamber"
                    : "text-muted";
                  const holdingTone =
                    (a.avgDaysHolding ?? 0) > 10 ? "text-brugalired font-semibold"
                    : (a.avgDaysHolding ?? 0) > 5 ? "text-brugaliamber"
                    : "text-text";
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
                      <td className={`py-2 px-3 text-right font-mono font-semibold ${delayedTone}`}>
                        {a.totalDelayed || "—"}
                      </td>
                      <td className={`py-2 px-3 text-right font-mono ${holdingTone}`}>
                        {a.avgDaysHolding !== null ? `${a.avgDaysHolding.toFixed(1)}d` : "—"}
                      </td>
                      <td className="py-2 px-3 text-right font-mono text-muted">
                        {a.avgResolutionDays !== null ? `${a.avgResolutionDays.toFixed(1)}d` : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-dim mt-2">
            <strong>Días promedio sosteniendo</strong>: cuánto se sienta el agente sobre un ticket demorado antes de soltarlo o cerrarlo (basado en historial real de reasignación). Si está en rojo, vale la pena conversación uno a uno.
          </p>
        </section>
      )}
    </div>
  );
}
