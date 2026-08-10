"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const OPS_LINKS = [
  { href: "/operativo", label: "Operativo" },
  { href: "/alertas", label: "Seguimiento" },
];

export default function Nav() {
  const pathname = usePathname() || "/";
  const isDireccion = pathname.startsWith("/direccion");

  // Vista Dirección: encabezado autónomo con dos hojas (Métricas · Agentes),
  // sin las pestañas operativas (pensado como enlace para enviar a dirección/gerencia).
  if (isDireccion) {
    const isAgentes = pathname.startsWith("/direccion/agentes");
    const isTiempos = pathname.startsWith("/direccion/tiempos");
    const DIR_TABS = [
      { href: "/direccion", label: "Resumen", active: !isAgentes && !isTiempos },
      { href: "/direccion/tiempos", label: "Tiempos y SLA", active: isTiempos },
      { href: "/direccion/agentes", label: "Agentes", active: isAgentes },
    ];
    return (
      <header className="bg-surface border-b border-border">
        <div className="max-w-7xl mx-auto px-6 py-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-4">
            <span className="font-serif font-bold text-xl text-accent">Brugali</span>
            <span className="text-border">|</span>
            <span className="text-xs uppercase tracking-widest text-dim font-medium">
              Reporte para Dirección
            </span>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <nav className="flex items-center gap-2">
              {DIR_TABS.map((t) => (
                <Link
                  key={t.href}
                  href={t.href}
                  className={`px-3 py-1 rounded-full hover:bg-surface2 font-medium ${t.active ? "bg-surface2 text-accent" : "text-text"}`}
                >
                  {t.label}
                </Link>
              ))}
            </nav>
            <span className="text-border">|</span>
            <Link href="/operativo" className="text-xs text-muted hover:text-accent transition-colors">
              Ir a gestión operativa →
            </Link>
          </div>
        </div>
      </header>
    );
  }

  return (
    <header className="bg-surface border-b border-border">
      <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <span className="font-serif font-bold text-xl text-accent">Brugali</span>
          <span className="text-border">|</span>
          <span className="text-xs uppercase tracking-widest text-dim font-medium">
            Gestión operativa
          </span>
        </div>
        <nav className="flex items-center gap-4 text-sm">
          {OPS_LINKS.map((l) => {
            const active = pathname === l.href;
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`px-3 py-1 rounded-full hover:bg-surface2 font-medium ${active ? "bg-surface2 text-accent" : "text-text"}`}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
