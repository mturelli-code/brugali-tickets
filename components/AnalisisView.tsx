"use client";
import { useMemo } from "react";
import type { Ticket } from "@/lib/hubspot";
import { buildStageJourney, buildFamilyJourney, type CanonStage } from "@/lib/analytics";
import LastUpdate from "@/components/LastUpdate";

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

const STAGE_COLOR: Record<CanonStage, string> = {
  nuevo: "#e6a303",       // amber — sin tomar
  progreso: "#339f8f",    // green — trabajando
  espInterna: "#e63323",  // red — bloqueo interno
  espCliente: "#f07e26",  // orange — externo
};

function d1(n: number): string {
  return n.toLocaleString("es-AR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}
function d0(n: number): string {
  return Math.round(n).toLocaleString("es-AR");
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl bg-surface border border-border p-5">{children}</div>;
}

function SectionTitle({ n, title, sub }: { n: string; title: string; sub?: string }) {
  return (
    <div className="mb-3">
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-mono text-muted">{n}</span>
        <h2 className="font-serif font-bold text-lg text-text">{title}</h2>
      </div>
      {sub && <p className="text-[12px] text-muted mt-0.5">{sub}</p>}
    </div>
  );
}

export default function AnalisisView({
  tickets: raw,
  fetchedAt,
}: {
  tickets: SerializedTicket[];
  fetchedAt: string;
}) {
  const tickets = useMemo(() => raw.map(hydrate), [raw]);
  const j = useMemo(() => buildStageJourney(tickets), [tickets]);
  const fams = useMemo(() => buildFamilyJourney(tickets), [tickets]);

  if (!j.hasData) {
    return (
      <main className="max-w-7xl mx-auto px-6 py-8">
        <Card>
          <p className="text-sm text-muted">
            No hay datos de tiempo por etapa disponibles todavía.
          </p>
        </Card>
      </main>
    );
  }

  const maxStageTotal = Math.max(...j.stages.map((s) => s.totalDays), 1);
  const maxEmbudo = Math.max(...j.embudos.map((e) => e.perTicket), 1);
  const maxTicketTotal = Math.max(...j.worstOpen.map((t) => t.total), 1);
  const maxFamTotal = Math.max(...fams.map((f) => f.total), 1);
  const FAM_STAGES: { key: CanonStage; short: string }[] = [
    { key: "nuevo", short: "Sin tomar" },
    { key: "progreso", short: "En progreso" },
    { key: "espInterna", short: "Espera interna" },
    { key: "espCliente", short: "Espera local" },
  ];

  return (
    <main className="max-w-7xl mx-auto px-6 py-8 space-y-8">
      {/* Encabezado */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif font-bold text-2xl text-text">
            ¿Dónde se demoran los tickets?
          </h1>
          <p className="text-[13px] text-muted mt-1 max-w-2xl">
            Mide cuánto tiempo pasó cada ticket <b>acumulado en cada etapa</b> a lo
            largo de toda su vida (no sólo la etapa actual). Sobre todos los tickets
            desde enero 2026.
          </p>
        </div>
        <LastUpdate fetchedAt={fetchedAt} />
      </div>

      {/* Titular: interno vs externo */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card>
          <div className="text-[10px] uppercase tracking-wider text-muted font-semibold">
            Demora que depende de Brugali
          </div>
          <div className="font-mono text-4xl font-semibold mt-1 text-brugalired">
            {d0(j.internalPct)}%
          </div>
          <div className="text-[11px] text-muted mt-1">
            Sin tomar + en progreso + esperando a otra área interna.
          </div>
        </Card>
        <Card>
          <div className="text-[10px] uppercase tracking-wider text-muted font-semibold">
            Demora esperando al local/cliente
          </div>
          <div className="font-mono text-4xl font-semibold mt-1 text-brugaliorange">
            {d0(j.externalPct)}%
          </div>
          <div className="text-[11px] text-muted mt-1">
            Lo que no controlamos directamente.
          </div>
        </Card>
        <Card>
          <div className="text-[10px] uppercase tracking-wider text-muted font-semibold">
            Tiempo total en proceso
          </div>
          <div className="font-mono text-4xl font-semibold mt-1 text-text">
            {d0(j.totalActiveDays)}
          </div>
          <div className="text-[11px] text-muted mt-1">
            días-ticket acumulados en etapas abiertas.
          </div>
        </Card>
      </div>

      {/* 1 · ¿En qué etapa? */}
      <div>
        <SectionTitle
          n="01"
          title="¿En qué etapa se pierde el tiempo?"
          sub="Total acumulado por etapa en todo el período. La mediana es lo que tarda un ticket típico que pasa por esa etapa."
        />
        <Card>
          <div className="space-y-4">
            {j.stages.map((s) => (
              <div key={s.key}>
                <div className="flex items-baseline justify-between text-sm mb-1">
                  <span className="font-medium text-text">
                    {s.label}
                    <span
                      className={`ml-2 text-[10px] uppercase tracking-wide ${
                        s.kind === "externo" ? "text-brugaliorange" : "text-brugalired"
                      }`}
                    >
                      {s.kind}
                    </span>
                  </span>
                  <span className="font-mono text-muted text-[12px]">
                    {d0(s.totalDays)} días · {d0(s.pct)}%
                  </span>
                </div>
                <div className="h-3 rounded-full bg-surface2 overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${(s.totalDays / maxStageTotal) * 100}%`,
                      backgroundColor: STAGE_COLOR[s.key],
                    }}
                  />
                </div>
                <div className="text-[11px] text-muted mt-1">
                  Ticket típico: <b className="text-text">{d1(s.medianDays)} días</b> ·{" "}
                  {d0(s.ticketCount)} tickets pasaron por acá
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* 2 · Recorrido por familia */}
      <div>
        <SectionTitle
          n="02"
          title="Recorrido interno por familia de ticket"
          sub="Cuánto tarda una familia típica en cada etapa (mediana de días). El ticket queda con un solo responsable de principio a fin; lo que avanza es la etapa. Sirve para redefinir plazos por tipo de ticket."
        />
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-muted border-b border-border">
                  <th className="text-left font-semibold py-2">Familia</th>
                  <th className="text-left font-semibold py-2 pl-3 hidden md:table-cell">Área</th>
                  <th className="text-right font-semibold py-2">n</th>
                  <th className="text-left font-semibold py-2 pl-4">Recorrido (días por etapa)</th>
                  <th className="text-right font-semibold py-2 pl-3">Total</th>
                </tr>
              </thead>
              <tbody>
                {fams.map((f) => (
                  <tr key={f.family} className="border-b border-border/50 align-top">
                    <td className="py-2.5 pr-2">
                      <div className="font-medium text-text capitalize">{f.family}</div>
                      <div className="text-[10px] text-muted">resp: {f.owner}</div>
                    </td>
                    <td className="py-2.5 pl-3 text-muted text-[12px] hidden md:table-cell">{f.area}</td>
                    <td className="py-2.5 text-right font-mono text-muted">{d0(f.count)}</td>
                    <td className="py-2.5 pl-4 w-1/2">
                      <div className="flex h-3 rounded-full overflow-hidden bg-surface2">
                        {FAM_STAGES.map((s) =>
                          f[s.key] > 0.02 ? (
                            <div
                              key={s.key}
                              title={`${s.short}: ${d1(f[s.key])} d`}
                              style={{
                                width: `${(f[s.key] / maxFamTotal) * 100}%`,
                                backgroundColor: STAGE_COLOR[s.key],
                              }}
                            />
                          ) : null
                        )}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-muted">
                        {FAM_STAGES.filter((s) => f[s.key] > 0.02).map((s) => (
                          <span key={s.key}>
                            <span style={{ color: STAGE_COLOR[s.key] }}>●</span> {s.short}{" "}
                            <b className="text-text">{d1(f[s.key])}d</b>
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="py-2.5 pl-3 text-right font-mono font-semibold text-text">{d1(f.total)}d</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* 3 · ¿Qué embudo? */}
      <div>
        <SectionTitle
          n="03"
          title="¿Qué área es la más lenta?"
          sub="Días acumulados por ticket en cada embudo, y en qué etapa se traba principalmente."
        />
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-muted border-b border-border">
                  <th className="text-left font-semibold py-2">Embudo</th>
                  <th className="text-right font-semibold py-2">Días/ticket</th>
                  <th className="text-left font-semibold py-2 pl-4 hidden sm:table-cell">Carga</th>
                  <th className="text-right font-semibold py-2">Tickets</th>
                  <th className="text-left font-semibold py-2 pl-4">Se traba en</th>
                </tr>
              </thead>
              <tbody>
                {j.embudos.map((e) => (
                  <tr key={e.pipelineId} className="border-b border-border/50">
                    <td className="py-2 font-medium text-text">{e.name}</td>
                    <td className="py-2 text-right font-mono text-text">{d1(e.perTicket)}</td>
                    <td className="py-2 pl-4 hidden sm:table-cell">
                      <div className="h-2 rounded-full bg-surface2 overflow-hidden w-32">
                        <div
                          className="h-full rounded-full bg-accent"
                          style={{ width: `${(e.perTicket / maxEmbudo) * 100}%` }}
                        />
                      </div>
                    </td>
                    <td className="py-2 text-right font-mono text-muted">{d0(e.count)}</td>
                    <td className="py-2 pl-4 text-[12px]">
                      <span style={{ color: STAGE_COLOR[e.topStage] }}>●</span>{" "}
                      {STAGE_LABEL_SHORT[e.topStage]}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* 3 · Peores tickets */}
      <div>
        <SectionTitle
          n="04"
          title="Los tickets abiertos más demorados"
          sub="Desglose real de dónde pasó el tiempo cada ticket. Las barras muestran los días en cada etapa."
        />
        <Card>
          <div className="space-y-3">
            {j.worstOpen.map((t) => (
              <a
                key={t.id}
                href={t.hubspotUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block rounded-lg border border-border/60 hover:border-accent p-3 transition-colors"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-text truncate">{t.subject}</div>
                    <div className="text-[11px] text-muted">
                      {t.pipelineName} · {t.stageLabel} · {t.ownerName || "Sin asignar"}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-mono text-lg font-semibold text-brugalired">
                      {d0(t.total)} d
                    </div>
                    <div className="text-[10px] text-muted">en proceso</div>
                  </div>
                </div>
                {/* Barra apilada del recorrido */}
                <div className="mt-2 flex h-2.5 rounded-full overflow-hidden bg-surface2">
                  {(["nuevo", "progreso", "espInterna", "espCliente"] as CanonStage[]).map((k) =>
                    t[k] > 0 ? (
                      <div
                        key={k}
                        title={`${STAGE_LABEL_SHORT[k]}: ${d1(t[k])} d`}
                        style={{
                          width: `${(t[k] / (maxTicketTotal || 1)) * 100}%`,
                          backgroundColor: STAGE_COLOR[k],
                        }}
                      />
                    ) : null
                  )}
                </div>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-muted">
                  {(["nuevo", "progreso", "espInterna", "espCliente"] as CanonStage[])
                    .filter((k) => t[k] > 0.02)
                    .map((k) => (
                      <span key={k}>
                        <span style={{ color: STAGE_COLOR[k] }}>●</span>{" "}
                        {STAGE_LABEL_SHORT[k]}: <b className="text-text">{d1(t[k])} d</b>
                      </span>
                    ))}
                </div>
              </a>
            ))}
          </div>
        </Card>
      </div>

      {/* 5 · Recorrido por persona (tareas) */}
      <div>
        <SectionTitle
          n="05"
          title="Recorrido por persona (vía tareas)"
          sub={`El dueño del ticket no cambia, pero el trabajo se reparte en tareas asignadas a distintas personas. Promedio de días entre que se crea y se completa cada tarea, por persona. Snapshot ${TASK_TURNAROUND_SNAPSHOT.date} · se recalcula a pedido.`}
        />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {TASK_TURNAROUND_SNAPSHOT.families.map((f) => (
            <Card key={f.family}>
              <div className="font-serif font-semibold text-base text-text capitalize mb-3">{f.family}</div>
              <div className="space-y-2">
                {f.people.map((p) => {
                  const tone =
                    p.days > 30 ? "text-brugalired font-semibold"
                    : p.days > 10 ? "text-brugaliamber"
                    : "text-brugaligreen";
                  const maxDays = Math.max(...f.people.map((x) => x.days), 1);
                  return (
                    <div key={p.name} className="flex items-center gap-3 text-sm">
                      <span className="w-40 truncate text-text">{p.name}</span>
                      <div className="flex-1 h-2 rounded-full bg-surface2 overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${(p.days / maxDays) * 100}%`,
                            backgroundColor: p.days > 30 ? "#e63323" : p.days > 10 ? "#e6a303" : "#339f8f",
                          }}
                        />
                      </div>
                      <span className={`w-14 text-right font-mono ${tone}`}>{d1(p.days)}d</span>
                      <span className="w-12 text-right font-mono text-[11px] text-dim">n={p.n}</span>
                    </div>
                  );
                })}
              </div>
            </Card>
          ))}
        </div>
        <p className="text-[11px] text-dim mt-2">
          Es un promedio (sensible a casos extremos). "n" = tareas completadas medidas. Sólo familias donde el trabajo pasa por varias personas.
        </p>
      </div>

      {/* Referencia de colores */}
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-muted">
        {(["nuevo", "progreso", "espInterna", "espCliente"] as CanonStage[]).map((k) => (
          <span key={k}>
            <span style={{ color: STAGE_COLOR[k] }}>●</span> {STAGE_LABEL_SHORT[k]}
          </span>
        ))}
      </div>
    </main>
  );
}

const STAGE_LABEL_SHORT: Record<CanonStage, string> = {
  nuevo: "Sin tomar",
  progreso: "En progreso",
  espInterna: "Espera interna",
  espCliente: "Espera del local",
};

// Snapshot del recorrido por persona (vía tareas): promedio de días entre que
// se crea y se completa cada tarea, por persona, en las familias donde el
// trabajo pasa por varias manos. HubSpot no expone la duración de tarea de
// forma agregada en vivo, así que este bloque se recalcula a pedido.
export interface TaskPerson { name: string; days: number; n: number }
export interface TaskFamily { family: string; people: TaskPerson[] }
export const TASK_TURNAROUND_SNAPSHOT: { date: string; families: TaskFamily[] } = {
  date: "13-ago-2026",
  families: [
    {
      family: "inocuidad",
      people: [
        { name: "Dayana Mengo", days: 75.4, n: 18 },
        { name: "Romina Damiani", days: 57.5, n: 18 },
        { name: "Débora Paez", days: 20.8, n: 29 },
        { name: "Milagros Pereyra", days: 17.3, n: 47 },
        { name: "Marcos Tello", days: 16.9, n: 17 },
        { name: "Candelaria Fernandez", days: 6.4, n: 48 },
        { name: "Stefania Mengo", days: 6.4, n: 183 },
        { name: "Candela Carletti", days: 2.9, n: 6 },
      ],
    },
    {
      family: "entrega incorrecta",
      people: [
        { name: "Marcos Tello", days: 33.0, n: 35 },
        { name: "Stefania Mengo", days: 5.2, n: 84 },
      ],
    },
    {
      family: "reclamo proveedor",
      people: [
        { name: "Marcos Tello", days: 89.4, n: 6 },
        { name: "Romina Damiani", days: 70.6, n: 13 },
        { name: "Dayana Mengo", days: 51.5, n: 60 },
        { name: "Candelaria Fernandez", days: 6.2, n: 8 },
        { name: "Stefania Mengo", days: 6.1, n: 57 },
      ],
    },
    {
      family: "g.o - generar un ticket",
      people: [
        { name: "Milagros Pereyra", days: 10.0, n: 371 },
        { name: "Stefania Mengo", days: 8.2, n: 15 },
        { name: "Candelaria Fernandez", days: 7.0, n: 31 },
        { name: "Candela Carletti", days: 2.0, n: 38 },
      ],
    },
  ],
};
