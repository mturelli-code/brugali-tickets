"use client";
import { useEffect, useState } from "react";

// Helpers de fecha/trimestre compartidos por todas las vistas.
export function toInputDate(d: Date) {
  return d.toISOString().slice(0, 10);
}
export function startOfDay(d: Date) {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}
export function endOfDay(d: Date) {
  const x = new Date(d);
  x.setUTCHours(23, 59, 59, 999);
  return x;
}

// Primer trimestre con datos en HubSpot. Los siguientes se generan solos.
export const DATA_START = new Date(Date.UTC(2026, 0, 1));

export function quarterOf(d: Date) {
  return Math.floor(d.getUTCMonth() / 3) + 1; // 1..4
}
export function quarterStartDate(year: number, q: number) {
  return new Date(Date.UTC(year, (q - 1) * 3, 1));
}
export function quarterEndDate(year: number, q: number) {
  return new Date(Date.UTC(year, q * 3, 0, 23, 59, 59, 999));
}
export function quarterKey(year: number, q: number) {
  return `q-${year}-${q}`;
}

export type QuarterInfo = { year: number; q: number; key: string; label: string; current: boolean };

// Lista de trimestres desde DATA_START hasta el trimestre en curso (inclusive).
export function buildQuarters(from: Date, now: Date): QuarterInfo[] {
  const list: QuarterInfo[] = [];
  let y = from.getUTCFullYear();
  let q = quarterOf(from);
  const endY = now.getUTCFullYear();
  const endQ = quarterOf(now);
  while (y < endY || (y === endY && q <= endQ)) {
    list.push({
      year: y,
      q,
      key: quarterKey(y, q),
      label: `Q${q} ${y}`,
      current: y === endY && q === endQ,
    });
    q++;
    if (q > 4) {
      q = 1;
      y++;
    }
  }
  return list;
}

// Resuelve un preset a un rango [from, to] concreto.
export function resolvePreset(key: string, now: Date): { from: Date; to: Date } | null {
  let from: Date;
  let to: Date = endOfDay(now);
  if (key === "all") {
    from = DATA_START;
    to = endOfDay(now);
  } else if (key.startsWith("q-")) {
    const [, yStr, qStr] = key.split("-");
    const y = Number(yStr);
    const q = Number(qStr);
    from = quarterStartDate(y, q);
    const qEnd = quarterEndDate(y, q);
    to = qEnd.getTime() > endOfDay(now).getTime() ? endOfDay(now) : qEnd;
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
    return null;
  }
  return { from, to };
}

// Rango inicial por defecto = trimestre en curso (cortado en hoy).
export function defaultRange(now: Date): { from: string; to: string; key: string } {
  const quarters = buildQuarters(DATA_START, now);
  const current = quarters[quarters.length - 1];
  const from = quarterStartDate(current.year, current.q);
  const qEnd = quarterEndDate(current.year, current.q);
  const to = qEnd.getTime() > endOfDay(now).getTime() ? endOfDay(now) : qEnd;
  return { from: toInputDate(from), to: toInputDate(to), key: current.key };
}

/**
 * Filtro de período reutilizable. Maneja su propio estado (presets + fechas)
 * y notifica al padre el rango elegido vía onChange(fromISO, toISO).
 * El padre filtra sus datos con ese rango.
 */
export default function PeriodFilter({
  onChange,
  rightInfo,
  defaultToAll = false,
}: {
  onChange: (fromISO: string, toISO: string) => void;
  rightInfo?: React.ReactNode;
  defaultToAll?: boolean;
}) {
  const now0 = new Date();
  const init = defaultToAll
    ? { from: toInputDate(DATA_START), to: toInputDate(endOfDay(now0)), key: "all" }
    : defaultRange(now0);
  const [startDate, setStartDate] = useState<string>(init.from);
  const [endDate, setEndDate] = useState<string>(init.to);
  const [activePreset, setActivePreset] = useState<string>(init.key);

  // Notificar al padre cuando cambia el rango (incluye el mount).
  useEffect(() => {
    onChange(startDate, endDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate]);

  const quarters = buildQuarters(DATA_START, new Date());

  function applyPreset(key: string) {
    const r = resolvePreset(key, new Date());
    if (!r) return;
    setStartDate(toInputDate(r.from));
    setEndDate(toInputDate(r.to));
    setActivePreset(key);
  }

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
    <div className="bg-surface border border-border rounded-xl p-4">
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <span className="text-[11px] uppercase tracking-wider text-muted font-semibold mr-1">
          Período:
        </span>
        {quarters.map((qt) => (
          <PresetBtn key={qt.key} k={qt.key} label={qt.current ? `${qt.label} (en curso)` : qt.label} />
        ))}
        <PresetBtn k="7d" label="Últimos 7 días" />
        <PresetBtn k="30d" label="Últimos 30 días" />
        <PresetBtn k="month" label="Mes en curso" />
        <PresetBtn k="prev_month" label="Mes anterior" />
        <PresetBtn k="all" label="Todo" />
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="text-[10px] uppercase tracking-wider text-muted font-semibold block mb-1">Desde</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => { setStartDate(e.target.value); setActivePreset("custom"); }}
            className="px-3 py-1.5 text-sm border border-border rounded-lg bg-bg focus:outline-none focus:border-accent"
          />
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-wider text-muted font-semibold block mb-1">Hasta</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => { setEndDate(e.target.value); setActivePreset("custom"); }}
            className="px-3 py-1.5 text-sm border border-border rounded-lg bg-bg focus:outline-none focus:border-accent"
          />
        </div>
        {rightInfo && <div className="ml-auto text-[11px] text-muted">{rightInfo}</div>}
      </div>
    </div>
  );
}
