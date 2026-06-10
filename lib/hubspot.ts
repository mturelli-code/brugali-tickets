/**
 * Cliente HubSpot para consultar tickets.
 * Usa el token de la Service Key configurado como HUBSPOT_TOKEN en Vercel.
 */

export const PIPELINES = {
  "778101333": "Sistemas",
  "811636614": "Calidad",
  "779395653": "Logística",
  "779098922": "Marketing",
  "779095400": "Operaciones",
  "779123273": "Administración",
} as const;

export const PIPELINE_ORDER = [
  "778101333",
  "779095400",
  "779123273",
  "811636614",
  "779395653",
  "779098922",
];

export const CLOSED_STAGES = new Set([
  "4", "1136629053", "1195345718", "1138326920",
  "1138319741", "1138265242", "1138276222",
]);

export const NO_CORRESPONDE_STAGES = new Set([
  "233456008", "1150595705", "1195345719", "1150595708",
  "1150525272", "1150614365", "1150525275",
]);

export const STAGE_LABELS: Record<string, string> = {
  "1136629050": "Nuevo", "1136629051": "En Progreso",
  "1136629052": "Esp. resp. cliente", "1136452440": "Esp. resp. interna",
  "1136629053": "Cerrados", "1150595705": "No corresponde",
  "1195345714": "Nuevo", "1195345715": "En Progreso",
  "1195345716": "Esp. resp. cliente", "1195345717": "Esp. resp. interna",
  "1195345718": "Cerrados", "1195345719": "No corresponde",
  "1138326917": "Nuevo", "1138326918": "En Progreso",
  "1138326919": "Esp. resp. cliente", "1138326921": "Esp. resp. interna",
  "1138326920": "Cerrados", "1150595708": "No corresponde",
  "1138319738": "Nuevo", "1138319739": "En Progreso",
  "1138319740": "Esp. resp. cliente", "1150525271": "Esp. resp. interna",
  "1138319741": "Cerrados", "1150525272": "No corresponde",
  "1138265239": "Nuevo", "1138265240": "En Progreso",
  "1138265241": "Esp. resp. cliente", "1150614364": "Esp. resp. interna",
  "1138265242": "Cerrados", "1150614365": "No corresponde",
  "1138276219": "Nuevo", "1138276220": "En Progreso",
  "1150525273": "Esp. resp. cliente", "1150525274": "Esp. resp. interna",
  "1138276222": "Cerrados", "1150525275": "No corresponde",
};

export const HUBSPOT_BASE_URL =
  "https://app.hubspot.com/contacts/43958366/record/0-5";

export const Q1_START_MS = Date.UTC(2026, 0, 1);  // 1 ene 2026
export const Q2_START_MS = Date.UTC(2026, 3, 1);  // 1 abr 2026

export interface RawTicket {
  id: string;
  properties: {
    hs_pipeline?: string;
    hs_pipeline_stage?: string;
    createdate?: string;
    hs_lastmodifieddate?: string;
    closed_date?: string;
    hs_due_date?: string;
    subject?: string;
    nombre_sucursal?: string;
    nombre_producto?: string;
    hubspot_owner_id?: string;
    hs_v2_date_entered_current_stage?: string;
    hs_v2_time_in_current_stage?: string;
  };
}

// Clasificación de quién traba el ticket según etapa actual
export type DelaySource =
  | "external"          // Esperando respuesta del cliente/sucursal
  | "internal_waiting"  // Esperando respuesta interna Brugali
  | "internal_working"  // En progreso (alguien lo está trabajando)
  | "internal_unassigned" // Nuevo sin asignar
  | "other";

export function classifyDelay(stageLabel: string): DelaySource {
  const s = stageLabel.toLowerCase();
  if (s.includes("esp. resp. cliente") || s.includes("respuesta del cliente") || s.includes("respuesta de cliente")) {
    return "external";
  }
  if (s.includes("esp. resp. interna") || s.includes("respuesta interna")) {
    return "internal_waiting";
  }
  if (s.includes("en progreso") || s.includes("en proceso")) {
    return "internal_working";
  }
  if (s.includes("nuevo")) {
    return "internal_unassigned";
  }
  return "other";
}

export const DELAY_LABELS: Record<DelaySource, string> = {
  external: "Esperando a la sucursal/cliente",
  internal_waiting: "Bloqueado por otra área Brugali",
  internal_working: "En progreso (en este embudo)",
  internal_unassigned: "Sin asignar (este embudo no lo agarró)",
  other: "Otra",
};

export const DELAY_COLORS: Record<DelaySource, string> = {
  external: "#f07e26",          // orange — depende del local
  internal_waiting: "#e63323",  // red — interno bloqueado
  internal_working: "#339f8f",  // green — está activo
  internal_unassigned: "#e6a303", // amber — sin agarrar
  other: "#6a6862",             // muted
};

