import { Ticket, PIPELINE_ORDER, PIPELINES, DelaySource, DELAY_LABELS, OwnerHistoryMap } from "./hubspot";

export interface QuarterAreaStats {
  name: string;
  total: number;
  closed: number;
  closeRate: number;
  avgResolutionDays: number | null;
  slaCompliance: number | null;
}

export interface QuarterStats {
  quarter: 1 | 2;
  total: number;
  closed: number;
  closeRate: number;
  avgResolutionDays: number | null;
  slaCompliance: number | null;
  byArea: Record<string, QuarterAreaStats>;
}

export function buildQuarterStats(tickets: Ticket[], quarter: 1 | 2): QuarterStats {
  const ts = tickets.filter((t) => t.quarter === quarter);
  const closed = ts.filter((t) => t.isClosed);
  const closedWithDates = closed.filter((t) => t.closedAt);
  const avgRes = closedWithDates.length
    ? closedWithDates.reduce(
        (s, t) => s + (t.closedAt!.getTime() - t.createdAt.getTime()) / 86400000,
        0
      ) / closedWithDates.length
    : null;
  const closedWithSla = closed.filter((t) => t.slaCompliant !== null);
  const slaOk = closedWithSla.filter((t) => t.slaCompliant === true);
  const slaCompliance = closedWithSla.length > 0
    ? (slaOk.length / closedWithSla.length) * 100
    : null;

  const byArea: Record<string, QuarterAreaStats> = {};
  for (const pid of PIPELINE_ORDER) {
    const name = PIPELINES[pid as keyof typeof PIPELINES];
    const pts = ts.filter((t) => t.pipelineId === pid);
    const pclosed = pts.filter((t) => t.isClosed);
    const pclosedWithDates = pclosed.filter((t) => t.closedAt);
    const pavg = pclosedWithDates.length
      ? pclosedWithDates.reduce(
          (s, t) => s + (t.closedAt!.getTime() - t.createdAt.getTime()) / 86400000,
          0
        ) / pclosedWithDates.length
      : null;
    const pslaWith = pclosed.filter((t) => t.slaCompliant !== null);
    const pslaOk = pslaWith.filter((t) => t.slaCompliant === true);
    byArea[name] = {
      name,
      total: pts.length,
      closed: pclosed.length,
      closeRate: pts.length ? (pclosed.length / pts.length) * 100 : 0,
      avgResolutionDays: pavg,
      slaCompliance: pslaWith.length > 0 ? (pslaOk.length / pslaWith.length) * 100 : null,
    };
  }

  return {
    quarter,
    total: ts.length,
    closed: closed.length,
    closeRate: ts.length ? (closed.length / ts.length) * 100 : 0,
    avgResolutionDays: avgRes,
    slaCompliance,
    byArea,
  };
}

export interface AreaMetrics {
  pipelineId: string;
  name: string;
  total: number;
  closed: number;
  noCorresp: number;
  open: number;
  delayed: Ticket[];
  delayedCount: number;
  closeRate: number;
  delayRate: number;
  subjectBreakdown: [string, number][];
  avgResolutionDays: number | null;
}

export interface BranchMetrics {
  name: string;
  total: number;
  closed: number;
  delayed: number;
  delayedTickets: Ticket[];
  byArea: Record<string, number>;
  motives: Record<string, number>;
  topMotive: [string, number];
  lastActivity: Date | null;
  daysSinceActivity: number | null;
  closeRate: number;
}

export interface OwnerMetrics {
  ownerId: string | null;
  ownerName: string;
  total: number;
  open: number;
  delayed: number;
  delayedTickets: Ticket[];
  areas: Record<string, number>;
}

export interface ProductAlert {
  product: string;
  count: number;
  branches: string[];
  tickets: Ticket[];
}

export interface WeeklyPoint {
  weekStart: Date;
  label: string;
  newTickets: number;
  closed: number;
  delayed: number;
}

const DEMORA_DAYS = 7;

function startOfWeek(d: Date): Date {
  // Lunes como inicio
  const dt = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = dt.getUTCDay(); // 0=dom, 1=lun
  const diff = (day === 0 ? -6 : 1 - day);
  dt.setUTCDate(dt.getUTCDate() + diff);
  return dt;
}

