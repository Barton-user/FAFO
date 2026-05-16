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
- **Zustand** + `localStorage` persist (estado local).
- **Supabase** configurado para auth + DB (backend SQL ya creado, **integración
  cliente pendiente** — ver "Falta").
- **Geolocation API** + haversine para geofencing.
- **HTML5 Drag & Drop** para reordenar tareas.
- Deploy en **Vercel** (Git push → deploy automático).

---

## Estructura

```
src/
  app/
    layout.tsx           Root + AuthProvider
    page.tsx             Home — orquesta calendario, panel To-Do, modales
    globals.css          Variables CSS (light + dark) + estilos base
  components/
    AuthGate.tsx         Login/signup con Supabase (email + password)
    Avatar.tsx           Tiers gamificados (rookie → legend)
    Calendar.tsx         Día / Semana / Semana+Todos / Mes
                         Incluye TaskBlock, RoutineBlock, FlexibleChip,
                         PlacedFlexBlock, WeekViewAll
    Fab.tsx              Botón "+" flotante con menú (nueva tarea/rutina)
    NotificationToaster  Toasts + Notification API
    SettingsDrawer.tsx   Tabs: Resumen, Rutinas, Personas, Lugares, Ajustes
                         Editor de rutinas con tareas internas + drag reorder
    StatusBar.tsx        Header + view switcher + date nav + status del día
                         (done/total + barra dual verde-rojo + goal)
    TaskModal.tsx        Crear/editar tarea (con "sin horario fijo")
    TodoPanel.tsx        Panel lateral derecho con flex tasks
                         (quick-add con rutina, drag reorder, agrupado)
  lib/
    auth.tsx             AuthContext + useAuth
    context.ts           useResolvedContext (now + GPS → contexto)
    dateUtils.ts         Helpers de fecha (ISO, semana, mes, formatos)
    flexPlacement.ts     Auto-ubica flex tasks en huecos del día
    geo.ts               Haversine + geofence resolver
    seed.ts              Estado inicial demo
    store.ts             Zustand store (tasks, routines, people, locations,
                         settings, theme, dailyLogs, xp, streak)
    supabase.ts          Cliente Supabase
    taskState.ts         isTaskDoneForDay + toggleDonePatch (lógica de done
                         por día para tareas repetitivas)
    types.ts             Tipos del dominio
    useGeolocation.ts    Hook GPS del navegador
    useNow.ts            Tick periódico + flag de mount
supabase/
  schema.sql             SQL completo para crear tablas + RLS + bootstrap
```

---

## Modelo de datos

### Task

- `id, name, notes?, priority (0-3), done, completedAt?`
- **Tiempo**: `weekdays[], startHour, endHour` (días que aplica + horario).
- **Contexto**: `routineId?, locationId?, personId?`
- **Flags**: `isVital?` (priority 0, bypass rutinas/geofences),
  `flexible?` (sin horario fijo, va al panel To-Do o auto-placed),
  `recurringInRoutine?` (dentro de rutina: se rehace cada iteración).

### Routine

- `id, name, color, weekdays[], startHour, endHour, locationId?, personId?`
- Bloque visual de tiempo. Las tareas con `routineId` se anidan adentro
  visualmente (TaskBlock con inset si caen dentro, FlexibleChip si son flex).

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

### Vistas del calendario
- **Día**: columnas por persona. La persona enfocada ocupa 90%, las demás 10%.
- **Semana**: 7 días para la persona seleccionada.
- **Semana + Todos** (`viewingPersonId = "__all__"`): cada día se subdivide
  en sub-columnas por persona.
- **Mes**: grilla 6×7, tap día → vista Día.
- Selector "Viendo: [persona]" en el header, incluye opción "👥 Todos".

### Tareas con horario (TaskBlock)
- Drag para mover (snap a 15 min).
- Borde superior → resize del inicio. Borde inferior → resize del final.
- Click → editar. Doble click → marcar hecha.
- Doble click en zona vacía → crea tarea de 1h.
- Anidado automático en rutinas (si los horarios caen adentro al 50%+).
- **Estado visual**: verde si done, rojo si vencida (endHour < ahora).

### Rutinas (RoutineBlock)
- Click en chip de nombre → editar.
- Drag chip → mueve rutina (las tareas hijas se mueven con ella).
- Borde superior/inferior → resize.
- × → borrar (confirm).
- Toggle "Día completo" en el editor (00:00 → 24:00).
- Selector de persona en el form.
- Editor de tareas dentro de la rutina con quick-add + drag reorder + toggle
  "Repetitiva / Única".

