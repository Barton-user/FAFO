# FAFO — Estado del proyecto

> **FAFO** (Fuck Around and Find Out) — productividad contextual gamificada.
> The more you fuck around, the more you find out.

Este archivo es el "manual del proyecto" para retomar trabajo entre sesiones o
para que otra persona se ponga al día rápido.

---

## Stack

- **Next.js 14** (App Router) + TypeScript
- **TailwindCSS** con tema basado en CSS variables (RGB triplets para soportar
  opacidad de Tailwind) → habilita light/dark dinámico.
- **Zustand** para estado en runtime. Persistencia primaria en **Supabase**
  (RLS por user_id); `localStorage` queda como fallback de hidratación inicial
  y como origen de la migración one-shot al primer login.
- **Supabase** completamente integrado: Auth (email + password + reset por
  link), DB con RLS, mutations sincronizadas en background (`bg()` wrapper +
  `syncStore` para indicador de pending + toast de error).
- **Geolocation API** + haversine para geofencing.
- **HTML5 Drag & Drop** para reordenar tareas (incluye cross-day en TodoPanel).
- **PWA básica** (manifest + standalone display, sin service worker todavía).
- Deploy en **Vercel** (Git push → deploy automático).

---

## Estructura

```
src/
  app/
    layout.tsx                Root + AuthProvider
    page.tsx                  Home — orquesta calendario, panel To-Do, modales
                              (con switch automático a MobileApp en mobile)
    globals.css               Variables CSS (light + dark) + estilos base
    reset-password/page.tsx   Flow de "olvidé mi password" — landing del link
                              de recuperación que manda Supabase por email
  components/
    AuthGate.tsx              Login/signup/recover con Supabase; al login dispara
                              migration (si aplica) + loadAll → hydrate del store
    Avatar.tsx                Tiers gamificados (rookie → legend)
    Calendar.tsx              Día / Semana / Semana+Todos / Mes
                              Incluye TaskBlock, RoutineBlock, FlexibleChip,
                              PlacedFlexBlock, WeekViewAll, DayView
                              + helpers: computeFreeIntervals, distributeTasks
                                (reparten flex tasks en huecos libres dentro
                                de una rutina con tareas con horario adentro)
    Fab.tsx                   Botón "+" flotante con menú (nueva tarea/rutina)
    ManagementPanel.tsx       Pantalla de gestión (administración general)
    MobileApp.tsx             Vista mobile minimalista tipo Microsoft To Do —
                              "Mi día" agrupado por rutina + "Otras tareas"
                              orphan, quick-add inline, FAB para nueva tarea
    NotificationToaster.tsx   Toasts + Notification API + toasts de sync error
    SearchModal.tsx           Modal de búsqueda global (Cmd+K) sobre tareas y
                              rutinas
    SettingsDrawer.tsx        Tabs: Resumen, Rutinas, Personas, Lugares, Ajustes
                              Editor de rutinas con tareas internas + drag
                              reorder + validación de horas/días + preview
                              de cuándo aplica + contador de tareas por rutina
    StatusBar.tsx             Header + view switcher + date nav + status del día
                              (done/total + barra dual verde-rojo + goal +
                              indicador de sync + métricas por mes/semana/año)
    TaskModal.tsx             Crear/editar tarea (con "sin horario fijo",
                              prioridad 0-5, duración)
    TodoPanel.tsx             Panel lateral derecho con flex tasks
                              (quick-add con rutina, drag reorder, cross-day
                              drag, agrupado por día y rutina)
  lib/
    api.ts                    CRUD tipado contra Supabase por entidad
                              (people, locations, routines, tasks,
                              user_settings, daily_logs) + loadAll()
                              que devuelve snapshot completo
    auth.tsx                  AuthContext + useAuth (signIn / signUp /
                              signOut / resetPassword)
    context.ts                useResolvedContext (now + GPS → contexto)
    dateUtils.ts              Helpers de fecha (ISO, semana, mes, formatos)
    flexPlacement.ts          Auto-ubica flex tasks en huecos del día (a nivel
                              de timeline, fuera de rutinas)
    geo.ts                    Haversine + geofence resolver
    migration.ts              One-shot: detecta data en localStorage al primer
                              login y la pushea a Supabase si el usuario remoto
                              está vacío. Regenera IDs y remapea referencias.
    seed.ts                   Estado inicial demo
    store.ts                  Zustand store. Cada mutation espeja a Supabase
                              vía bg() (track de pending + error en syncStore)
    supabase.ts               Cliente Supabase + isSupabaseConfigured
    syncStore.ts              Track de mutaciones en vuelo: pending count,
                              lastSyncedAt, lastError → consumido por
                              StatusBar (indicador) y NotificationToaster
    taskState.ts              isTaskDoneForDay + toggleDonePatch (lógica de done
                              por día para tareas repetitivas)
    types.ts                  Tipos del dominio (Priority es 0-5)
    useGeolocation.ts         Hook GPS del navegador
    useNow.ts                 Tick periódico + flag de mount
public/
  manifest.json               PWA manifest (standalone display)
  icon.svg                    Ícono PWA
supabase/
  schema.sql                  SQL completo para crear tablas + RLS + bootstrap
```