export interface Ticket {
  id: string;
  quarter: 1 | 2;
  pipelineId: string;
  pipelineName: string;
  stageId: string;
  stageLabel: string;
  subject: string;
  branch: string | null;
  product: string | null;
  ownerId: string | null;
  ownerName: string | null;
  createdAt: Date;
  lastModifiedAt: Date | null;
  dueDate: Date | null;
  closedAt: Date | null;
  isClosed: boolean;
  isNoCorresp: boolean;
  isOpen: boolean;
  daysOpen: number;
  daysOverdue: number | null;
  daysSinceActivity: number;
  isDelayed: boolean;
  slaCompliant: boolean | null;
  hubspotUrl: string;
  // Análisis de demora
  daysInCurrentStage: number;
  delaySource: DelaySource;
}

// Histórico de owners por ticket (solo se trae para demorados)
export interface OwnerHistoryEntry {
  ownerId: string;
  ownerName: string;
  start: Date;
  end: Date | null;
  days: number;
}
export type OwnerHistoryMap = Map<string, OwnerHistoryEntry[]>;

const HUBSPOT_API = "https://api.hubapi.com/crm/v3/objects/tickets/search";
const DEMORA_DAYS = 7;
const TEST_PATTERN = /\b(test|prueba)\b/i;

function parseBranch(raw: string): string {
  const s = raw.trim();
  if (!s) return "";
  if (s.startsWith("{")) {
    try {
      const parsed = JSON.parse(s);
      return String(parsed.value ?? parsed.name ?? "");
    } catch {
      return "";
    }
  }
  return s;
}

function isTestBranch(raw: string): boolean {
  const val = parseBranch(raw);
  return val === "99" || val === "";
}

function parseHsDate(val: string | undefined): Date | null {
  if (!val) return null;
  // HubSpot devuelve fechas como ISO "2026-05-10" o como timestamp ms "1746835200000"
  if (/^\d{10,}$/.test(val)) return new Date(Number(val));
  return new Date(val);
}

