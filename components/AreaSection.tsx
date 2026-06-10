"use client";
import { useState, useMemo } from "react";
import type { AreaMetrics } from "@/lib/analytics";
import { fmtDate, breakdownDelay } from "@/lib/analytics";
import { DELAY_LABELS, DELAY_COLORS } from "@/lib/hubspot";
import type { Ticket, DelaySource } from "@/lib/hubspot";

type SortKey = "subject" | "branch" | "stage" | "created" | "lastActivity" | "days" | "daysInStage";

export default function AreaSection({ area: a }: { area: AreaMetrics }) {
  const [expanded, setExpanded] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("days");
  const [asc, setAsc] = useState(false);

  const closeColor =
    a.closeRate >= 75 ? "text-brugaligreen"
    : a.closeRate >= 50 ? "text-brugaliamber"
    : "text-brugalired";
  const delayColor =
    a.delayedCount === 0 ? "text-brugaligreen"
    : a.delayedCount >= 5 ? "text-brugalired"
    : "text-brugaliamber";

  function handleSort(k: SortKey) {
    if (sortKey === k) setAsc(!asc);
    else {
      setSortKey(k);
      // Default por columna: nombres/etapas ASC, valores numéricos/fechas DESC
      setAsc(k === "subject" || k === "branch" || k === "stage");
    }
  }

  const breakdown = useMemo(() => breakdownDelay(a.delayed), [a.delayed]);

  const sortedDelayed = useMemo(() => {
    const arr = [...a.delayed];
    arr.sort((x, y) => {
      let vx: string | number = 0;
      let vy: string | number = 0;
      switch (sortKey) {
        case "subject":
          vx = x.subject; vy = y.subject; break;
        case "branch":
          vx = x.branch || "zzz"; vy = y.branch || "zzz"; break;
        case "stage":
          vx = x.stageLabel; vy = y.stageLabel; break;
        case "created":
          vx = x.createdAt.getTime(); vy = y.createdAt.getTime(); break;
        case "lastActivity":
          vx = x.daysSinceActivity; vy = y.daysSinceActivity; break;
        case "daysInStage":
          vx = x.daysInCurrentStage; vy = y.daysInCurrentStage; break;
        case "days":
          vx = x.daysOverdue ?? x.daysOpen;
          vy = y.daysOverdue ?? y.daysOpen;
          break;
      }
      if (typeof vx === "string") {
        return asc
          ? vx.localeCompare(vy as string)
          : (vy as string).localeCompare(vx);
      }
      return asc ? vx - (vy as number) : (vy as number) - vx;
    });
    return arr;
  }, [a.delayed, sortKey, asc]);

  function Th({ col, label, right }: { col: SortKey; label: string; right?: boolean }) {
    const active = sortKey === col;
    const arrow = active ? (asc ? " ↑" : " ↓") : "";
    return (
      <th
        onClick={() => handleSort(col)}
        className={`py-2 px-3 font-medium cursor-pointer select-none hover:text-accent whitespace-nowrap ${active ? "text-accent" : ""} ${right ? "text-right" : "text-left"}`}
      >
        {label}{arrow}
      </th>
    );
  }

  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden">
      {/* Header — siempre visible, clickeable */}
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex flex-wrap items-center justify-between gap-3 px-6 py-4 hover:bg-surface2 transition-colors text-left"
      >
        <div className="flex items-center gap-4">
          <span
            className={`font-mono text-lg w-6 inline-block transition-transform ${
              expanded ? "rotate-90" : ""
            }`}
            aria-hidden
          >
            ▶
          </span>
          <h3 className="font-serif font-bold text-xl text-accent">{a.name}</h3>
        </div>

        <div className="flex gap-3 sm:gap-5 flex-wrap text-xs">
          <div className="text-center">
            <div className="text-[10px] uppercase tracking-wider text-muted">Ingresados</div>
            <div className="font-mono font-semibold text-base text-text">{a.total}</div>
          </div>
          <div className="text-center">
            <div className="text-[10px] uppercase tracking-wider text-muted">Cerrados</div>
            <div className={`font-mono font-semibold text-base ${closeColor}`}>
              {a.closed} <span className="text-[10px] text-muted">({Math.round(a.closeRate)}%)</span>
            </div>
          </div>
          <div className="text-center">
            <div className="text-[10px] uppercase tracking-wider text-muted">Abiertos</div>
            <div className="font-mono font-semibold text-base text-text">{a.open}</div>
          </div>
          <div className="text-center">
            <div className="text-[10px] uppercase tracking-wider text-muted">Demorados</div>
            <div className={`font-mono font-semibold text-base ${delayColor}`}>{a.delayedCount}</div>
          </div>
        </div>
      </button>

      {/* Contenido expandible */}
      {expanded && (
        <div className="px-6 py-5 border-t border-border space-y-6">
          {/* Scorecards laterales */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-lg bg-surface2 p-3 border-l-4 border-accent">
              <div className="text-[10px] uppercase tracking-wider text-muted">Ingresados Q2</div>
              <div className="font-mono text-2xl font-semibold text-text">{a.total}</div>
            </div>
            <div className="rounded-lg bg-surface2 p-3 border-l-4 border-brugaligreen">
              <div className="text-[10px] uppercase tracking-wider text-muted">Cerrados</div>
              <div className="font-mono text-2xl font-semibold text-text">{a.closed}</div>
            </div>
            <div className="rounded-lg bg-surface2 p-3 border-l-4 border-brugaliamber">
              <div className="text-[10px] uppercase tracking-wider text-muted">Abiertos</div>
              <div className="font-mono text-2xl font-semibold text-text">{a.open}</div>
            </div>
            <div className="rounded-lg bg-surface2 p-3 border-l-4 border-brugalired">
              <div className="text-[10px] uppercase tracking-wider text-muted">Demorados (+7d)</div>
              <div className="font-mono text-2xl font-semibold text-text">{a.delayedCount}</div>
            </div>
          </div>

          {/* Tipos de ticket */}
          <div>
            <h4 className="text-xs uppercase tracking-wider text-muted font-semibold mb-3">
              Tipos de ticket en {a.name}
            </h4>
            <div className="space-y-2">
              {a.subjectBreakdown.slice(0, 10).map(([subj, cnt]) => {
                const max = a.subjectBreakdown[0][1];
                return (
                  <div key={subj} className="flex items-center gap-3 text-sm">
                    <span className="w-56 truncate">{subj}</span>
                    <div className="flex-1 h-1.5 bg-surface2 rounded">
                      <div
                        className="h-full bg-accent rounded"
                        style={{ width: `${(cnt / max) * 100}%` }}
                      />
                    </div>
                    <span className="font-mono text-xs text-muted w-24 text-right">
                      {cnt} ({Math.round((cnt / a.total) * 100)}%)
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Demorados con sort */}
          {a.delayed.length > 0 ? (
            <div>
              <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
                <h4 className="text-xs uppercase tracking-wider text-brugalired font-semibold flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-brugalired" />
                  {a.delayedCount} ticket{a.delayedCount !== 1 ? "s" : ""} demorado
                  {a.delayedCount !== 1 ? "s" : ""} (+7d sin cerrar)
                </h4>
                <span className="text-[11px] text-muted">
                  Cliqueá los encabezados para ordenar
                </span>
              </div>

              {/* Breakdown de tipo de demora */}
              <div className="bg-surface2 rounded-lg p-3 mb-3">
                <div className="text-[10px] uppercase tracking-wider text-muted font-semibold mb-2">
                  ¿De dónde viene la demora?
                </div>
                {/* Barra apilada */}
                <div className="flex w-full h-2 rounded overflow-hidden bg-bg mb-2">
                  {(["external", "internal_waiting", "internal_working", "internal_unassigned", "other"] as DelaySource[]).map((src) => {
                    const n = breakdown[src];
                    if (n === 0) return null;
                    return (
                      <div
                        key={src}
                        title={`${DELAY_LABELS[src]}: ${n}`}
                        style={{ width: `${(n / breakdown.total) * 100}%`, backgroundColor: DELAY_COLORS[src] }}
                      />
                    );
                  })}
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                  {(["external", "internal_waiting", "internal_working", "internal_unassigned"] as DelaySource[]).map((src) => {
                    const n = breakdown[src];
                    if (n === 0) return null;
                    const pct = Math.round((n / breakdown.total) * 100);
                    return (
                      <div key={src} className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: DELAY_COLORS[src] }} />
                        <span className="text-muted">{DELAY_LABELS[src]}:</span>
                        <strong className="font-mono text-text">{n}</strong>
                        <span className="text-dim">({pct}%)</span>
                      </div>
                    );
                  })}
                </div>
                {breakdown.externalPct >= 50 && (
                  <div className="mt-2 text-[11px] text-brugaliorange font-medium">
                    ⚠ El {breakdown.externalPct.toFixed(0)}% de los demorados están esperando a la sucursal/cliente — la demora no es de esta área.
                  </div>
                )}
                {breakdown.internal_waiting >= 5 && (
                  <div className="mt-2 text-[11px] text-brugalired font-medium">
                    🚨 {breakdown.internal_waiting} tickets bloqueados por otra área Brugali — escalar al área que corresponde, este embudo no puede destrabarlos solo.
                  </div>
                )}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-surface2 text-muted uppercase tracking-wider">
                    <tr>
                      <Th col="subject" label="Ticket" />
                      <Th col="branch" label="Sucursal" />
                      <Th col="stage" label="Etapa" />
                      <Th col="created" label="Ingresó" />
                      <Th col="lastActivity" label="Últ. actividad" />
                      <Th col="daysInStage" label="Días en etapa" right />
                      <Th col="days" label="Días total" right />
                    </tr>
                  </thead>
                  <tbody>
                    {sortedDelayed.map((t: Ticket) => {
                      const actColor =
                        t.daysSinceActivity > 7
                          ? "text-brugalired"
                          : t.daysSinceActivity > 3
                          ? "text-brugaliamber"
                          : "text-brugaligreen";
                      const actTxt =
                        t.daysSinceActivity === 0
                          ? "hoy"
                          : t.daysSinceActivity === 1
                          ? "ayer"
                          : `hace ${t.daysSinceActivity}d`;
                      const stageColor =
                        DELAY_COLORS[t.delaySource] || "#6a6862";
                      return (
                        <tr key={t.id} className="border-t border-border">
                          <td className="py-2 px-3">
                            <a
                              href={t.hubspotUrl}
                              target="_blank"
                              rel="noopener"
                              className="text-accent underline decoration-dotted hover:text-brugaliorange"
                            >
                              {t.subject}
                            </a>
                          </td>
                          <td className="py-2 px-3">{t.branch || "—"}</td>
                          <td className="py-2 px-3">
                            <span className="inline-flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ backgroundColor: stageColor }} />
                              {t.stageLabel}
                            </span>
                          </td>
                          <td className="py-2 px-3">{fmtDate(t.createdAt)}</td>
                          <td className={`py-2 px-3 font-medium ${actColor}`}>{actTxt}</td>
                          <td className="py-2 px-3 text-right font-mono">
                            <span className={t.daysInCurrentStage > 7 ? "text-brugalired font-semibold" : "text-muted"}>
                              {t.daysInCurrentStage}d
                            </span>
                          </td>
                          <td className="py-2 px-3 text-right font-mono font-semibold text-brugalired">
                            {t.daysOverdue !== null
                              ? `${t.daysOverdue}d vencido`
                              : `${t.daysOpen}d abierto`}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="text-xs text-brugaligreen font-medium flex items-center gap-2">
              <span>✓</span> Sin tickets demorados en esta área
            </div>
          )}
        </div>
      )}
    </div>
  );
}