export function buildAreaMetrics(tickets: Ticket[]): Record<string, AreaMetrics> {
  const out: Record<string, AreaMetrics> = {};
  for (const pid of PIPELINE_ORDER) {
    const ts = tickets.filter((t) => t.pipelineId === pid);
    const closed = ts.filter((t) => t.isClosed);
    const noCorresp = ts.filter((t) => t.isNoCorresp).length;
    const open = ts.filter((t) => t.isOpen);
    const delayed = open.filter((t) => t.isDelayed).sort((a, b) => b.daysOpen - a.daysOpen);
    const counter: Record<string, number> = {};
    for (const t of ts) counter[t.subject] = (counter[t.subject] || 0) + 1;
    const subjectBreakdown = Object.entries(counter).sort((a, b) => b[1] - a[1]);
    // Tiempo promedio resolución (sobre cerrados con closedAt)
    const closedWithDates = closed.filter((t) => t.closedAt);
    const avgRes = closedWithDates.length
      ? closedWithDates.reduce(
          (s, t) => s + (t.closedAt!.getTime() - t.createdAt.getTime()) / 86400000,
          0
        ) / closedWithDates.length
      : null;
    out[pid] = {
      pipelineId: pid,
      name: PIPELINES[pid as keyof typeof PIPELINES] || pid,
      total: ts.length,
      closed: closed.length,
      noCorresp,
      open: open.length,
      delayed,
      delayedCount: delayed.length,
      closeRate: ts.length ? (closed.length / ts.length) * 100 : 0,
      delayRate: open.length ? (delayed.length / open.length) * 100 : 0,
      subjectBreakdown,
      avgResolutionDays: avgRes,
    };
  }
  return out;
}

export function buildBranchMetrics(tickets: Ticket[]): BranchMetrics[] {
  const map = new Map<string, BranchMetrics>();
  const now = Date.now();
  for (const t of tickets) {
    if (!t.branch) continue;
    let b = map.get(t.branch);
    if (!b) {
      b = {
        name: t.branch,
        total: 0,
        closed: 0,
        delayed: 0,
        delayedTickets: [],
        byArea: {},
        motives: {},
        topMotive: ["—", 0],
        lastActivity: null,
        daysSinceActivity: null,
        closeRate: 0,
      };
      map.set(t.branch, b);
    }
    b.total++;
    if (t.isClosed) b.closed++;
    if (t.isDelayed) {
      b.delayed++;
      b.delayedTickets.push(t);
    }
    b.byArea[t.pipelineName] = (b.byArea[t.pipelineName] || 0) + 1;
    b.motives[t.subject] = (b.motives[t.subject] || 0) + 1;
    if (!b.lastActivity || t.createdAt > b.lastActivity) {
      b.lastActivity = t.createdAt;
    }
  }
  const result = Array.from(map.values()).map((b) => {
    const top = Object.entries(b.motives).sort((a, b) => b[1] - a[1])[0];
    b.topMotive = top || ["—", 0];
    b.closeRate = b.total ? (b.closed / b.total) * 100 : 0;
    b.daysSinceActivity = b.lastActivity
      ? Math.floor((now - b.lastActivity.getTime()) / 86400000)
      : null;
    return b;
  });
  return result.sort((a, b) => b.total - a.total);
}

export function detectProductAlerts(
  tickets: Ticket[],
  pipelineId = "811636614",
  minCount = 3
): ProductAlert[] {
  const cal = tickets.filter((t) => t.pipelineId === pipelineId && t.product);
  const groups = new Map<string, Ticket[]>();
  for (const t of cal) {
    const key = t.product!;
    const arr = groups.get(key) || [];
    arr.push(t);
    groups.set(key, arr);
  }
  const alerts: ProductAlert[] = [];
  for (const [product, ts] of Array.from(groups.entries())) {
    if (ts.length >= minCount) {
      const branches = Array.from(new Set(ts.map((t) => t.branch).filter(Boolean))) as string[];
      alerts.push({ product, count: ts.length, branches: branches.sort(), tickets: ts });
    }
  }
  return alerts.sort((a, b) => b.count - a.count);
}