---

## Modelo de datos

### Task

- `id, name, notes?, priority (0-5), done, completedAt?, duration?`
- **Tiempo**: `weekdays[], startHour, endHour` (días que aplica + horario).
- **Contexto**: `routineId?, locationId?, personId?`
- **Flags**: `isVital?` (priority 0, bypass rutinas/geofences),
  `flexible?` (sin horario fijo, va al panel To-Do o auto-placed),
  `recurringInRoutine?` (dentro de rutina: se rehace cada iteración).

### Routine

- `id, name, color, weekdays[], startHour, endHour, locationId?, personId?`
- Bloque visual de tiempo. Las tareas con `routineId` se anidan adentro
  visualmente (TaskBlock con inset si caen dentro, FlexibleChip si son flex).
- Al crearla, el form defaultea a **todos los días** (`[0..6]`) — el usuario
  destila los que no quiere.

### Person

- `id, name, emoji, color, isSelf?` — "shadow profiles" para planear con
  familia/equipo sin que ellos tengan cuenta.

### SavedLocation

- `id, name, emoji, coords{lat,lng}, radiusMeters, isMock?` — geofences.

### DailyLog

- `date, completed, total, hitGoal` — historial de productividad.

---

## Funcionalidades implementadas

### Motor contextual
- Cada tarea define `weekdays + horario + locationId`. Solo se renderiza si
  el contexto actual matchea.
- Tareas **Vitales** (priority 0) saltan rutina/ubicación y pulsan en rojo.
- Geofencing por haversine con toggle GPS real ↔ mock.
- Selector de ubicación + sin ubicación.

### Vistas del calendario (desktop / tablet)
- **Día**: columnas por persona. La persona enfocada ocupa 90%, las demás 10%.
- **Semana**: 7 días para la persona seleccionada.
- **Semana + Todos** (`viewingPersonId = "__all__"`): cada día se subdivide
  en sub-columnas por persona.
- **Mes**: grilla 6×7 con métricas por día, tap día → vista Día.
- Selector "Viendo: [persona]" en el header, incluye opción "👥 Todos".
- **Time gutter sticky**: la columna de horas queda fija a la izquierda
  cuando scrolleás horizontalmente, pero acompaña el scroll vertical.
- **Headers de día/persona sticky** (z-30) al scrollear vertical;
  TaskBlock se eleva a z-40 cuando se está arrastrando para no quedar tapado.
- **Auto-scroll**: la vista se centra automáticamente en la hora actual
  al cargar.
- Las rutinas con `locationId` se muestran igual en su día (no se filtran
  por GPS); solo las tareas individuales con `locationId` se ocultan si
  no estás en el geofence (consistente entre desktop y mobile).

