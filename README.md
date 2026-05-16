# FAFO — Fuck Around and Find Out

Productividad contextual gamificada. Las tareas solo aparecen si se cumple el
contexto correcto: **día de la semana + rango horario + ubicación (geofence)**.
Si fafosteás, la app se encarga de hacértelo saber.

> "The more you fuck around, the more you find out."

## Stack

- **Next.js 14** (App Router) + **TypeScript**
- **TailwindCSS** para estilos
- **Zustand** + `localStorage` para persistencia (sin backend, sin auth)
- **Geolocation API** del navegador + geofencing por haversine
- **Notification API** para alertas locales de productividad

Todo corre 100% en el cliente. Cero backend, cero cuentas. Es ideal para Vercel
porque es un build estático/SSR liviano.

## Features implementados

### Motor contextual
- Cada tarea define `weekdays + startHour + endHour + locationId`.
- El calendario solo renderiza la tarea si el contexto actual la satisface.
- Tareas **Vitales (priority 0)** ignoran rutina/ubicación y pulsan en rojo.
- Geofencing por haversine — la ubicación activa se resuelve por el círculo
  más cercano dentro del radio configurado.
- Toggle GPS real ↔ mock (Casa / Oficina / Gimnasio / lo que agregues).

### Calendario interactivo
- **Eje Y**: horas (06h–24h, snap a 15min).
- **Eje X**: columnas dinámicas por persona — si hoy nadie más tiene tareas,
  una sola columna; si hay 3 personas con actividad, 4 columnas paralelas.
- **Drag-to-create**: mantenés el dedo/mouse y dibujás el bloque de tiempo.
  Al soltar, se abre el pop-up minimalista.
- Rutinas como bloques con color al 25% de opacidad.
- Indicador "ahora" en rojo.

### Pop-up minimalista
- Solo lo esencial: **nombre, prioridad, rutina, ubicación, días, asignado a**.
- Click en tarea → editar. Doble click → marcarla hecha.

### Gamificación
- Avatar que evoluciona en 6 tiers (rookie → grinder → nerd → savant → super → legend).
- XP por prioridad (vital=50, high=25, normal=12, low=5).
- Streak diario (días consecutivos cumpliendo la meta).
- Métricas: hoy / semana / mes / año.
- Toasts contextuales: te avisa si cumpliste la meta o si estás fafosteando
  (después de las 18h sin cumplir).

### Shadow profiles
- Personas sin cuenta. Les asignás rutinas y tareas para ver su contexto en
  paralelo a tu calendario.

## Estructura

```
src/
  app/
    layout.tsx      # Root layout + metadata
    page.tsx        # Home — orquesta calendario, modales y toaster
    globals.css     # Tailwind + variables CSS
  components/
    Avatar.tsx              # Avatar evolutivo
    Calendar.tsx            # Grid contextual con drag-to-create
    NotificationToaster.tsx # Toasts + Notification API
    SettingsDrawer.tsx      # Tabs: resumen, rutinas, personas, lugares, ajustes
    StatusBar.tsx           # Header con selector de ubicación
    TaskModal.tsx           # Pop-up minimalista de tarea
  lib/
    types.ts            # Domain types
    seed.ts             # Estado inicial (con datos de ejemplo)
    store.ts            # Zustand store + selectors
    geo.ts              # Haversine + geofence resolver
    useGeolocation.ts   # Hook para GPS del navegador
    useNow.ts           # Tick periódico + flag de mount
    context.ts          # useResolvedContext: ahora + GPS → contexto
```

## Correr localmente

```bash
npm install
npm run dev
```

Abrir [http://localhost:3000](http://localhost:3000).

## Deploy a Vercel

1. Pushear este repo a GitHub/GitLab/Bitbucket.
2. En [vercel.com](https://vercel.com) → **Add New Project** → seleccionar el
   repo. Vercel detecta Next.js automáticamente y no necesita configuración.
3. Click en **Deploy**. En 1–2 minutos tenés la URL.

Alternativa CLI:
```bash
npm i -g vercel
vercel
```

## Roadmap (para una v0.2)

- Backend real con Supabase/Postgres para sincronizar entre dispositivos.
- Auth por email/Google.
- Recompensas monetarias reales (NUNCA membresías de por vida) financiadas por
  suscripciones.
- Service worker + background geolocation real (requiere PWA wrapper o app
  nativa para ser eficiente con la batería).
- Bloqueo activo del UI cuando hay una tarea Vital sin resolver.
- Ranking entre usuarios opt-in.
