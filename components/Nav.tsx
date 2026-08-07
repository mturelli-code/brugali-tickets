"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const OPS_LINKS = [
  { href: "/operativo", label: "Operativo" },
  { href: "/alertas", label: "Seguimiento" },
  { href: "/agentes", label: "Agentes" },
];

export default function Nav() {
  const pathname = usePathname() || "/";
  const isDireccion = pathname.startsWith("/direccion");

  // Vista Dirección: encabezado autónomo, sin las pestañas operativas
  // (pensado como enlace para enviar a dirección/gerencia).
  if (isDireccion) {
    return (
      <header className="bg-surface border-b border-border">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span className="font-serif font-bold text-xl text-accent">Brugali</span>
            <span className="text-border">|</span>
            <span className="text-xs uppercase tracking-widest text-dim font-medium">
              Reporte para Dirección
            </span>
          </div>
          <Link href="/operativo" className="text-xs text-muted hover:text-accent transition-colors">
            Ir a gestión operativa →
          </Link>
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
          <span className="text-border">|</span>
          <Link
            href="/direccion"
            className="px-3 py-1 rounded-full border border-accent/40 text-accent hover:bg-accent hover:text-white font-medium transition-colors"
          >
            Dirección →
          </Link>
        </nav>
      </div>
    </header>
  );
}