### Vista mobile ("Mi día" — `MobileApp.tsx`)
- Layout minimalista estilo Microsoft To Do, una sola columna.
- Tareas de hoy agrupadas por rutina, con la rutina como header (color
  + horario), y al final una sección "Otras tareas" para las que no caen
  en ninguna rutina activa hoy.
- Quick-add inline arriba de todo + FAB rosa para tarea con horario.
- Toggle done con check verde + tachado.
- **Drag reorder de tareas**: usa `draggingId` del state local en vez de
  `dataTransfer.getData()` — en Chrome/Safari Android `dataTransfer` no
  se preserva confiablemente entre `dragstart` y `drop`, así que el ID
  de origen se lee del state. Sin esto, el drop en mobile no aplica.
- Settings drawer compartido con desktop.

### Tareas con horario (TaskBlock)
- Drag para mover (snap a 15 min).
- Borde superior → resize del inicio. Borde inferior → resize del final.
- Click → editar. Doble click → marcar hecha.
- Doble click en zona vacía → crea tarea de 1h.
- Anidado automático en rutinas (si los horarios caen adentro al 50%+).
- **Estado visual**: verde si done, rojo si vencida (endHour < ahora).
- Chips compactos en mobile (responsive sizing tipo To Do).

### Rutinas (RoutineBlock)
- Click en chip de nombre → editar.
- Drag chip → mueve rutina (las tareas hijas se mueven con ella).
- Borde superior/inferior → resize.
- × → borrar (confirm).
- Toggle "Día completo" en el editor (00:00 → 24:00).
- Selector de persona en el form.
- Editor de tareas dentro de la rutina con quick-add + drag reorder + toggle
  "Repetitiva / Única".
- Validación: días no vacíos + horas coherentes; preview "esta rutina aplica
  ‹días› a ‹horas› en ‹ubicación›" para evitar crearla mal.
- Contador "tareas/total" visible en la lista de rutinas.
- En la vista de PC, los tintes mobile se aplican por rutina.

### Tareas flexibles (sin horario)
- Checkbox "Sin horario fijo" en el modal.
- **Con routineId**: aparecen como chips dentro del bloque de la rutina.
  Si la rutina tiene también tareas con horario adentro, las flex se
  reparten en los huecos libres entre ellas (no se apilan arriba/abajo).
  Computado con `computeFreeIntervals` + `distributeTasks` en `Calendar.tsx`.
- **Sin routineId**: auto-ubicadas en los huecos libres del día (timeline),
  pintadas con borde punteado para diferenciar.
- **Repetitivas (`recurringInRoutine`)**: se reevalúan por día.
  `isTaskDoneForDay` mira si `completedAt` cae en ese día.
- **Drag cross-rutina y cross-day** (calendario PC): arrastrar un chip
  flex de una rutina y soltarlo sobre otra rutina (área vacía o sobre
  un chip de esa rutina) cambia su `routineId`. Si la nueva rutina es
  en otro día, también se replaza `weekdays` con el weekday del día
  destino (mismo patrón que `TodoPanel`). Implementación:
  `RoutineBlock.handleTaskDrop()` + drop zone en el wrapper que se
  activa solo cuando hay un drag de tarea en curso (detectado vía
  listeners globales `dragstart`/`dragend` con type `text/task-id`),
  para no interferir con el "doble-click crea tarea" del day column
  cuando no se está arrastrando.

### Panel To-Do (toggleable ☑) — desktop
- Quick-add con selector de rutina (hereda los weekdays de la rutina).
- Drag reorder.
- **Cross-day drag**: mover una tarea de un día a otro arrastrándola entre
  columnas del panel.
- Agrupado por rutina dentro de cada día.
- Checkbox + tachado para hechas. Sección "Hechas" al final.
- En vista Semana muestra todos los días con sus pendings.

