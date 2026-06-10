"use client";
import { useState, useEffect } from "react";

export default function LastUpdate({ fetchedAt }: { fetchedAt: string }) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(id);
  }, []);

  const fetched = new Date(fetchedAt);
  const diffSec = Math.max(0, Math.floor((now.getTime() - fetched.getTime()) / 1000));

  let txt: string;
  let toneClass = "text-muted";
  if (diffSec < 60) {
    txt = "hace segundos";
  } else if (diffSec < 3600) {
    const m = Math.floor(diffSec / 60);
    txt = `hace ${m} ${m === 1 ? "minuto" : "minutos"}`;
  } else if (diffSec < 86400) {
    const h = Math.floor(diffSec / 3600);
    txt = `hace ${h} ${h === 1 ? "hora" : "horas"}`;
    toneClass = "text-brugaliamber";
  } else {
    const d = Math.floor(diffSec / 86400);
    txt = `hace ${d} ${d === 1 ? "día" : "días"}`;
    toneClass = "text-brugalired";
  }

  const horaTxt = fetched.toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Argentina/Cordoba",
  });
  const fechaTxt = fetched.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "short",
    timeZone: "America/Argentina/Cordoba",
  });

  return (
    <div className={`inline-flex items-center gap-1.5 text-[11px] ${toneClass}`}>
      <span className="inline-block w-1.5 h-1.5 rounded-full bg-current opacity-60" />
      <span>
        Datos actualizados <strong>{txt}</strong>
      </span>
      <span className="text-dim">
        ({fechaTxt} · {horaTxt} ARG)
      </span>
    </div>
  );
}
