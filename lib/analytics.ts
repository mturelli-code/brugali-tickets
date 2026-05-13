import { Ticket, PIPELINE_ORDER, PIPELINES } from "./hubspot";

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
