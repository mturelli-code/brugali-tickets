import "./globals.css";
import Nav from "@/components/Nav";

export const metadata = {
  title: "Brugali · Tickets Review",
  description: "Dashboard de tickets HubSpot - Brugali Service Desk",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head>
        <link
          rel="preconnect"
          href="https://fonts.googleapis.com"
        />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Fraunces:wght@400;600;700&family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@300;400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
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
