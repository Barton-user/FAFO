import type { AppState, Person, SavedLocation, Routine, Task } from "./types";

const now = Date.now();

const self: Person = {
  id: "person-self",
  name: "Yo",
  emoji: "\u{1F913}",
  color: "#7BC4A8",
  isSelf: true,
  createdAt: now,
};

const family: Person = {
  id: "person-family",
  name: "Familia",
  emoji: "\u{1F46A}",
  color: "#DBA85A",
  createdAt: now,
};

const home: SavedLocation = {
  id: "loc-home",
  name: "Casa",
  emoji: "\u{1F3E0}",
  coords: { lat: -34.6037, lng: -58.3816 },
  radiusMeters: 120,
  isMock: true,
};

const office: SavedLocation = {
  id: "loc-office",
  name: "Oficina",
  emoji: "\u{1F4BC}",
  coords: { lat: -34.6, lng: -58.38 },
  radiusMeters: 100,
  isMock: true,
};

const gym: SavedLocation = {
  id: "loc-gym",
  name: "Gimnasio",
  emoji: "\u{1F3CB}",
  coords: { lat: -34.605, lng: -58.385 },
  radiusMeters: 80,
  isMock: true,
};

const morningRoutine: Routine = {
  id: "rt-morning",
  name: "Manana productiva",
  color: "#90CDE0",
  weekdays: [1, 2, 3, 4, 5],
  startHour: 8,
  endHour: 12,
  locationId: "loc-office",
  createdAt: now,
};

const weekendRoutine: Routine = {
  id: "rt-weekend",
  name: "Sabado en casa",
  color: "#F4B884",
  weekdays: [6],
  startHour: 8,
  endHour: 12,
  locationId: "loc-home",
  createdAt: now,
};

const sampleTasks: Task[] = [
  {
    id: "t-1",
    name: "Revisar emails criticos",
    priority: 1,
    done: false,
    weekdays: [1, 2, 3, 4, 5],
    startHour: 8,
    endHour: 9,
    routineId: "rt-morning",
    locationId: "loc-office",
    createdAt: now,
  },
  {
    id: "t-2",
    name: "Deep work bloque #1",
    priority: 2,
    done: false,
    weekdays: [1, 2, 3, 4, 5],
    startHour: 9,
    endHour: 11,
    routineId: "rt-morning",
    locationId: "loc-office",
    createdAt: now,
  },
  {
    id: "t-3",
    name: "Cortar el pasto",
    priority: 2,
    done: false,
    weekdays: [6],
    startHour: 9,
    endHour: 11,
    routineId: "rt-weekend",
    locationId: "loc-home",
    createdAt: now,
  },
  {
    id: "t-4",
    name: "Llamar al medico",
    priority: 0,
    done: false,
    weekdays: [0, 1, 2, 3, 4, 5, 6],
    startHour: 0,
    endHour: 24,
    isVital: true,
    createdAt: now,
  },
];

export const SEED_STATE: AppState = {
  tasks: sampleTasks,
  routines: [morningRoutine, weekendRoutine],
  people: [self, family],
  locations: [home, office, gym],
  dailyLogs: [],
  dailyGoal: 5,
  currentLocationId: "loc-home",
  useRealGps: false,
  xp: 0,
  longestStreak: 0,
  theme: "light",
};
