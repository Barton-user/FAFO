// FAFO — Core domain types

export type ViewMode = "day" | "week" | "month";

export type Theme = "light" | "dark";

export type Priority = 0 | 1 | 2 | 3;
// 0 = Vital (overrides everything, pulses)
// 1 = High
// 2 = Normal
// 3 = Low

export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6; // Sun..Sat

export interface GeoCoords {
  lat: number;
  lng: number;
}

export interface SavedLocation {
  id: string;
  name: string;
  emoji: string;
  coords: GeoCoords;
  radiusMeters: number; // geofence radius
  isMock?: boolean;
}

export interface Routine {
  id: string;
  name: string;
  color: string; // hex
  weekdays: Weekday[]; // when it applies
  startHour: number; // 0..24 fractional ok
  endHour: number; // 0..24
  locationId?: string; // optional geofence requirement
  personId?: string; // owner of the routine (self if undefined)
  createdAt: number;
}

export interface Task {
  id: string;
  name: string;
  notes?: string;
  priority: Priority;
  done: boolean;
  // scheduling
  weekdays: Weekday[]; // when this task can render
  startHour: number;
  endHour: number;
  // context
  routineId?: string; // hijos de rutina
  locationId?: string; // geofence requirement; undefined = anywhere
  personId?: string; // who it belongs to; undefined = me
  // bookkeeping
  createdAt: number;
  completedAt?: number;
  // vital tasks (priority 0) bypass routines & geofences
  isVital?: boolean;
}

export interface Person {
  id: string;
  name: string;
  emoji: string;
  color: string;
  isSelf?: boolean;
  createdAt: number;
}

export type AvatarTier =
  | "rookie"
  | "grinder"
  | "nerd"
  | "savant"
  | "super"
  | "legend";

export interface ProductivityMetrics {
  // computed snapshots
  todayCompleted: number;
  todayTotal: number;
  weekCompleted: number;
  weekTotal: number;
  monthCompleted: number;
  monthTotal: number;
  yearCompleted: number;
  yearTotal: number;
  currentStreak: number; // consecutive days >= goal
  longestStreak: number;
  xp: number;
}

export interface DailyLog {
  date: string; // YYYY-MM-DD
  completed: number;
  total: number;
  hitGoal: boolean;
}

export interface AppState {
  // entities
  tasks: Task[];
  routines: Routine[];
  people: Person[];
  locations: SavedLocation[];
  dailyLogs: DailyLog[];
  // settings
  dailyGoal: number; // tasks to complete to "hit goal"
  currentLocationId: string | null; // selected mock location (overrides real GPS)
  useRealGps: boolean;
  // gamification
  xp: number;
  longestStreak: number;
  // UI
  theme: Theme;
}