### Tareas flexibles (sin horario)
- Checkbox "Sin horario fijo" en el modal.
- **Con routineId**: aparecen como chips dentro del bloque de la rutina,
  draggables para reordenar, con shadow, color verde si done, rojo si la
  rutina venció.
- **Sin routineId**: auto-ubicadas en los huecos libres del día (timeline),
  pintadas con borde punteado para diferenciar.
- **Repetitivas (`recurringInRoutine`)**: se reevalúan por día.
  `isTaskDoneForDay` mira si `completedAt` cae en ese día.

### Panel To-Do (toggleable ☑)
- Quick-add con selector de rutina (hereda los weekdays de la rutina).
- Drag reorder.
- Agrupado por rutina dentro de cada día.
- Checkbox + tachado para hechas. Sección "Hechas" al final.
- En vista Semana muestra todos los días con sus pendings.

### Gamificación
- Avatar con 6 tiers (rookie → grinder → nerd → savant → super → legend).
- XP por prioridad (vital=50, high=25, normal=12, low=5).
- Streak diario (días consecutivos cumpliendo dailyGoal).
- Toasts: te avisa cuando cumplís el goal o vas atrasado.

### Status del día (StatusBar)
- "X / Y" → hechas / total para hoy.
- "N⚠" rojo si hay vencidas.
- Barra dual: verde (done) + rojo (overdue) + gris (pending).
- Mini "Goal X/Y" → meta personal configurable.

### UI
- Paleta pastel cálida (cream + rosa + sage mint + dorado).
- Toggle 🌙 / ☀️ para light/dark.
- CSS variables como RGB triplets soportan opacidad de Tailwind
  (ej. `bg-fafo-panel/85`).
- Transiciones suaves entre temas (200ms).
- Glows ambientales sutiles en el fondo.

### Auth (Supabase)
- AuthProvider + useAuth hook.
- AuthGate que envuelve la app: si no hay user, muestra login/signup.
- Email + password (Supabase Auth default).
- Schema SQL (`supabase/schema.sql`) crea: people, locations, routines,
  tasks, daily_logs, user_settings + triggers updated_at + RLS por user_id
  + bootstrap automático al signup (crea self person + settings).

---

## Falta / Próximos pasos

### Integración cliente Supabase
La parte que **YA está** es: cliente configurado, AuthGate, schema en DB.
**Falta**: reemplazar la persistencia del store (actualmente localStorage)
por sync con Supabase. Plan:

1. `src/lib/api.ts` con CRUD tipado por entidad.
2. En `useFafoStore`: en lugar de `persist()`, cargar data desde Supabase
   al login y enviar mutations a la DB.
3. **Migración**: al primer login, detectar data en localStorage y
   pushearla a Supabase (el usuario eligió "migrar automáticamente").
4. Logout button en StatusBar.

### Notificaciones
- Push notifications con service worker (para que lleguen incluso con el
  tab cerrado).
- Recordatorio antes de que una tarea con horario venza.
- Aviso de routine starts.

### Recompensas monetarias
- Modelo de suscripciones por mes.
- Hitos sostenidos (7d / 30d / 90d) → recompensas.
- **NUNCA membresías de por vida** (regla del proyecto).

### Móvil
- Wrapper PWA + background geolocation eficiente.
- Capacitor o React Native si se requiere notificaciones nativas.

### Mejoras UX pendientes
- Drag tasks BETWEEN días (cross-day reorder) en el panel To-Do.
- Pop-up para crear rutina directamente desde el calendario con drag.
- Recompute "now indicator" cuando cambia el viewport (no solo cada 30s).
- Vista mes con flex tasks visibles (actualmente solo muestra dots).

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

# Conexión Supabase (cuando integremos)
# .env.local ya tiene NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY
```

---

## Decisiones de diseño relevantes

- **IDs como `text`** (no UUID): mantiene compatibilidad con los IDs
  generados localmente (`Math.random()`). No hay que migrar.
- **RLS desde el día 0**: cada usuario solo ve su propia data.
- **Online-only sync** (no offline-first): cuando se complete la integración
  de Supabase, cada acción hace round-trip. Es más simple y suficiente para
  este uso.
- **TaskBlock vs RoutineBlock**: dos componentes con drag/resize porque su
  semántica difiere — la rutina arrastra a sus hijos, las tareas no.
- **Flex tasks auto-placement**: el cálculo de huecos vive en
  `lib/flexPlacement.ts` para mantener Calendar.tsx más simple.
- **Theme via CSS vars (RGB triplets)**: necesario para que Tailwind soporte
  opacidad con clases dinámicas como `bg-fafo-panel/85` que se adaptan al
  tema activo.