export function buildWeeklyTrend(tickets: Ticket[]): WeeklyPoint[] {
  // Q2: del 1-abr al hoy, por semanas ISO (lunes inicio)
  const buckets = new Map<string, WeeklyPoint>();
  const months = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  for (const t of tickets) {
    const ws = startOfWeek(t.createdAt);
    const key = ws.toISOString().slice(0, 10);
    let b = buckets.get(key);
    if (!b) {
      b = {
        weekStart: ws,
        label: `${ws.getUTCDate()}-${months[ws.getUTCMonth()]}`,
        newTickets: 0,
        closed: 0,
        delayed: 0,
      };
      buckets.set(key, b);
    }
    b.newTickets++;
    if (t.isClosed) b.closed++;
    if (t.isDelayed) b.delayed++;
  }
  return Array.from(buckets.values()).sort(
    (a, b) => a.weekStart.getTime() - b.weekStart.getTime()
  );
}

export function lastClosedWeekRange(today = new Date()): {
  start: Date;
  end: Date;
  prevStart: Date;
  prevEnd: Date;
} {
  // Semana cerrada: martes-lunes anterior
  const t = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const dow = t.getUTCDay(); // 0=dom, 1=lun, 2=mar...
  // Encontrar el lunes más reciente (hoy si es lunes)
  const daysSinceMonday = (dow + 6) % 7;
  const lastMonday = new Date(t);
  lastMonday.setUTCDate(t.getUTCDate() - daysSinceMonday);
  const end = new Date(lastMonday);
  end.setUTCHours(23, 59, 59, 999);
  const start = new Date(end);
  start.setUTCDate(end.getUTCDate() - 6);
  start.setUTCHours(0, 0, 0, 0);
  const prevEnd = new Date(start.getTime() - 1);
  const prevStart = new Date(prevEnd);
  prevStart.setUTCDate(prevEnd.getUTCDate() - 6);
  prevStart.setUTCHours(0, 0, 0, 0);
  return { start, end, prevStart, prevEnd };
}

export interface ActionAlerts {
  sinRespuesta: Ticket[];      // Nuevo > 2d sin actividad
  estancadoInterno: Ticket[];  // Esp. resp. interna > 5d sin actividad
  vencidos: Ticket[];          // due date vencida, abiertos
}

export interface FollowUpTicket {
  ticket: Ticket;
  reasons: string[];
  urgency: number;
}

export interface OwnerFollowUp {
  ownerId: string | null;
  ownerName: string;
  tickets: FollowUpTicket[];
  totalUrgency: number;
  vencidos: number;
  sinRespuesta: number;
  estancados: number;
}

export function buildFollowUpByOwner(tickets: Ticket[]): OwnerFollowUp[] {
  const open = tickets.filter((t) => t.isOpen);
  const tagged = new Map<string, FollowUpTicket>();

  for (const t of open) {
    const reasons: string[] = [];
    let urgency = 0;
    if (t.isDelayed) {
      const days = t.daysOverdue ?? t.daysOpen;
      reasons.push(`Vencido hace ${days}d`);
      urgency += days * 3;
    }
    if (t.stageLabel === "Nuevo" && t.daysSinceActivity > 2) {
      reasons.push(`Sin respuesta · ${t.daysSinceActivity}d`);
      urgency += t.daysSinceActivity * 2;
    }
    if (t.stageLabel === "Esp. resp. interna" && t.daysSinceActivity > 5) {
      reasons.push(`Estancado interno · ${t.daysSinceActivity}d`);
      urgency += t.daysSinceActivity;
    }
    if (reasons.length > 0) tagged.set(t.id, { ticket: t, reasons, urgency });
  }

  const ownerMap = new Map<string, OwnerFollowUp>();
  for (const item of Array.from(tagged.values())) {
    const key = item.ticket.ownerId ?? "__sin__";
    let o = ownerMap.get(key);
    if (!o) {
      o = {
        ownerId: item.ticket.ownerId,
        ownerName: item.ticket.ownerName ?? "Sin asignar",
        tickets: [],
        totalUrgency: 0,
        vencidos: 0,
        sinRespuesta: 0,
        estancados: 0,
      };
      ownerMap.set(key, o);
    }
    o.tickets.push(item);
    o.totalUrgency += item.urgency;
    if (item.ticket.isDelayed) o.vencidos++;
    if (item.ticket.stageLabel === "Nuevo" && item.ticket.daysSinceActivity > 2) o.sinRespuesta++;
    if (item.ticket.stageLabel === "Esp. resp. interna" && item.ticket.daysSinceActivity > 5) o.estancados++;
  }

  return Array.from(ownerMap.values())
    .map((o) => ({ ...o, tickets: o.tickets.sort((a, b) => b.urgency - a.urgency) }))
    .sort((a, b) => b.totalUrgency - a.totalUrgency);
}