async function fetchOwners(token: string): Promise<Map<string, string>> {
  try {
    const map = new Map<string, string>();
    let after: string | undefined;
    do {
      const url = `https://api.hubapi.com/crm/v3/owners?limit=100&includeDeactivated=true${after ? `&after=${after}` : ""}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
        next: { revalidate: 3600 },
      });
      if (!res.ok) break;
      const data = await res.json();
      for (const o of data.results || []) {
        const name = `${o.firstName || ""} ${o.lastName || ""}`.trim() || o.email || String(o.id);
        // HubSpot usa id (CRM owner ID) o userId según el contexto — mapeamos ambos
        if (o.id) map.set(String(o.id), name);
        if (o.userId) map.set(String(o.userId), name);
      }
      after = data.paging?.next?.after;
    } while (after);
    return map;
  } catch {
    return new Map();
  }
}

async function searchPage(token: string, pipelineId: string, after?: string) {
  const body = {
    filterGroups: [
      {
        filters: [
          { propertyName: "createdate", operator: "GTE", value: String(Q1_START_MS) },
          { propertyName: "hs_pipeline", operator: "EQ", value: pipelineId },
        ],
      },
    ],
    properties: [
      "hs_pipeline", "hs_pipeline_stage", "createdate",
      "hs_lastmodifieddate", "closed_date", "hs_due_date",
      "subject", "nombre_sucursal", "nombre_producto", "hubspot_owner_id",
      "hs_v2_date_entered_current_stage", "hs_v2_time_in_current_stage",
    ],
    sorts: [{ propertyName: "createdate", direction: "ASCENDING" }],
    limit: 100,
    ...(after ? { after } : {}),
  };

  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(HUBSPOT_API, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      next: { revalidate: 600 },
    });

    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
      continue;
    }
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`HubSpot API ${res.status}: ${text}`);
    }
    return res.json();
  }
  throw new Error("HubSpot API: rate limit superado después de 3 intentos");
}

export async function getAllTickets(): Promise<Ticket[]> {
  const token = process.env.HUBSPOT_TOKEN;
  if (!token) throw new Error("HUBSPOT_TOKEN no configurado en variables de entorno");

  const now = Date.now();
  const owners = await fetchOwners(token);
  const all: Ticket[] = [];

  for (const pipelineId of PIPELINE_ORDER) {
    await new Promise((r) => setTimeout(r, 400));
    let after: string | undefined = undefined;
    do {
      const data: any = await searchPage(token, pipelineId, after);
      const raw: RawTicket[] = data.results || [];
      for (const r of raw) {
        const subject = r.properties.subject || "";
        const product = r.properties.nombre_producto?.trim() || "";
        if (TEST_PATTERN.test(subject) || TEST_PATTERN.test(product)) continue;
        const stage = r.properties.hs_pipeline_stage || "";
        const created = new Date(r.properties.createdate || 0);
        if (created.getTime() > now) continue;
        const rawSucursal = r.properties.nombre_sucursal || "";
        if (isTestBranch(rawSucursal)) continue;
        const branch = parseBranch(rawSucursal);
        const closed = parseHsDate(r.properties.closed_date);
        const lastModified = parseHsDate(r.properties.hs_lastmodifieddate);
        const dueDate = parseHsDate(r.properties.hs_due_date);
        const ownerId = r.properties.hubspot_owner_id || null;
        const isClosed = CLOSED_STAGES.has(stage);
        const isNoCorresp = NO_CORRESPONDE_STAGES.has(stage);
        const isOpen = !isClosed && !isNoCorresp;
        const daysOpen = Math.floor((now - created.getTime()) / 86400000);
        const daysSinceActivity = lastModified
          ? Math.floor((now - lastModified.getTime()) / 86400000)
          : daysOpen;
        const isPastDue = dueDate ? dueDate.getTime() < now : false;
        const isDelayed = isOpen && (isPastDue || daysOpen > DEMORA_DAYS);
        const daysOverdue = isDelayed && dueDate
          ? Math.floor((now - dueDate.getTime()) / 86400000)
          : null;
        const slaCompliant = isClosed && dueDate && closed
          ? closed.getTime() <= dueDate.getTime()
          : null;
        const quarter: 1 | 2 = created.getTime() < Q2_START_MS ? 1 : 2;

        // Días en etapa actual
        const enteredCurrentStage = parseHsDate(r.properties.hs_v2_date_entered_current_stage);
        let daysInCurrentStage = 0;
        if (enteredCurrentStage) {
          daysInCurrentStage = Math.max(0, Math.floor((now - enteredCurrentStage.getTime()) / 86400000));
        } else if (r.properties.hs_v2_time_in_current_stage) {
          // viene en segundos
          const secs = Number(r.properties.hs_v2_time_in_current_stage) || 0;
          daysInCurrentStage = Math.floor(secs / 86400);
        }

        const stageLabel = STAGE_LABELS[stage] || stage;
        const delaySource = isOpen ? classifyDelay(stageLabel) : "other";

        all.push({
          id: r.id,
          quarter,
          pipelineId,
          pipelineName: PIPELINES[pipelineId as keyof typeof PIPELINES] || pipelineId,
          stageId: stage,
          stageLabel,
          subject,
          branch: branch || null,
          product: product || null,
          ownerId,
          ownerName: ownerId ? (owners.get(ownerId) ?? `ID:${ownerId}`) : null,
          createdAt: created,
          lastModifiedAt: lastModified,
          dueDate,
          daysOverdue,
          closedAt: closed,
          isClosed,
          isNoCorresp,
          isOpen,
          daysOpen,
          daysSinceActivity,
          isDelayed,
          slaCompliant,
          hubspotUrl: `${HUBSPOT_BASE_URL}/${r.id}`,
          daysInCurrentStage,
          delaySource,
        });
      }
      after = data.paging?.next?.after;
    } while (after);
  }

  return all;
}

/**
 * Trae el histórico de owner para una lista de tickets (solo demorados típicamente).
 * Si la consulta falla para un ticket individual, se omite (no rompe el render).
 */
export async function getOwnerHistory(ticketIds: string[]): Promise<OwnerHistoryMap> {
  const token = process.env.HUBSPOT_TOKEN;
  if (!token) return new Map();
  if (ticketIds.length === 0) return new Map();

  // Reusar fetchOwners para mapear ID → nombre
  const ownersMap = await fetchOwners(token);

  const result: OwnerHistoryMap = new Map();
  // Limitar concurrencia para no saturar HubSpot rate limit
  const concurrent = 5;
  for (let i = 0; i < ticketIds.length; i += concurrent) {
    const batch = ticketIds.slice(i, i + concurrent);
    await Promise.all(
      batch.map(async (id) => {
        try {
          const url = `https://api.hubapi.com/crm/v3/objects/tickets/${id}?propertiesWithHistory=hubspot_owner_id`;
          const res = await fetch(url, {
            headers: { Authorization: `Bearer ${token}` },
            next: { revalidate: 600 },
          });
          if (!res.ok) return;
          const data = await res.json();
          const history = data.propertiesWithHistory?.hubspot_owner_id || [];
          if (history.length === 0) return;

          // history viene ordenado desc (más reciente primero)
          // queremos asc para poder calcular fin = inicio del siguiente
          const sorted = [...history].sort((a: any, b: any) =>
            new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
          );

          const entries: OwnerHistoryEntry[] = [];
          const now = Date.now();
          for (let j = 0; j < sorted.length; j++) {
            const ownerId = String(sorted[j].value || "");
            if (!ownerId) continue;
            const start = new Date(sorted[j].timestamp);
            const end = j + 1 < sorted.length ? new Date(sorted[j + 1].timestamp) : null;
            const endMs = end ? end.getTime() : now;
            const days = Math.max(0, Math.floor((endMs - start.getTime()) / 86400000));
            entries.push({
              ownerId,
              ownerName: ownersMap.get(ownerId) ?? `ID:${ownerId}`,
              start,
              end,
              days,
            });
          }
          result.set(id, entries);
        } catch {
          // Silenciar errores individuales
        }
      })
    );
    // pequeño respiro entre batches
    if (i + concurrent < ticketIds.length) {
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  return result;
}
