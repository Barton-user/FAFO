// Date helpers — usamos strings YYYY-MM-DD para la "selectedDate"
// y Date objects solo cuando hace falta computar.

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function parseISO(iso: string): Date {
  // Forzamos local time (no UTC) usando los componentes del string.
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function toISO(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function addDays(iso: string, n: number): string {
  const d = parseISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

export function addMonths(iso: string, n: number): string {
  const d = parseISO(iso);
  d.setMonth(d.getMonth() + n);
  return toISO(d);
}

/** Lunes de la semana en que cae `iso` (week starts Monday). */
export function startOfWeek(iso: string): string {
  const d = parseISO(iso);
  const day = d.getDay(); // 0=Sun, 1=Mon, ...
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return toISO(d);
}

/** Primer dia del mes. */
export function startOfMonth(iso: string): string {
  const d = parseISO(iso);
  d.setDate(1);
  return toISO(d);
}

/** Dias del mes ajustando para que la grid empiece en lunes y tenga 42 celdas. */
export function monthGridDays(iso: string): string[] {
  const first = parseISO(startOfMonth(iso));
  // Backtrack al lunes anterior si hace falta.
  const dow = first.getDay();
  const back = dow === 0 ? 6 : dow - 1;
  first.setDate(first.getDate() - back);
  const cells: string[] = [];
  for (let i = 0; i < 42; i++) {
    cells.push(toISO(first));
    first.setDate(first.getDate() + 1);
  }
  return cells;
}

export function isSameMonth(a: string, b: string): boolean {
  return a.slice(0, 7) === b.slice(0, 7);
}

const MONTHS = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

const WEEKDAYS_SHORT = ["Dom", "Lun", "Mar", "Mie", "Jue", "Vie", "Sab"];
const WEEKDAYS_FULL = [
  "Domingo",
  "Lunes",
  "Martes",
  "Miercoles",
  "Jueves",
  "Viernes",
  "Sabado",
];

export function formatDateLong(iso: string): string {
  const d = parseISO(iso);
  return `${WEEKDAYS_FULL[d.getDay()]} ${d.getDate()} de ${MONTHS[d.getMonth()]}`;
}

export function formatDateShort(iso: string): string {
  const d = parseISO(iso);
  return `${WEEKDAYS_SHORT[d.getDay()]} ${d.getDate()}`;
}

export function formatMonth(iso: string): string {
  const d = parseISO(iso);
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export function formatWeekRange(iso: string): string {
  const start = parseISO(startOfWeek(iso));
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const sameMonth = start.getMonth() === end.getMonth();
  if (sameMonth) {
    return `${start.getDate()} – ${end.getDate()} ${MONTHS[end.getMonth()]}`;
  }
  return `${start.getDate()} ${MONTHS[start.getMonth()]} – ${end.getDate()} ${MONTHS[end.getMonth()]}`;
}

export { MONTHS, WEEKDAYS_SHORT, WEEKDAYS_FULL };
