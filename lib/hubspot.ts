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
  };
}

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
  slaCompliant: boolean | null; // null = no aplica (abierto o sin fecha)
  hubspotUrl: string;
}

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

        all.push({
          id: r.id,
          quarter,
          pipelineId,
          pipelineName: PIPELINES[pipelineId as keyof typeof PIPELINES] || pipelineId,
          stageId: stage,
          stageLabel: STAGE_LABELS[stage] || stage,
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
        });
      }
      after = data.paging?.next?.after;
    } while (after);
  }

  return all;
}