export function buildActionAlerts(tickets: Ticket[]): ActionAlerts {
  const open = tickets.filter((t) => t.isOpen);
  return {
    sinRespuesta: open
      .filter((t) => t.stageLabel === "Nuevo" && t.daysSinceActivity > 2)
      .sort((a, b) => b.daysSinceActivity - a.daysSinceActivity),
    estancadoInterno: open
      .filter((t) => t.stageLabel === "Esp. resp. interna" && t.daysSinceActivity > 5)
      .sort((a, b) => b.daysSinceActivity - a.daysSinceActivity),
    vencidos: open
      .filter((t) => t.isDelayed)
      .sort((a, b) => (b.daysOverdue ?? b.daysOpen) - (a.daysOverdue ?? a.daysOpen)),
  };
}

export function buildOwnerMetrics(tickets: Ticket[]): OwnerMetrics[] {
  const map = new Map<string, OwnerMetrics>();
  for (const t of tickets) {
    const key = t.ownerId ?? "__sin_asignar__";
    let o = map.get(key);
    if (!o) {
      o = {
        ownerId: t.ownerId,
        ownerName: t.ownerName ?? "Sin asignar",
        total: 0,
        open: 0,
        delayed: 0,
        delayedTickets: [],
        areas: {},
      };
      map.set(key, o);
    }
    o.total++;
    if (t.isOpen) o.open++;
    if (t.isDelayed) {
      o.delayed++;
      o.delayedTickets.push(t);
    }
    o.areas[t.pipelineName] = (o.areas[t.pipelineName] || 0) + 1;
  }
  return Array.from(map.values())
    .filter((o) => o.open > 0)
    .sort((a, b) => b.delayed - a.delayed || b.open - a.open);
}

export function inRange(t: Ticket, start: Date, end: Date): boolean {
  const ts = t.createdAt.getTime();
  return ts >= start.getTime() && ts <= end.getTime();
}

export function fmtDate(d: Date): string {
  const m = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  return `${d.getUTCDate()}-${m[d.getUTCMonth()]}`;
}

// =================== ANÁLISIS DE DEMORA (interna vs externa) ===================

export interface DelayBreakdown {
  total: number;
  external: number;
  internal_waiting: number;
  internal_working: number;
  internal_unassigned: number;
  other: number;
  // % de demora que es externa (no responsabilidad del embudo)
  externalPct: number;
}

export function breakdownDelay(tickets: Ticket[]): DelayBreakdown {
  const out: DelayBreakdown = {
    total: 0,
    external: 0,
    internal_waiting: 0,
    internal_working: 0,
    internal_unassigned: 0,
    other: 0,
    externalPct: 0,
  };
  for (const t of tickets) {
    out.total++;
    out[t.delaySource]++;
  }
  out.externalPct = out.total > 0 ? (out.external / out.total) * 100 : 0;
  return out;
}

// =================== MÉTRICAS POR AGENTE ===================

export interface AgentMetrics {
  ownerId: string;
  ownerName: string;
  totalOpen: number;        // tickets abiertos asignados ahora
  totalDelayed: number;     // demorados asignados
  totalClosedQ2: number;    // cerrados en Q2 (cuántos resolvió)
  avgResolutionDays: number | null; // promedio de días en cerrar (sobre cerrados Q2)
  // Sobre la base de history
  avgDaysHolding: number | null; // promedio que estuvo "sentado" sobre tickets demorados
  totalDaysAccumulated: number;  // suma de días que tuvo todos los demorados
  ticketsTouched: number;        // cuántos demorados distintos pasaron por sus manos
}