### Búsqueda global
- `SearchModal` (Cmd+K) busca sobre nombres de tareas y rutinas.

### Gamificación
- Avatar con 6 tiers (rookie → grinder → nerd → savant → super → legend).
- XP por prioridad: vital=50, urgente=35, importante=20, normal=12,
  cuando-puedas=6, algún-día=3.
- Streak diario (días consecutivos cumpliendo dailyGoal).
- Toasts: te avisa cuando cumplís el goal o vas atrasado.

### Status del día (StatusBar)
- "X / Y" → hechas / total para hoy.
- "N⚠" rojo si hay vencidas.
- Barra dual: verde (done) + rojo (overdue) + gris (pending).
- Mini "Goal X/Y" → meta personal configurable.
- **Indicador de sync**: puntito que parpadea cuando hay mutations en vuelo
  hacia Supabase + toast si algo falla.

### UI
- Paleta pastel cálida (cream + rosa + sage mint + dorado).
- Toggle 🌙 / ☀️ para light/dark.
- CSS variables como RGB triplets soportan opacidad de Tailwind
  (ej. `bg-fafo-panel/85`).
- Transiciones suaves entre temas (200ms).
- Glows ambientales sutiles en el fondo.

### Auth (Supabase)
- AuthProvider + useAuth hook.
- AuthGate envuelve la app: si no hay user → login/signup; si hay user →
  corre migration one-shot (si aplica) + loadAll → hydrate.
- Email + password.
- **Reset password**: link "olvidé mi password" en el login manda email con
  link; al hacer click se redirige a `/reset-password` y se detecta el evento
  `PASSWORD_RECOVERY` de Supabase para mostrar el form de nueva password.
- Schema SQL (`supabase/schema.sql`) crea: people, locations, routines,
  tasks, daily_logs, user_settings + triggers updated_at + RLS por user_id
  + bootstrap automático al signup (crea self person + settings).

### Sincronización con Supabase
- Cada mutation en `store.ts` espeja a Supabase vía `bg(label, fn)`:
  trackea `pending` en `syncStore`, captura errores y los empuja al toaster.
- `loadAll()` en `api.ts` arma un `RemoteSnapshot` con todas las entidades
  del usuario; `store.hydrate(snap)` reemplaza el state local.
- `migrateLocalToSupabaseIfEmpty(local)` corre al primer login: si remote
  está vacío (excepto el self auto-creado por el trigger fafo_on_signup)
  y local tiene data, regenera IDs y la sube. No corre si remote ya tiene
  data del usuario.
- **Refetch on focus**: `AuthGate` escucha `visibilitychange` y `focus`;
  cuando la app vuelve a foreground (PWA en background → foreground,
  o cambio de tab), vuelve a llamar `loadAll() → hydrate()`. Sin polling,
  con un flag `inFlight` para no encolar requests. Cubre el caso cross-device
  típico: editar en PC, abrir el celu → el celu se entera al volver a foco.

---

## Falta / Próximos pasos

