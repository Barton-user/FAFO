-- =============================================================================
-- FAFO — Supabase Schema
-- =============================================================================
-- Ejecutar en Supabase SQL Editor (Project → SQL Editor → New query).
-- Crea las tablas necesarias para sincronizar el estado de FAFO con un backend.
-- Incluye Row Level Security para que cada usuario solo vea su propia data.

-- --------- 1. EXTENSIONES ---------
create extension if not exists "pgcrypto";

-- --------- 2. TABLA: people (vos + shadow profiles) ---------
create table if not exists public.people (
  id           text         primary key,
  user_id      uuid         not null references auth.users(id) on delete cascade,
  name         text         not null,
  emoji        text         not null default '🙂',
  color        text         not null default '#7BC4A8',
  is_self      boolean      not null default false,
  created_at   timestamptz  not null default now(),
  updated_at   timestamptz  not null default now()
);
create index if not exists people_user_idx on public.people(user_id);

-- --------- 3. TABLA: locations (geofences) ---------
create table if not exists public.locations (
  id             text             primary key,
  user_id        uuid             not null references auth.users(id) on delete cascade,
  name           text             not null,
  emoji          text             not null default '📍',
  lat            double precision not null,
  lng            double precision not null,
  radius_meters  integer          not null default 100,
  is_mock        boolean          not null default false,
  created_at     timestamptz      not null default now(),
  updated_at     timestamptz      not null default now()
);
create index if not exists locations_user_idx on public.locations(user_id);

-- --------- 4. TABLA: routines ---------
create table if not exists public.routines (
  id           text          primary key,
  user_id      uuid          not null references auth.users(id) on delete cascade,
  name         text          not null,
  color        text          not null default '#90CDE0',
  weekdays     smallint[]    not null default '{}',
  start_hour   numeric(5,2)  not null default 9,
  end_hour     numeric(5,2)  not null default 17,
  location_id  text          references public.locations(id) on delete set null,
  person_id    text          references public.people(id)    on delete set null,
  created_at   timestamptz   not null default now(),
  updated_at   timestamptz   not null default now()
);
create index if not exists routines_user_idx     on public.routines(user_id);
create index if not exists routines_person_idx   on public.routines(person_id);
create index if not exists routines_location_idx on public.routines(location_id);

-- --------- 5. TABLA: tasks ---------
create table if not exists public.tasks (
  id                     text          primary key,
  user_id                uuid          not null references auth.users(id) on delete cascade,
  name                   text          not null,
  notes                  text,
  priority               smallint      not null default 2 check (priority between 0 and 3),
  done                   boolean       not null default false,
  weekdays               smallint[]    not null default '{}',
  start_hour             numeric(5,2)  not null default 9,
  end_hour               numeric(5,2)  not null default 10,
  routine_id             text          references public.routines(id)  on delete set null,
  location_id            text          references public.locations(id) on delete set null,
  person_id              text          references public.people(id)    on delete set null,
  is_vital               boolean       not null default false,
  flexible               boolean       not null default false,
  recurring_in_routine   boolean       not null default false,
  sort_index             integer       not null default 0,
  completed_at           timestamptz,
  created_at             timestamptz   not null default now(),
  updated_at             timestamptz   not null default now()
);
-- ALTER si la tabla ya existia sin la columna nueva
alter table public.tasks
  add column if not exists recurring_in_routine boolean not null default false;
create index if not exists tasks_user_idx     on public.tasks(user_id);
create index if not exists tasks_routine_idx  on public.tasks(routine_id);
create index if not exists tasks_person_idx   on public.tasks(person_id);
create index if not exists tasks_location_idx on public.tasks(location_id);

-- --------- 6. TABLA: daily_logs (historial de productividad) ---------
create table if not exists public.daily_logs (
  id          uuid         primary key default gen_random_uuid(),
  user_id     uuid         not null references auth.users(id) on delete cascade,
  date        date         not null,
  completed   integer      not null default 0,
  total       integer      not null default 0,
  hit_goal    boolean      not null default false,
  created_at  timestamptz  not null default now(),
  unique (user_id, date)
);
create index if not exists daily_logs_user_date_idx on public.daily_logs(user_id, date);

-- --------- 7. TABLA: user_settings (preferencias UI + gamification) ---------
create table if not exists public.user_settings (
  user_id              uuid          primary key references auth.users(id) on delete cascade,
  daily_goal           integer       not null default 5,
  current_location_id  text          references public.locations(id) on delete set null,
  use_real_gps         boolean       not null default false,
  theme                text          not null default 'light' check (theme in ('light','dark')),
  xp                   integer       not null default 0,
  longest_streak       integer       not null default 0,
  updated_at           timestamptz   not null default now()
);

-- --------- 8. TRIGGER: tocar updated_at en cada UPDATE ---------
create or replace function public.fafo_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists fafo_touch_people    on public.people;
create trigger fafo_touch_people    before update on public.people
  for each row execute function public.fafo_touch_updated_at();

drop trigger if exists fafo_touch_locations on public.locations;
create trigger fafo_touch_locations before update on public.locations
  for each row execute function public.fafo_touch_updated_at();

drop trigger if exists fafo_touch_routines  on public.routines;
create trigger fafo_touch_routines  before update on public.routines
  for each row execute function public.fafo_touch_updated_at();

drop trigger if exists fafo_touch_tasks     on public.tasks;
create trigger fafo_touch_tasks     before update on public.tasks
  for each row execute function public.fafo_touch_updated_at();

drop trigger if exists fafo_touch_settings  on public.user_settings;
create trigger fafo_touch_settings  before update on public.user_settings
  for each row execute function public.fafo_touch_updated_at();

-- --------- 9. ROW LEVEL SECURITY ---------
alter table public.people        enable row level security;
alter table public.locations     enable row level security;
alter table public.routines      enable row level security;
alter table public.tasks         enable row level security;
alter table public.daily_logs    enable row level security;
alter table public.user_settings enable row level security;

do $$
declare tbl text;
begin
  for tbl in select unnest(array[
    'people','locations','routines','tasks','daily_logs','user_settings'
  ]) loop
    execute format('drop policy if exists fafo_select on public.%I', tbl);
    execute format(
      'create policy fafo_select on public.%I for select using (auth.uid() = user_id)',
      tbl
    );

    execute format('drop policy if exists fafo_insert on public.%I', tbl);
    execute format(
      'create policy fafo_insert on public.%I for insert with check (auth.uid() = user_id)',
      tbl
    );

    execute format('drop policy if exists fafo_update on public.%I', tbl);
    execute format(
      'create policy fafo_update on public.%I for update using (auth.uid() = user_id) with check (auth.uid() = user_id)',
      tbl
    );

    execute format('drop policy if exists fafo_delete on public.%I', tbl);
    execute format(
      'create policy fafo_delete on public.%I for delete using (auth.uid() = user_id)',
      tbl
    );
  end loop;
end $$;

-- --------- 10. BOOTSTRAP: crear "Yo" + settings al registrarse ---------
create or replace function public.fafo_bootstrap_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.user_settings (user_id) values (new.id)
    on conflict (user_id) do nothing;
  insert into public.people (id, user_id, name, emoji, color, is_self)
  values (
    'self-' || new.id::text,
    new.id,
    coalesce(new.raw_user_meta_data->>'name', 'Yo'),
    '🤓',
    '#7BC4A8',
    true
  ) on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists fafo_on_signup on auth.users;
create trigger fafo_on_signup
  after insert on auth.users
  for each row execute function public.fafo_bootstrap_user();
