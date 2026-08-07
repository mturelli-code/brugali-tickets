"use client";
import { useMemo, useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, ReferenceLine,
} from "recharts";
import type { Ticket } from "@/lib/hubspot";
import {
  PRIORITY_ORDER, PRIORITY_LABELS, PRIORITY_COLORS, SLA_TARGET_DAYS,
  KT_QUARTER_START_MS, KT_QUARTER_END_MS, KT_QUARTER_LABEL,
  type PriorityLevel,
} from "@/lib/hubspot";
import {
  buildPriorityObjectives, buildPriorityWeeklyTrend, buildPriorityBacklog,
  fmtDate,
  type PriorityObjective,
} from "@/lib/analytics";
import LastUpdate from "@/components/LastUpdate";
import PeriodFilter, { defaultRange, startOfDay, endOfDay } from "@/components/PeriodFilter";

type SerializedTicket = Omit<
  Ticket, "createdAt" | "lastModifiedAt" | "closedAt" | "dueDate"
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

function fmtDays(v: number | null): string {
  return v === null ? "—" : `${v.toFixed(1)}d`;
}

export default function ObjetivosView({
  tickets: raw,
  fetchedAt,
}: {
  tickets: SerializedTicket[];
  fetchedAt: string;
}) {
  const allTickets = useMemo(() => raw.map(hydrate), [raw]);
  const now = Date.now();

  // Filtro de período (por defecto, trimestre en curso = Q del KT).
  const init = useMemo(() => defaultRange(new Date()), []);
  const [range, setRange] = useState<{ from: string; to: string }>({ from: init.from, to: init.to });
  const fromMs = startOfDay(new Date(range.from)).getTime();
  const toMs = endOfDay(new Date(range.to)).getTime();

  const objectives = useMemo(
    () => buildPriorityObjectives(allTickets, fromMs, toMs),
    [allTickets, fromMs, toMs]
  );
  const trend = useMemo(
    () => buildPriorityWeeklyTrend(allTickets, fromMs, toMs),
    [allTickets, fromMs, toMs]
  );
  const backlog = useMemo(() => buildPriorityBacklog(allTickets), [allTickets]);

  const byLevel = useMemo(() => {
    const m = new Map<PriorityLevel, PriorityObjective>();
    for (const o of objectives) m.set(o.level, o);
    return m;
  }, [objectives]);

  const cards = PRIORITY_ORDER.map((lvl) => byLevel.get(lvl)!).filter(Boolean);
  const sinClasificar = byLevel.get("sin");

  const enMeta = cards.filter((c) => c.onTarget).length;
  const daysElapsed = Math.max(0, Math.floor((Math.min(now, toMs) - fromMs) / 86400000));
  const daysLeft = Math.max(0, Math.ceil((toMs - now) / 86400000));

  const totalBacklog = PRIORITY_ORDER.reduce((s, l) => s + backlog[l].length, 0);

  return (
    <div className="space-y-10">
      {/* HEADER */}
      <div>
        <h1 className="font-serif font-bold text-3xl text-accent">Objetivos del trimestre</h1>
        <p className="text-sm text-muted mt-1">
          {fmtDate(new Date(range.from))} al {fmtDate(new Date(range.to))} · {daysElapsed} días transcurridos{daysLeft > 0 ? ` · ${daysLeft} restantes` : ""}
        </p>
        <div className="mt-2"><LastUpdate fetchedAt={fetchedAt} /></div>
      </div>

      {/* FILTRO DE PERÍODO */}
      <PeriodFilter onChange={(from, to) => setRange({ from, to })} />

      {/* RESUMEN */}
      <div className="bg-surface border border-border rounded-xl p-5">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted font-semibold">Objetivos en meta</div>
            <div className="font-mono text-3xl font-semibold mt-1">
              <span className={enMeta === cards.length ? "text-brugaligreen" : enMeta === 0 ? "text-brugalired" : "text-brugaliamber"}>{enMeta}</span>
              <span className="text-dim text-xl"> / {cards.length}</span>
            </div>
            <div className="text-[11px] text-muted">por mediana de cierre</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted font-semibold">A empujar hoy</div>
            <div className="font-mono text-3xl font-semibold mt-1" style={{ color: totalBacklog > 0 ? "#e63323" : "#339f8f" }}>{totalBacklog}</div>
            <div className="text-[11px] text-muted">abiertos que pasaron su meta</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted font-semibold">Sin clasificar</div>
            <div className="font-mono text-3xl font-semibold mt-1 text-dim">{sinClasificar ? sinClasificar.openCount : 0}</div>
            <div className="text-[11px] text-muted">abiertos sin prioridad</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted font-semibold">Días restantes</div>
            <div className="font-mono text-3xl font-semibold mt-1 text-accent">{daysLeft}</div>
            <div className="text-[11px] text-muted">para el cierre del Q</div>
          </div>
        </div>
        <p className="text-[11px] text-dim mt-4">
          Métrica principal: <strong className="text-text">mediana</strong> de días entre creación y cierre (más estable que el promedio, que se dispara con la cola de tickets muy viejos).
          Metas por nivel: Urgente ≤ {SLA_TARGET_DAYS.urgente}d · Alta ≤ {SLA_TARGET_DAYS.alta}d · Media ≤ {SLA_TARGET_DAYS.media}d · Baja ≤ {SLA_TARGET_DAYS.baja}d.
        </p>
      </div>

      {/* TARJETAS POR PRIORIDAD */}
      <section>
        <h2 className="font-serif font-bold text-xl text-accent mb-4">Meta · cómo estamos · cuánto falta</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {cards.map((o) => (
            <ObjectiveCard key={o.level} o={o} />
          ))}
        </div>
      </section>

      {/* EVOLUCIÓN */}
      <section>
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
          <h2 className="font-serif font-bold text-xl text-accent">Evolución en el trimestre</h2>
          <span className="text-[11px] text-dim">Mediana de días de cierre por semana. Las líneas punteadas son las metas.</span>
        </div>
        <PriorityTrendChart data={trend} />
      </section>

      {/* SIN CLASIFICAR */}
      {sinClasificar && (sinClasificar.openCount > 0 || sinClasificar.closedCount > 0) && (
        <section>
          <div className="bg-surface border border-border rounded-xl p-5 border-l-4" style={{ borderLeftColor: "#a8a59a" }}>
            <h3 className="font-serif font-semibold text-sm uppercase tracking-wider text-muted mb-1">
              Punto ciego: tickets sin prioridad
            </h3>
            <p className="text-sm text-muted">
              Hay <strong className="text-text">{sinClasificar.openCount}</strong> tickets abiertos y <strong className="text-text">{sinClasificar.closedCount}</strong> cerrados en el Q <strong>sin prioridad cargada</strong>.
              Estos quedan fuera del control del KT — conviene clasificarlos en HubSpot (<span className="font-mono text-xs">Prioridad Resolución</span>) para que entren en la medición.
            </p>
          </div>
        </section>
      )}

      {/* PARA TRACCIONAR */}
      <section>
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
          <h2 className="font-serif font-bold text-xl text-accent">Para traccionar — abiertos que ya pasaron su meta</h2>
          <span className="text-[11px] text-dim">Ordenados por días abiertos. Cliqueá para abrir en HubSpot.</span>
        </div>
        {totalBacklog === 0 ? (
          <div className="bg-surface border border-border rounded-xl p-6 text-center text-brugaligreen text-sm font-medium">
            No hay tickets abiertos por encima de su meta SLA. 🎯
          </div>
        ) : (
          <div className="space-y-4">
            {PRIORITY_ORDER.map((lvl) => (
              <BacklogGroup key={lvl} level={lvl} tickets={backlog[lvl]} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function ObjectiveCard({ o }: { o: PriorityObjective }) {
  const color = PRIORITY_COLORS[o.level];
  const nowColor = o.onTarget ? "#339f8f" : o.medianDays !== null && o.targetDays !== null && o.medianDays > o.targetDays * 2 ? "#e63323" : "#e6a303";
  const progress = o.progressPct;

  return (
    <div className="bg-surface border border-border rounded-xl p-5 border-t-4" style={{ borderTopColor: color }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
          <span className="font-serif font-bold text-base text-text">{o.label}</span>
        </div>
        <span className="text-[11px] text-muted font-medium">Meta ≤ {o.targetDays}d</span>
      </div>

      {/* Mediana actual */}
      <div className="mt-3">
        <div className="font-mono text-4xl font-semibold leading-none" style={{ color: nowColor }}>
          {fmtDays(o.medianDays)}
        </div>
        <div className="text-[11px] text-muted mt-1">
          mediana · prom. {fmtDays(o.avgDays)} · {o.closedCount} cerrados
        </div>
      </div>

      {/* Cuánto falta para la meta */}
      <div className="mt-4">
        <div className="flex justify-between text-[10px] text-dim mb-1">
          <span>Cercanía a la meta</span>
          <span>Meta ≤ {o.targetDays}d</span>
        </div>
        <div className="h-2 w-full rounded-full bg-surface2 overflow-hidden">
          <div
            className="h-full rounded-full"
            style={{
              width: progress !== null ? `${progress}%` : "0%",
              backgroundColor: o.onTarget ? "#339f8f" : color,
            }}
          />
        </div>
        <div className="text-[11px] mt-1 font-medium" style={{ color: o.onTarget ? "#339f8f" : "#6a6862" }}>
          {o.onTarget
            ? "En meta ✓"
            : o.medianDays !== null && o.targetDays !== null
            ? `Faltan ${(o.medianDays - o.targetDays).toFixed(1)}d para bajar a la meta`
            : "—"}
        </div>
        {o.baselineMedianDays !== null && (
          <div className="text-[10px] text-dim mt-0.5">
            Referencia previa al Q: {fmtDays(o.baselineMedianDays)} de mediana
          </div>
        )}
      </div>

      {/* SLA + backlog */}
      <div className="mt-4 pt-3 border-t border-border grid grid-cols-2 gap-2 text-center">
        <div>
          <div className="font-mono text-lg font-semibold text-text">
            {o.slaHitRate !== null ? `${Math.round(o.slaHitRate)}%` : "—"}
          </div>
          <div className="text-[10px] text-muted">cerrados en SLA</div>
        </div>
        <div>
          <div className="font-mono text-lg font-semibold" style={{ color: o.openOverTarget > 0 ? "#e63323" : "#6a6862" }}>
            {o.openOverTarget}
          </div>
          <div className="text-[10px] text-muted">abiertos vencidos</div>
        </div>
      </div>
    </div>
  );
}

function PriorityTrendChart({ data }: { data: any[] }) {
  return (
    <div className="bg-surface border border-border rounded-xl p-6">
      <div style={{ width: "100%", height: 320 }}>
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e6e2d8" />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#6a6862" }} />
            <YAxis tick={{ fontSize: 11, fill: "#6a6862" }} label={{ value: "días", angle: -90, position: "insideLeft", fontSize: 11, fill: "#a8a59a" }} />
            <Tooltip
              contentStyle={{ background: "#fff", border: "1px solid #e6e2d8", borderRadius: 8, fontSize: 12 }}
              formatter={(v: any) => (v === null || v === undefined ? "—" : `${Number(v).toFixed(1)}d`)}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {/* Líneas de meta (punteadas) */}
            <ReferenceLine y={SLA_TARGET_DAYS.urgente!} stroke={PRIORITY_COLORS.urgente} strokeDasharray="4 4" strokeOpacity={0.5} />
            <ReferenceLine y={SLA_TARGET_DAYS.media!} stroke={PRIORITY_COLORS.media} strokeDasharray="4 4" strokeOpacity={0.5} />
            <ReferenceLine y={SLA_TARGET_DAYS.baja!} stroke={PRIORITY_COLORS.baja} strokeDasharray="4 4" strokeOpacity={0.5} />
            <Line type="monotone" dataKey="urgente" stroke={PRIORITY_COLORS.urgente} strokeWidth={2} name="Urgente" dot={{ r: 3 }} connectNulls />
            <Line type="monotone" dataKey="alta" stroke={PRIORITY_COLORS.alta} strokeWidth={2} name="Alta" dot={{ r: 3 }} connectNulls />
            <Line type="monotone" dataKey="media" stroke={PRIORITY_COLORS.media} strokeWidth={2} name="Media" dot={{ r: 3 }} connectNulls />
            <Line type="monotone" dataKey="baja" stroke={PRIORITY_COLORS.baja} strokeWidth={2} name="Baja" dot={{ r: 3 }} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="text-[11px] text-dim mt-3">
        Cada punto es la mediana de días de cierre de los tickets cerrados esa semana. Semanas sin cierres de un nivel no muestran punto.
      </p>
    </div>
  );
}

function BacklogGroup({ level, tickets }: { level: PriorityLevel; tickets: Ticket[] }) {
  const [open, setOpen] = useState(false);      // grupo colapsado por defecto (desplegable)
  const [showAll, setShowAll] = useState(false); // dentro del grupo, ver todos vs top 5
  const color = PRIORITY_COLORS[level];
  const target = SLA_TARGET_DAYS[level];
  if (tickets.length === 0) return null;
  const shown = showAll ? tickets : tickets.slice(0, 5);

  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-5 py-3 text-left hover:bg-surface2/40 transition-colors"
        style={{ borderLeft: `4px solid ${color}` }}
      >
        <span className={`text-[10px] font-mono transition-transform inline-block ${open ? "rotate-90" : ""}`}>▶</span>
        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
        <span className="font-serif font-bold text-sm text-text">{PRIORITY_LABELS[level]}</span>
        <span className="text-[11px] text-muted">· meta ≤ {target}d</span>
        <span className="ml-auto font-mono text-sm font-semibold" style={{ color }}>{tickets.length}</span>
        <span className="text-[11px] text-muted">vencidos</span>
      </button>
      {open && (
        <>
          <div className="overflow-x-auto border-t border-border">
            <table className="w-full text-sm">
              <thead className="bg-surface2 text-muted uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="text-left py-2 px-4">Motivo</th>
                  <th className="text-left py-2 px-3">Sucursal</th>
                  <th className="text-left py-2 px-3">Área</th>
                  <th className="text-left py-2 px-3">Etapa</th>
                  <th className="text-left py-2 px-3">Responsable</th>
                  <th className="text-right py-2 px-4">Días abiertos</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((t) => (
                  <tr key={t.id} className="border-t border-border hover:bg-surface2/50">
                    <td className="py-2 px-4">
                      <a href={t.hubspotUrl} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline font-medium">
                        {t.subject || "(sin asunto)"}
                      </a>
                    </td>
                    <td className="py-2 px-3 text-muted">{t.branch || "—"}</td>
                    <td className="py-2 px-3 text-muted">{t.pipelineName}</td>
                    <td className="py-2 px-3 text-muted">{t.stageLabel}</td>
                    <td className="py-2 px-3 text-muted whitespace-nowrap">{t.ownerName || "Sin asignar"}</td>
                    <td className="py-2 px-4 text-right font-mono font-semibold" style={{ color: target !== null && t.daysOpen > target * 2 ? "#e63323" : "#6a6862" }}>
                      {t.daysOpen}d
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {tickets.length > 5 && (
            <button
              onClick={() => setShowAll((v) => !v)}
              className="w-full py-2 text-[11px] text-accent hover:bg-surface2 font-medium border-t border-border"
            >
              {showAll ? "Ver menos" : `Ver los ${tickets.length} (${tickets.length - 5} más)`}
            </button>
          )}
        </>
      )}
    </div>
  );
}
