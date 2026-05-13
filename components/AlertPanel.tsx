import type { ActionAlerts } from "@/lib/analytics";
import type { Ticket } from "@/lib/hubspot";
import { fmtDate } from "@/lib/analytics";

function AlertBlock({
  title,
  subtitle,
  tickets,
  maxVisible = 6,
}: {
  title: string;
  subtitle: string;
  tickets: Ticket[];
  maxVisible?: number;
}) {
  if (tickets.length === 0) return null;
  const visible = tickets.slice(0, maxVisible);
  const rest = tickets.length - maxVisible;

  return (
    <div className="border-2 border-brugalired rounded-xl overflow-hidden">
      <div className="bg-brugalired/10 px-5 py-3 flex items-center gap-3">
        <span className="w-2.5 h-2.5 rounded-full bg-brugalired animate-pulse shrink-0" />
        <span className="font-semibold text-brugalired text-sm uppercase tracking-wide">
          URGENTE — {title}
        </span>
      </div>
      <div className="px-5 py-4">
        <div className="flex items-baseline gap-3 mb-2">
          <span className="font-mono font-bold text-4xl text-brugalired">{tickets.length}</span>
          <span className="text-sm text-text">{subtitle}</span>
        </div>
        <div className="mt-3 divide-y divide-border">
          {visible.map((t) => (
            <div key={t.id} className="flex items-center justify-between py-2 gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <a
                  href={t.hubspotUrl}
                  target="_blank"
                  rel="noopener"
                  className="font-medium text-sm text-accent underline decoration-dotted hover:text-brugaliorange truncate"
                >
                  {t.subject}
                </a>
                <span className="text-xs text-muted shrink-0">{t.branch ?? "—"}</span>
                <span className="text-xs text-muted shrink-0">{t.pipelineName}</span>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                {t.ownerName && (
                  <span className="text-xs text-muted">{t.ownerName}</span>
                )}
                <span className="font-mono text-xs font-semibold text-brugalired">
                  {t.daysSinceActivity}d sin actividad
                </span>
                <span className="text-xs text-dim">{fmtDate(t.createdAt)}</span>
              </div>
            </div>
          ))}
          {rest > 0 && (
            <div className="pt-2 text-xs text-dim">
              + {rest} tickets adicionales ({Math.ceil(rest / 2)} a {tickets[maxVisible]?.daysSinceActivity ?? 0} días).
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AlertPanel({ alerts }: { alerts: ActionAlerts }) {
  const total = alerts.sinRespuesta.length + alerts.estancadoInterno.length + alerts.vencidos.length;
  if (total === 0) {
    return (
      <div className="bg-surface border border-brugaligreen rounded-xl p-5 flex items-center gap-3">
        <span className="text-brugaligreen text-lg">✓</span>
        <span className="text-sm text-brugaligreen font-medium">
          Sin alertas urgentes — todos los tickets tienen actividad reciente y están dentro de plazo.
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <AlertBlock
        title="Sin primera respuesta"
        subtitle="tickets en etapa Nuevo sin actividad hace más de 2 días. Acción: asignar y responder."
        tickets={alerts.sinRespuesta}
      />
      <AlertBlock
        title="Estancados — espera interna"
        subtitle="tickets esperando respuesta interna sin actividad hace más de 5 días. Alguien de Brugali tiene que actuar."
        tickets={alerts.estancadoInterno}
      />
      <AlertBlock
        title="Vencidos sin cerrar"
        subtitle="tickets con fecha de vencimiento superada, aún abiertos."
        tickets={alerts.vencidos}
        maxVisible={8}
      />
    </div>
  );
}
