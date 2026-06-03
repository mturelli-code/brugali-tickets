"use client";
import { useState } from "react";
import type { AreaMetrics } from "@/lib/analytics";
import { fmtDate } from "@/lib/analytics";

export default function AreaSection({ area: a }: { area: AreaMetrics }) {
  const [expanded, setExpanded] = useState(false);

  const closeColor =
    a.closeRate >= 75
      ? "text-brugaligreen"
      : a.closeRate >= 50
      ? "text-brugaliamber"
      : "text-brugalired";
  const delayColor =
    a.delayedCount === 0
      ? "text-brugaligreen"
      : a.delayedCount >= 5
      ? "text-brugalired"
      : "text-brugaliamber";

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

          {/* Demorados */}
          {a.delayed.length > 0 ? (
            <div>
              <h4 className="text-xs uppercase tracking-wider text-brugalired font-semibold mb-2 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-brugalired" />
                {a.delayedCount} ticket{a.delayedCount !== 1 ? "s" : ""} demorado
                {a.delayedCount !== 1 ? "s" : ""} (+7d sin cerrar)
              </h4>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-surface2 text-muted uppercase tracking-wider">
                    <tr>
                      <th className="text-left py-2 px-3 font-medium">Ticket</th>
                      <th className="text-left py-2 px-3 font-medium">Sucursal</th>
                      <th className="text-left py-2 px-3 font-medium">Etapa</th>
                      <th className="text-left py-2 px-3 font-medium">Ingresó</th>
                      <th className="text-left py-2 px-3 font-medium">Última actividad</th>
                      <th className="text-right py-2 px-3 font-medium">Días</th>
                    </tr>
                  </thead>
                  <tbody>
                    {a.delayed.map((t) => {
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
                          <td className="py-2 px-3">{t.stageLabel}</td>
                          <td className="py-2 px-3">{fmtDate(t.createdAt)}</td>
                          <td className={`py-2 px-3 font-medium ${actColor}`}>{actTxt}</td>
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
