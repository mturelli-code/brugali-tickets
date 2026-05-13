import { getAllTickets } from "@/lib/hubspot";
import { buildFollowUpByOwner, fmtDate } from "@/lib/analytics";

export const revalidate = 600;

const REASON_COLOR: Record<string, string> = {
  V: "bg-brugalired/10 text-brugalired",
  S: "bg-brugaliamber/10 text-brugaliamber",
  E: "bg-brugaliorange/10 text-brugaliorange",
};

function reasonTag(reason: string) {
  const color = reason.startsWith("Vencido")
    ? REASON_COLOR.V
    : reason.startsWith("Sin respuesta")
    ? REASON_COLOR.S
    : REASON_COLOR.E;
  return (
    <span
      key={reason}
      className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold mr-1 ${color}`}
    >
      {reason}
    </span>
  );
}

export default async function AlertasPage() {
  let allTickets;
  try {
    allTickets = await getAllTickets();
  } catch (err: any) {
    return (
      <div className="p-8 bg-surface border border-brugalired rounded-xl">
        <h2 className="font-serif font-bold text-xl text-brugalired mb-2">Error consultando HubSpot</h2>
        <p className="text-sm text-muted">{err.message}</p>
      </div>
    );
  }

  const tickets = allTickets.filter((t) => t.quarter === 2);
  const byOwner = buildFollowUpByOwner(tickets);
  const totalTickets = byOwner.reduce((s, o) => s + o.tickets.length, 0);
  const today = new Date();

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="font-serif font-bold text-3xl text-accent">Seguimiento</h1>
        <p className="text-sm text-muted mt-1">
          {fmtDate(today)} · {totalTickets} ticket{totalTickets !== 1 ? "s" : ""} requieren atención
          {" · "}{byOwner.length} responsable{byOwner.length !== 1 ? "s" : ""}
        </p>
      </div>

      {totalTickets === 0 ? (
        <div className="bg-surface border border-brugaligreen rounded-xl p-8 text-center">
          <div className="text-brugaligreen text-3xl mb-2">✓</div>
          <div className="font-semibold text-brugaligreen">Todo al día — sin tickets que requieran seguimiento.</div>
        </div>
      ) : (
        <div className="space-y-6">
          {byOwner.map((owner) => (
            <div key={owner.ownerId ?? "sin"} className="bg-surface border border-border rounded-xl overflow-hidden">
              {/* Owner header */}
              <div className="bg-surface2 px-6 py-4 flex flex-wrap items-center justify-between gap-3 border-b border-border">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-accent/10 text-accent flex items-center justify-center font-bold text-sm">
                    {owner.ownerName.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="font-semibold text-base">{owner.ownerName}</div>
                    <div className="text-xs text-muted">
                      {owner.tickets.length} ticket{owner.tickets.length !== 1 ? "s" : ""} para destrabar
                    </div>
                  </div>
                </div>
                <div className="flex gap-3 text-xs">
                  {owner.vencidos > 0 && (
                    <span className="bg-brugalired/10 text-brugalired px-3 py-1 rounded-full font-mono font-semibold">
                      {owner.vencidos} vencido{owner.vencidos !== 1 ? "s" : ""}
                    </span>
                  )}
                  {owner.sinRespuesta > 0 && (
                    <span className="bg-brugaliamber/10 text-brugaliamber px-3 py-1 rounded-full font-mono font-semibold">
                      {owner.sinRespuesta} sin respuesta
                    </span>
                  )}
                  {owner.estancados > 0 && (
                    <span className="bg-brugaliorange/10 text-brugaliorange px-3 py-1 rounded-full font-mono font-semibold">
                      {owner.estancados} estancado{owner.estancados !== 1 ? "s" : ""}
                    </span>
                  )}
                </div>
              </div>

              {/* Tickets */}
              <div className="divide-y divide-border">
                {owner.tickets.map(({ ticket: t, reasons }) => (
                  <div key={t.id} className="px-6 py-3 flex flex-wrap items-start justify-between gap-3">
                    <div className="flex flex-col gap-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <a
                          href={t.hubspotUrl}
                          target="_blank"
                          rel="noopener"
                          className="font-medium text-sm text-accent underline decoration-dotted hover:text-brugaliorange"
                        >
                          {t.subject}
                        </a>
                        <span className="text-xs text-muted">{t.pipelineName}</span>
                        {t.branch && (
                          <span className="text-xs bg-surface2 text-muted px-2 py-0.5 rounded-full">{t.branch}</span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {reasons.map((r) => reasonTag(r))}
                        <span className="text-xs text-dim ml-1">
                          Etapa: {t.stageLabel} · Ingresó {fmtDate(t.createdAt)}
                          {t.dueDate && ` · Vence ${fmtDate(t.dueDate)}`}
                        </span>
                      </div>
                    </div>
                    <a
                      href={t.hubspotUrl}
                      target="_blank"
                      rel="noopener"
                      className="text-xs text-accent border border-accent/30 hover:bg-accent hover:text-white px-3 py-1.5 rounded-full transition-colors shrink-0"
                    >
                      Ver en HubSpot →
                    </a>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