### Sincronización en tiempo real (Supabase Realtime)
Hoy la sincro es write-through + refetch on focus (ver "Sincronización con
Supabase" arriba). Cubre el 95% de los casos pero la propagación no es
instantánea: si dejás dos devices abiertos simultáneamente, los cambios
no se ven hasta que cambies de foco. Para upgrade:

- **Supabase Realtime**: suscripción a `routines` / `tasks` / `people` /
  `locations` para que el store se actualice vivo. UX "Google-Docs-like"
  pero requiere manejo de conflictos (qué pasa si la mutation local y la
  remota llegan en cualquier orden, qué con el `pending` del syncStore, etc).

### Notificaciones
- Push notifications con service worker (para que lleguen incluso con el
  tab cerrado).
- Recordatorio antes de que una tarea con horario venza.
- Aviso de routine starts.

### Recompensas monetarias
- Modelo de suscripciones por mes.
- Hitos sostenidos (7d / 30d / 90d) → recompensas.
- **NUNCA membresías de por vida** (regla del proyecto).

### Mobile
- Service worker para que la PWA funcione offline (hoy es manifest only).
- Background geolocation eficiente.
- Capacitor o React Native si se requiere notificaciones nativas.

### Mejoras UX pendientes
- (resueltas) Pop-up crear rutina con drag: ahora **Shift + drag** en el
  calendario crea una rutina nueva con esos horarios y abre su editor
  para terminar de configurarla.
- (resuelta) Recompute "now indicator": `useNow` ahora refresca al volver
  al foreground (focus + visibilitychange) y al hacer resize del viewport
  (debounced 200ms). Cubre el caso de tab dormido y de cambio de tamaño.
- (resuelta) Vista mes con flex tasks visibles: muestra hasta 3 items por
  día con orden timed-por-hora primero, después flex por prioridad. Las
  flex se marcan en cursiva con un dot en vez de la hora.
- (resuelta) Navegación de fecha en mobile + botón "Hoy": `MobileApp`
  ahora tiene `selectedDate` con prev/next y un botón "⊙ Hoy" visible
  solo cuando no estás en el día actual. Header muestra "Mi día" /
  "Mañana" / "Ayer" / fecha larga según corresponda.

### Performance
- Memoizar más en Calendar.tsx — los `useMemo` deberían cubrir el caso pero
  Big Picture View (todas las personas + semana) puede ser pesado con muchos
  items.
- Virtualizar grid si la lista de tasks excede ~500.

### Tests
- Cero tests aún. Vitest + React Testing Library para componentes,
  Playwright para e2e.

---

## Comandos útiles

```bash
# Dev local
npm install
npm run dev                    # http://localhost:3000

# Build (prod)
npm run build
npm run start

# Subir cambios a Git → triggers Vercel auto-deploy
git add .
git commit -m "lo que hiciste"
git push

# Conexión Supabase: .env.local con NEXT_PUBLIC_SUPABASE_URL y
# NEXT_PUBLIC_SUPABASE_ANON_KEY. La app muestra un mensaje claro si
# isSupabaseConfigured es false.
```

---

## Decisiones de diseño relevantes

- **IDs como `text`** (no UUID): mantiene compatibilidad con los IDs
  generados localmente (`Math.random()`). La migración al primer login
  regenera los IDs para evitar colisiones entre usuarios.
- **RLS desde el día 0**: cada usuario solo ve su propia data.
- **Write-through online** (no offline-first): cada mutation local dispara
  un round-trip a Supabase en background. El estado en runtime se mantiene
  en Zustand para responsividad.
- **TaskBlock vs RoutineBlock**: dos componentes con drag/resize porque su
  semántica difiere — la rutina arrastra a sus hijos, las tareas no.
- **Flex tasks auto-placement**: dos casos distintos.
  - Fuera de rutina: `lib/flexPlacement.ts` busca huecos en el timeline.
  - Dentro de rutina con scheduled tasks: `computeFreeIntervals` +
    `distributeTasks` (en `Calendar.tsx`) reparten los chips en los huecos
    libres del bloque de rutina, proporcional a la altura de cada hueco.
- **Theme via CSS vars (RGB triplets)**: necesario para que Tailwind soporte
  opacidad con clases dinámicas como `bg-fafo-panel/85` que se adaptan al
  tema activo.
- **Filtro por `locationId` solo a nivel de tarea individual, no de rutina**:
  las rutinas con ubicación atada se muestran igual en su día (vos planeás
  con tu rutina aunque no estés en el lugar). Solo las tareas con su propio
  `locationId` se ocultan fuera del geofence. PC y mobile consistentes.
- **Default de weekdays al crear rutina**: todos los días (`[0..6]`). Antes
  era L-V y sorprendía cuando uno creaba algo "para el finde" — el default
  permisivo no excluye días sin que el usuario lo elija explícitamente.