export function buildAgentMetrics(
  tickets: Ticket[],
  history?: OwnerHistoryMap
): AgentMetrics[] {
  const map = new Map<string, AgentMetrics>();

  function getOrCreate(id: string, name: string): AgentMetrics {
    let a = map.get(id);
    if (!a) {
      a = {
        ownerId: id,
        ownerName: name,
        totalOpen: 0,
        totalDelayed: 0,
        totalClosedQ2: 0,
        avgResolutionDays: null,
        avgDaysHolding: null,
        totalDaysAccumulated: 0,
        ticketsTouched: 0,
      };
      map.set(id, a);
    }
    return a;
  }

  // Estado actual: owner asignado
  for (const t of tickets) {
    const key = t.ownerId ?? "__sin__";
    const name = t.ownerName ?? "Sin asignar";
    const a = getOrCreate(key, name);
    if (t.isOpen) a.totalOpen++;
    if (t.isDelayed) a.totalDelayed++;
    if (t.isClosed && t.quarter === 2) {
      a.totalClosedQ2++;
    }
  }

  // Tiempo promedio resolución por owner (sobre cerrados Q2)
  const resolutionsByOwner = new Map<string, number[]>();
  for (const t of tickets) {
    if (t.isClosed && t.quarter === 2 && t.closedAt) {
      const key = t.ownerId ?? "__sin__";
      const days = (t.closedAt.getTime() - t.createdAt.getTime()) / 86400000;
      const arr = resolutionsByOwner.get(key) || [];
      arr.push(days);
      resolutionsByOwner.set(key, arr);
    }
  }
  for (const [key, arr] of Array.from(resolutionsByOwner.entries())) {
    if (arr.length === 0) continue;
    const a = map.get(key);
    if (!a) continue;
    a.avgResolutionDays = arr.reduce((s, v) => s + v, 0) / arr.length;
  }

  // History — para los tickets demorados que tienen historial
  if (history) {
    const accumByOwner = new Map<string, { totalDays: number; tickets: Set<string> }>();
    for (const t of tickets) {
      if (!t.isDelayed) continue;
      const entries = history.get(t.id);
      if (!entries || entries.length === 0) continue;
      for (const entry of entries) {
        const cur = accumByOwner.get(entry.ownerId) || { totalDays: 0, tickets: new Set<string>() };
        cur.totalDays += entry.days;
        cur.tickets.add(t.id);
        accumByOwner.set(entry.ownerId, cur);
      }
    }
    for (const [ownerId, data] of Array.from(accumByOwner.entries())) {
      const a = map.get(ownerId);
      if (!a) continue;
      a.totalDaysAccumulated = data.totalDays;
      a.ticketsTouched = data.tickets.size;
      a.avgDaysHolding = data.tickets.size > 0 ? data.totalDays / data.tickets.size : null;
    }
  }

  return Array.from(map.values()).sort((a, b) => {
    // Ordenar por demorados primero, después por abiertos
    if (b.totalDelayed !== a.totalDelayed) return b.totalDelayed - a.totalDelayed;
    return b.totalOpen - a.totalOpen;
  });
}

export { DELAY_LABELS };
export type { DelaySource };

// =================== ANÁLISIS PROFUNDO POR AGENTE ===================

export interface AgentDeepMetrics {
  ownerId: string;
  ownerName: string;
  // Carga / volumen
  currentOpen: number;          // tickets abiertos asignados ahora
  currentDelayed: number;       // demorados actuales
  totalTouchedQ2: number;       // tickets distintos que pasaron por sus manos en Q2
  // Tiempos
  avgHoldingDays: number | null;     // promedio de días que se sienta sobre un ticket antes de soltarlo
  medianHoldingDays: number | null;  // mediana (más representativa que el promedio)
  totalHoldingDays: number;          // suma total de días sosteniendo
  avgResolutionDays: number | null;  // promedio de cierre cuando él lo cerró
  resolvedCount: number;
  // Embudos
  byPipeline: Record<string, number>;     // tickets que recibió por embudo
  // Donde MÁS se traba (embudo donde sus tickets se demoran más)
  worstPipeline: { name: string; avgDays: number } | null;
  // Performance
  fastResponseRate: number | null;        // % de tickets que soltó en <2 días
}

interface OwnerStint {
  ownerId: string;
  ownerName: string;
  ticketId: string;
  pipelineName: string;
  days: number;
}

