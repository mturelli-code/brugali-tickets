import Link from "next/link";

export default function Nav() {
  return (
    <header className="bg-surface border-b border-border">
      <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <span className="font-serif font-bold text-xl text-accent">Brugali</span>
          <span className="text-border">|</span>
          <span className="text-xs uppercase tracking-widest text-dim font-medium">
            Service Desk Review
          </span>
        </div>
        <nav className="flex gap-4 text-sm">
          <Link href="/" className="px-3 py-1 rounded-full hover:bg-surface2 text-text font-medium">
            Ejecutivo
          </Link>
          <Link href="/operativo" className="px-3 py-1 rounded-full hover:bg-surface2 text-text font-medium">
            Operativo
          </Link>
          <Link href="/alertas" className="px-3 py-1 rounded-full hover:bg-surface2 text-text font-medium">
            Seguimiento
          </Link>
        </nav>
      </div>
    </header>
  );
}
