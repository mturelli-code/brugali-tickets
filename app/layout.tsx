import "./globals.css";
import Nav from "@/components/Nav";

export const metadata = {
  title: "Brugali · Tickets Review",
  description: "Dashboard de tickets HubSpot - Brugali Service Desk",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="min-h-screen bg-bg text-text">
        <Nav />
        <main className="max-w-7xl mx-auto px-6 py-8">{children}</main>
        <footer className="text-center text-xs text-dim py-6 border-t border-border mt-12">
          Brugali · Service Desk Review · datos live desde HubSpot (cache 10 min)
        </footer>
      </body>
    </html>
  );
}
