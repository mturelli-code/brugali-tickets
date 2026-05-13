# Brugali Tickets · Dashboard live

Dashboard web que consulta HubSpot Service Hub en vivo y muestra dos vistas del estado de tickets de Brugali: una **ejecutiva** (gerencia) y una **operativa** (responsables de área).

- **Vista ejecutiva** (`/`): KPIs Q2, tendencia semanal, top áreas y sucursales, heatmap sucursal × área, tiempo promedio de resolución, alertas Calidad.
- **Vista operativa** (`/operativo`): detalle por área con breakdown por motivo y listado completo de demorados linkeados a HubSpot, tabla cross-sucursal con % cierre, demorados y última actualización.

Stack: Next.js 14 + TypeScript + Tailwind CSS + Recharts. Datos cacheados 10 minutos server-side.

---

## Deploy paso a paso (10 minutos)

### 1. Subir el proyecto a GitHub

1. Andá a [github.com/new](https://github.com/new).
2. **Repository name**: `brugali-tickets`. **Privado**.
3. NO marques "Initialize with README". Apretá **Create repository**.
4. GitHub te muestra instrucciones. Copiá la URL HTTPS (algo como `https://github.com/melania-brugali/brugali-tickets.git`).

Ahora subí los archivos. Hay dos caminos:

**Opción A — GitHub Desktop** (más fácil si nunca usaste git):

1. Descargá [GitHub Desktop](https://desktop.github.com/) e iniciá sesión.
2. **File** → **Add Local Repository** → seleccioná esta carpeta `brugali-tickets`.
3. Te va a decir que no es un repo git. Apretá **Create a repository here instead**.
4. **Publish repository** arriba → elegí Private → **Publish**.
5. Listo, tu código ya está en GitHub.

**Opción B — Línea de comandos** (si te animás):

```bash
cd "C:\Users\melit\OneDrive\Escritorio\Archivos Claude\brugali-tickets"
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin <URL_HTTPS_QUE_COPIASTE>
git push -u origin main
```

### 2. Deploy a Vercel

1. Andá a [vercel.com/new](https://vercel.com/new).
2. **Import Git Repository**: buscá tu repo `brugali-tickets` y apretá **Import**.
3. **Framework Preset**: Vercel detecta automáticamente Next.js. Dejalo así.
4. **Environment Variables** — esto es clave:
   - Name: `HUBSPOT_TOKEN`
   - Value: pegá el token de la Service Key de HubSpot (empieza con `pat-na1-...` o similar).
   - Apretá **Add**.
5. Apretá **Deploy**.
6. Esperá 1-2 min mientras Vercel construye y publica. Te va a dar una URL del estilo `https://brugali-tickets.vercel.app`.

### 3. Compartir el link

La URL que te dio Vercel es pública. Compartila con los responsables de área. Cualquiera que la abra ve los datos live (con cache de 10 min para no spammear la API).

---

## Probar localmente antes de deploy (opcional)

Si tenés Node.js instalado:

```bash
cd brugali-tickets
cp .env.local.example .env.local
# Editá .env.local y poné tu HUBSPOT_TOKEN
npm install
npm run dev
```

Abrí http://localhost:3000.

---

## Personalización

- **Colores de marca**: en `tailwind.config.ts`, sección `colors`.
- **Stages cerrado / no corresponde**: en `lib/hubspot.ts`, constantes `CLOSED_STAGES` y `NO_CORRESPONDE_STAGES`.
- **Umbral de demora**: en `lib/hubspot.ts`, constante `DEMORA_DAYS` (default 7).
- **Pipelines incluidos**: en `lib/hubspot.ts`, mapa `PIPELINES` y `PIPELINE_ORDER`.
- **Inicio del trimestre**: en `lib/hubspot.ts`, constante `Q2_START_MS`.

---

## Cómo agregar autenticación más adelante

Si querés que la URL pida login (Google de Brugali) en lugar de ser pública:

1. Instalar `next-auth`: `npm install next-auth`.
2. Crear `app/api/auth/[...nextauth]/route.ts` con el provider de Google.
3. Configurar `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET` en Vercel (los obtenés en Google Cloud Console).
4. Restringir el dominio a `@brugali.com.ar` en el callback de auth.

Te puedo guiar si querés hacerlo después.
