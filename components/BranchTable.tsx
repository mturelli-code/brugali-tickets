"use client";
import { useState } from "react";
import type { BranchMetrics } from "@/lib/analytics";

type SortKey = "name" | "total" | "closeRate" | "delayed" | "daysSinceActivity";

export default function BranchTable({ branches }: { branches: BranchMetrics[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("delayed");
  const [asc, setAsc] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setAsc(!asc);
    } else {
      setSortKey(key);
      setAsc(key === "name");
    }
  }

  const sorted = [...branches].sort((a, b) => {
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

  return (
    <div className="bg-surface border border-border rounded-xl overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-surface2 text-muted uppercase tracking-wider text-xs">
          <tr>
            <Th col="name" label="Sucursal" />
            <Th col="total" label="Total Q2" right />
            <Th col="closeRate" label="% Cierre" right />
            <Th col="delayed" label="Demorados" right />
            <th className="text-left py-3 px-3 whitespace-nowrap">Desglose por área</th>
            <th className="text-left py-3 px-3 whitespace-nowrap">Motivo predominante</th>
            <Th col="daysSinceActivity" label="Última act." />
          </tr>
        </thead>
        <tbody>
          {sorted.map((b) => {
            const cierreColor =
              b.closeRate >= 75
                ? "text-brugaligreen"
                : b.closeRate >= 50
                ? "text-brugaliamber"
                : "text-brugalired";
            const lastTxt =
              b.daysSinceActivity === null
                ? "—"
                : b.daysSinceActivity === 0
                ? "hoy"
                : b.daysSinceActivity <= 7
                ? `hace ${b.daysSinceActivity}d`
                : `hace ${b.daysSinceActivity}d ⚠`;
            const lastColor = (b.daysSinceActivity || 0) > 7 ? "text-brugaliamber" : "text-text";
            const isExpanded = expanded === b.name;
            return (
              <>
                <tr key={b.name} className="border-t border-border">
                  <td className="py-2 px-3 font-medium">{b.name}</td>
                  <td className="py-2 px-3 text-right font-mono">{b.total}</td>
                  <td className={`py-2 px-3 text-right font-mono font-semibold ${cierreColor}`}>
                    {Math.round(b.closeRate)}%
                  </td>
                  <td className="py-2 px-3 text-right font-mono">
                    {b.delayed > 0 ? (
                      <button
                        onClick={() => setExpanded(isExpanded ? null : b.name)}
                        className="text-brugalired font-semibold underline decoration-dotted hover:text-brugaliorange"
                      >
                        {b.delayed} {isExpanded ? "▲" : "▼"}
                      </button>
                    ) : (
                      <span className="text-muted">0</span>
                    )}
                  </td>
                  <td className="py-2 px-3 text-xs">
                    {Object.entries(b.byArea)
                      .sort((a, b) => b[1] - a[1])
                      .map(([area, n]) => (
                        <span
                          key={area}
                          className="inline-block bg-surface2 text-muted px-2 py-0.5 rounded-full mr-1 mb-1 font-mono text-[10px]"
                        >
                          {area}: {n}
                        </span>
                      ))}
                  </td>
                  <td className="py-2 px-3 text-xs">
                    {b.topMotive[0]} ({b.topMotive[1]})
                  </td>
                  <td className={`py-2 px-3 text-xs ${lastColor}`}>{lastTxt}</td>
                </tr>
                {isExpanded && b.delayedTickets.length > 0 && (
                  <tr key={`${b.name}-expanded`} className="bg-surface2 border-t border-border">
                    <td colSpan={7} className="px-4 py-3">
                      <div className="text-xs font-semibold text-brugalired mb-2 uppercase tracking-wider">
                        Tickets demorados — {b.name}
                      </div>
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-muted uppercase tracking-wider">
                            <th className="text-left pb-1 pr-3">Ticket</th>
                            <th className="text-left pb-1 pr-3">Área</th>
                            <th className="text-left pb-1 pr-3">Responsable</th>
                            <th className="text-left pb-1 pr-3">Etapa</th>
                            <th className="text-left pb-1 pr-3">Vence</th>
                            <th className="text-right pb-1">Días vencido</th>
                          </tr>
                        </thead>
                        <tbody>
                          {b.delayedTickets
                            .sort((a, z) => (z.daysOverdue ?? z.daysOpen) - (a.daysOverdue ?? a.daysOpen))
                            .map((t) => (
                              <tr key={t.id} className="border-t border-border">
                                <td className="py-1.5 pr-3">
                                  <a
                                    href={t.hubspotUrl}
                                    target="_blank"
                                    rel="noopener"
                                    className="text-accent underline decoration-dotted hover:text-brugaliorange"
                                  >
                                    {t.subject}
                                  </a>
                                </td>
                                <td className="py-1.5 pr-3 text-muted">{t.pipelineName}</td>
                                <td className="py-1.5 pr-3">{t.ownerName ?? "—"}</td>
                                <td className="py-1.5 pr-3 text-muted">{t.stageLabel}</td>
                                <td className="py-1.5 pr-3 text-muted">
                                  {t.dueDate
                                    ? `${t.dueDate.getUTCDate()}-${["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"][t.dueDate.getUTCMonth()]}`
                                    : "sin fecha"}
                                </td>
                                <td className="py-1.5 text-right font-mono font-semibold text-brugalired">
                                  {t.daysOverdue !== null ? `${t.daysOverdue}d` : `${t.daysOpen}d abierto`}
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </td>
                  </tr>
                )}
              </>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
