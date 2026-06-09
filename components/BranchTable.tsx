"use client";
import { useState, useMemo, Fragment } from "react";
import type { BranchMetrics } from "@/lib/analytics";
import { fmtDate } from "@/lib/analytics";

type SortKey = "name" | "total" | "closeRate" | "delayed" | "daysSinceActivity";

// Colores Brugali por área
const AREA_COLORS: Record<string, string> = {
  Sistemas: "#254957",
  Operaciones: "#339f8f",
  Administración: "#e6a303",
  Calidad: "#e63323",
  Logística: "#f07e26",
  Marketing: "#6a6862",
};

const AREA_ORDER = ["Sistemas", "Operaciones", "Administración", "Calidad", "Logística", "Marketing"];

export default function BranchTable({ branches }: { branches: BranchMetrics[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("delayed");
  const [asc, setAsc] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  // FILTROS
  const [search, setSearch] = useState("");
  const [onlyDelayed, setOnlyDelayed] = useState(false);
  const [activeArea, setActiveArea] = useState<string | null>(null);
  const [staleOnly, setStaleOnly] = useState(false); // sucursales con última act > 7d

  function handleSort(key: SortKey) {
    if (sortKey === key) setAsc(!asc);
    else {
      setSortKey(key);
      setAsc(key === "name");
    }
  }

  // Aplicar filtros y orden
  const filtered = useMemo(() => {
    let arr = [...branches];
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      arr = arr.filter((b) => b.name.toLowerCase().includes(q));
    }
    if (onlyDelayed) arr = arr.filter((b) => b.delayed > 0);
    if (activeArea) arr = arr.filter((b) => (b.byArea[activeArea] || 0) > 0);
    if (staleOnly) arr = arr.filter((b) => (b.daysSinceActivity ?? 0) > 7);
    arr.sort((a, b) => {
      let va: string | number = 0;
      let vb: string | number = 0;
      if (sortKey === "name") { va = a.name; vb = b.name; }
      else if (sortKey === "total") { va = a.total; vb = b.total; }
      else if (sortKey === "closeRate") { va = a.closeRate; vb = b.closeRate; }
      else if (sortKey === "delayed") { va = a.delayed; vb = b.delayed; }
      else if (sortKey === "daysSinceActivity") {
        va = a.daysSinceActivity ?? 9999;
        vb = b.daysSinceActivity ?? 9999;
      }
      if (typeof va === "string") return asc ? va.localeCompare(vb as string) : (vb as string).localeCompare(va);
      return asc ? va - (vb as number) : (vb as number) - va;
    });
    return arr;
  }, [branches, search, onlyDelayed, activeArea, staleOnly, sortKey, asc]);

  const totalShown = filtered.length;
  const totalAll = branches.length;
  const hasFilters = !!search || onlyDelayed || activeArea || staleOnly;

  function clearFilters() {
    setSearch("");
    setOnlyDelayed(false);
    setActiveArea(null);
    setStaleOnly(false);
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

  function AreaBar({ byArea, total }: { byArea: Record<string, number>; total: number }) {
    return (
      <div
        className="flex w-32 h-2 rounded overflow-hidden bg-surface2"
        title={Object.entries(byArea).map(([k, v]) => `${k}: ${v}`).join(" · ")}
      >
        {AREA_ORDER.map((area) => {
          const n = byArea[area] || 0;
          if (n === 0) return null;
          return (
            <div
              key={area}
              style={{ width: `${(n / total) * 100}%`, backgroundColor: AREA_COLORS[area] || "#999" }}
            />
          );
        })}
      </div>
    );
  }

  return (
    <div>
      {/* Panel de filtros */}
      <div className="bg-surface border border-border rounded-xl p-4 mb-4 space-y-3">
        {/* Fila 1: search + toggles */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted text-xs">🔍</span>
            <input
              type="text"
              placeholder="Buscar sucursal..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm border border-border rounded-lg bg-bg focus:outline-none focus:border-accent transition-colors"
            />
          </div>

          <button
            onClick={() => setOnlyDelayed(!onlyDelayed)}
            className={`px-3 py-2 text-xs rounded-lg border transition-colors whitespace-nowrap ${
              onlyDelayed
                ? "bg-brugalired/10 border-brugalired text-brugalired font-semibold"
                : "border-border text-muted hover:border-brugalired hover:text-brugalired"
            }`}
          >
            🔴 Solo con demorados
          </button>

          <button
            onClick={() => setStaleOnly(!staleOnly)}
            className={`px-3 py-2 text-xs rounded-lg border transition-colors whitespace-nowrap ${
              staleOnly
                ? "bg-brugaliamber/10 border-brugaliamber text-brugaliamber font-semibold"
                : "border-border text-muted hover:border-brugaliamber hover:text-brugaliamber"
            }`}
          >
            ⏰ Sin actividad +7d
          </button>

          {hasFilters && (
            <button
              onClick={clearFilters}
              className="px-3 py-2 text-xs rounded-lg border border-border text-muted hover:bg-surface2 transition-colors ml-auto"
            >
              ✕ Limpiar filtros
            </button>
          )}
        </div>

        {/* Fila 2: chips por área */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] uppercase tracking-wider text-muted font-semibold mr-1">
            Área:
          </span>
          <button
            onClick={() => setActiveArea(null)}
            className={`px-3 py-1 text-xs rounded-full border transition-colors ${
              activeArea === null
                ? "bg-accent text-white border-accent font-semibold"
                : "border-border text-muted hover:border-accent hover:text-accent"
            }`}
          >
            Todas
          </button>
          {AREA_ORDER.map((area) => {
            const isActive = activeArea === area;
            return (
              <button
                key={area}
                onClick={() => setActiveArea(isActive ? null : area)}
                style={
                  isActive
                    ? {
                        backgroundColor: AREA_COLORS[area],
                        borderColor: AREA_COLORS[area],
                        color: "white",
                      }
                    : { borderColor: "var(--border)" }
                }
                className="px-3 py-1 text-xs rounded-full border transition-colors flex items-center gap-1.5 hover:opacity-80"
              >
                {!isActive && (
                  <span
                    className="inline-block w-2 h-2 rounded-sm"
                    style={{ backgroundColor: AREA_COLORS[area] }}
                  />
                )}
                <span className={isActive ? "" : "text-text"}>{area}</span>
              </button>
            );
          })}
        </div>

        {/* Contador */}
        <div className="text-[11px] text-muted">
          Mostrando <strong className="text-text font-semibold">{totalShown}</strong> de {totalAll} sucursales
          {hasFilters && " (filtrado)"}
        </div>
      </div>

      <div className="bg-surface border border-border rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-surface2 text-muted uppercase tracking-wider text-xs">
            <tr>
              <Th col="name" label="Sucursal" />
              <Th col="total" label="Total Q2" right />
              <th className="py-3 px-3 text-left whitespace-nowrap">Distribución por área</th>
              <Th col="closeRate" label="% Cierre" right />
              <Th col="delayed" label="Demorados" right />
              <Th col="daysSinceActivity" label="Última act." />
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-muted text-sm">
                  Ninguna sucursal cumple con los filtros aplicados.{" "}
                  <button onClick={clearFilters} className="text-accent underline">
                    Limpiar filtros
                  </button>
                </td>
              </tr>
            ) : (
              filtered.map((b) => {
                const cierreColor =
                  b.closeRate >= 75 ? "text-brugaligreen"
                  : b.closeRate >= 50 ? "text-brugaliamber"
                  : "text-brugalired";
                const lastTxt =
                  b.daysSinceActivity === null ? "—"
                  : b.daysSinceActivity === 0 ? "hoy"
                  : b.daysSinceActivity === 1 ? "ayer"
                  : b.daysSinceActivity <= 7 ? `hace ${b.daysSinceActivity}d`
                  : `hace ${b.daysSinceActivity}d ⚠`;
                const lastColor = (b.daysSinceActivity || 0) > 7 ? "text-brugaliamber" : "text-text";
                const isExpanded = expanded === b.name;
                const topMotive = b.topMotive[0];

                return (
                  <Fragment key={b.name}>
                    <tr
                      className={`border-t border-border cursor-pointer hover:bg-surface2/40 transition-colors ${isExpanded ? "bg-surface2/40" : ""}`}
                      onClick={() => setExpanded(isExpanded ? null : b.name)}
                    >
                      <td className="py-3 px-3">
                        <div className="font-medium flex items-center gap-2">
                          <span className={`text-xs transition-transform inline-block ${isExpanded ? "rotate-90" : ""}`}>▶</span>
                          {b.name}
                        </div>
                        {topMotive && topMotive !== "—" && (
                          <div className="text-[11px] text-muted ml-5 mt-0.5">{topMotive} ({b.topMotive[1]})</div>
                        )}
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-semibold">{b.total}</td>
                      <td className="py-3 px-3">
                        <AreaBar byArea={b.byArea} total={b.total} />
                      </td>
                      <td className={`py-3 px-3 text-right font-mono font-semibold ${cierreColor}`}>
                        {Math.round(b.closeRate)}%
                      </td>
                      <td className="py-3 px-3 text-right font-mono">
                        {b.delayed > 0 ? (
                          <span className="text-brugalired font-semibold">{b.delayed}</span>
                        ) : (
                          <span className="text-muted">0</span>
                        )}
                      </td>
                      <td className={`py-3 px-3 text-xs ${lastColor}`}>{lastTxt}</td>
                    </tr>

                    {isExpanded && (
                      <tr className="bg-surface2/30 border-t border-border">
                        <td colSpan={6} className="px-6 py-4">
                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <div>
                              <div className="text-[11px] uppercase tracking-wider text-muted font-semibold mb-2">
                                Tickets por área
                              </div>
                              <div className="space-y-1.5">
                                {AREA_ORDER.filter((a) => b.byArea[a]).map((area) => {
                                  const n = b.byArea[area];
                                  const pct = (n / b.total) * 100;
                                  return (
                                    <div key={area} className="flex items-center gap-2 text-xs">
                                      <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: AREA_COLORS[area] }} />
                                      <span className="w-28 truncate">{area}</span>
                                      <div className="flex-1 h-1.5 bg-surface2 rounded">
                                        <div className="h-full rounded" style={{ width: `${pct}%`, backgroundColor: AREA_COLORS[area] }} />
                                      </div>
                                      <span className="font-mono text-muted w-16 text-right">
                                        {n} ({Math.round(pct)}%)
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>

                            <div>
                              <div className="text-[11px] uppercase tracking-wider text-muted font-semibold mb-2">
                                {b.delayed > 0 ? (
                                  <span className="text-brugalired">
                                    🔴 {b.delayed} ticket{b.delayed !== 1 ? "s" : ""} demorado{b.delayed !== 1 ? "s" : ""}
                                  </span>
                                ) : (
                                  <span className="text-brugaligreen">✓ Sin tickets demorados</span>
                                )}
                              </div>
                              {b.delayed > 0 && (
                                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                                  {b.delayedTickets
                                    .sort((a, z) => (z.daysOverdue ?? z.daysOpen) - (a.daysOverdue ?? a.daysOpen))
                                    .map((t) => (
                                      <div key={t.id} className="flex items-center justify-between gap-3 text-xs py-1 border-b border-border/50 last:border-0">
                                        <div className="min-w-0 flex-1">
                                          <a
                                            href={t.hubspotUrl}
                                            target="_blank"
                                            rel="noopener"
                                            onClick={(e) => e.stopPropagation()}
                                            className="text-accent underline decoration-dotted hover:text-brugaliorange font-medium truncate block"
                                          >
                                            {t.subject}
                                          </a>
                                          <span className="text-[10px] text-muted">
                                            {t.pipelineName} · {t.stageLabel} · {fmtDate(t.createdAt)}
                                          </span>
                                        </div>
                                        <span className="font-mono font-semibold text-brugalired text-[11px] whitespace-nowrap">
                                          {t.daysOverdue !== null ? `${t.daysOverdue}d` : `${t.daysOpen}d`}
                                        </span>
                                      </div>
                                    ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