export function buildAgentDeepMetrics(
  tickets: Ticket[],
  history: OwnerHistoryMap
): AgentDeepMetrics[] {
  const map = new Map<string, AgentDeepMetrics>();
  const stintsByAgent = new Map<string, OwnerStint[]>();

  function getOrCreate(id: string, name: string): AgentDeepMetrics {
    let a = map.get(id);
    if (!a) {
      a = {
        ownerId: id,
        ownerName: name,
        currentOpen: 0,
        currentDelayed: 0,
        totalTouchedQ2: 0,
        avgHoldingDays: null,
        medianHoldingDays: null,
        totalHoldingDays: 0,
        avgResolutionDays: null,
        resolvedCount: 0,
        byPipeline: {},
        worstPipeline: null,
        fastResponseRate: null,
      };
      map.set(id, a);
    }
    return a;
  }

  // Stats actuales: carga, demorados
  for (const t of tickets) {
    const key = t.ownerId ?? "__sin__";
    const name = t.ownerName ?? "Sin asignar";
    const a = getOrCreate(key, name);
    if (t.isOpen) a.currentOpen++;
    if (t.isDelayed) a.currentDelayed++;
    if (t.isClosed && t.closedAt) {
      a.resolvedCount++;
    }
  }

  // Tiempos de resolución por owner
  const resByOwner = new Map<string, number[]>();
  for (const t of tickets) {
    if (t.isClosed && t.closedAt) {
      const key = t.ownerId ?? "__sin__";
      const arr = resByOwner.get(key) || [];
      arr.push((t.closedAt.getTime() - t.createdAt.getTime()) / 86400000);
      resByOwner.set(key, arr);
    }
  }
  for (const [key, arr] of Array.from(resByOwner.entries())) {
    if (arr.length === 0) continue;
    const a = map.get(key);
    if (a) {
      a.avgResolutionDays = arr.reduce((s, v) => s + v, 0) / arr.length;
    }
  }

  // Stints por agente (basado en history)
  const ticketMap = new Map(tickets.map((t) => [t.id, t]));
  for (const [ticketId, entries] of Array.from(history.entries())) {
    const t = ticketMap.get(ticketId);
    if (!t) continue;
    for (const entry of entries) {
      const stint: OwnerStint = {
        ownerId: entry.ownerId,
        ownerName: entry.ownerName,
        ticketId,
        pipelineName: t.pipelineName,
        days: entry.days,
      };
      const arr = stintsByAgent.get(entry.ownerId) || [];
      arr.push(stint);
      stintsByAgent.set(entry.ownerId, arr);
    }
  }

  for (const [ownerId, stints] of Array.from(stintsByAgent.entries())) {
    const a = map.get(ownerId);
    if (!a) continue;
    const uniqueTickets = new Set(stints.map((s) => s.ticketId));
    a.totalTouchedQ2 = uniqueTickets.size;
    a.totalHoldingDays = stints.reduce((s, v) => s + v.days, 0);
    if (stints.length > 0) {
      a.avgHoldingDays = a.totalHoldingDays / stints.length;
      const sorted = [...stints].map((s) => s.days).sort((x, y) => x - y);
      a.medianHoldingDays = sorted[Math.floor(sorted.length / 2)];
      // % de stints rápidos (<2 días)
      const fast = stints.filter((s) => s.days < 2).length;
      a.fastResponseRate = (fast / stints.length) * 100;
    }
    // Por pipeline
    for (const s of stints) {
      a.byPipeline[s.pipelineName] = (a.byPipeline[s.pipelineName] || 0) + 1;
    }
    // Worst pipeline: aquel donde el agente tarda más en promedio
    const byPipelineDays = new Map<string, number[]>();
    for (const s of stints) {
      const arr = byPipelineDays.get(s.pipelineName) || [];
      arr.push(s.days);
      byPipelineDays.set(s.pipelineName, arr);
    }
    let worst: { name: string; avgDays: number } | null = null;
    for (const [pname, days] of Array.from(byPipelineDays.entries())) {
      if (days.length < 2) continue; // mínimo 2 muestras para que tenga sentido
      const avg = days.reduce((s, v) => s + v, 0) / days.length;
      if (!worst || avg > worst.avgDays) {
        worst = { name: pname, avgDays: avg };
      }
    }
    a.worstPipeline = worst;
  }

  return Array.from(map.values())
    .filter((a) => a.currentOpen > 0 || a.totalTouchedQ2 > 0 || a.resolvedCount > 0)
    .sort((a, b) => {
      // Ordenar por carga actual + demorados
      const sa = a.currentDelayed * 2 + a.currentOpen;
      const sb = b.currentDelayed * 2 + b.currentOpen;
      return sb - sa;
    });
}
