-- ===========================================================================
-- 0001 · Esquema base de la quiniela de la oficina
-- ===========================================================================
-- Dos decisiones que conviene entender antes de leer el resto:
--
-- 1) TODO EL DINERO EN CÉNTIMOS ENTEROS. Nada de `numeric` ni `float` para
--    importes. Un reparto de 12,50 € entre 3 personas tiene que cuadrar al
--    céntimo y sumar exactamente lo repartido; con decimales flotantes eso no
--    se puede garantizar.
--
-- 2) UN JUGADOR NO ES UNA CUENTA. En la Fase 1 el admin sube los boletos de
--    gente que todavía no se ha registrado. Por eso `players` tiene id propio
--    y un `user_id` opcional que se enlaza el día que esa persona entra.
-- ===========================================================================

create extension if not exists pgcrypto;

create type round_estado  as enum ('borrador', 'abierta', 'cerrada', 'en_juego', 'finalizada');
create type match_estado  as enum ('pendiente', 'en_juego', 'finalizado', 'aplazado');
create type ledger_tipo   as enum ('cuota', 'premio', 'pago', 'ajuste');

-- ---------------------------------------------------------------------------
-- Jugadores
-- ---------------------------------------------------------------------------
create table players (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid unique references auth.users (id) on delete set null,
  nombre      text not null,
  alias       text not null unique,
  email       text unique,
  avatar_url  text,
  is_admin    boolean not null default false,
  activo      boolean not null default true,
  created_at  timestamptz not null default now()
);

comment on column players.user_id is
  'NULL mientras la persona no se haya registrado. El admin ya puede cargar sus boletos.';
comment on column players.alias is
  'Nombre corto que se usa para casar las columnas del Excel. Único e insensible a mayúsculas por el índice de abajo.';

create unique index players_alias_lower_idx on players (lower(alias));

-- ---------------------------------------------------------------------------
-- Temporadas
-- ---------------------------------------------------------------------------
create table seasons (
  id                   uuid primary key default gen_random_uuid(),
  nombre               text not null,
  precio_columna_cents integer not null check (precio_columna_cents > 0),
  fecha_inicio         date,
  fecha_fin            date,
  activa               boolean not null default false,
  created_at           timestamptz not null default now()
);

-- Solo puede haber una temporada activa a la vez.
create unique index seasons_una_activa_idx on seasons (activa) where activa;

-- ---------------------------------------------------------------------------
-- Jornadas
-- ---------------------------------------------------------------------------
create table rounds (
  id                    uuid primary key default gen_random_uuid(),
  season_id             uuid not null references seasons (id) on delete cascade,
  numero                integer not null,
  lae_id_sorteo         text unique,
  lae_jornada           integer,
  estado                round_estado not null default 'borrador',
  abre_at               timestamptz,
  cierra_at             timestamptz,
  es_especial           boolean not null default false,
  precio_override_cents integer check (precio_override_cents > 0),
  publicada_at          timestamptz,
  liquidada_at          timestamptz,
  created_at            timestamptz not null default now(),
  unique (season_id, numero),
  constraint rounds_plazo_coherente check (abre_at is null or cierra_at is null or abre_at < cierra_at)
);

comment on column rounds.lae_id_sorteo is 'id_sorteo de Loterías. Es la clave con la que la ingesta hace upsert sin duplicar.';
comment on column rounds.es_especial   is 'true si el admin ha sustituido alguno de los partidos oficiales.';
comment on column rounds.liquidada_at  is 'Cuándo se repartió el dinero. Informativo: la fuente de verdad es el ledger.';

-- ---------------------------------------------------------------------------
-- Partidos
-- ---------------------------------------------------------------------------
create table matches (
  id                  uuid primary key default gen_random_uuid(),
  round_id            uuid not null references rounds (id) on delete cascade,
  orden               smallint not null check (orden between 1 and 15),
  local               text not null,
  visitante           text not null,
  competicion         text,
  kickoff_at          timestamptz,
  lae_id_local        integer,
  lae_id_visitante    integer,
  provider_fixture_id text,
  estado              match_estado not null default 'pendiente',
  goles_local         smallint check (goles_local >= 0),
  goles_visitante     smallint check (goles_visitante >= 0),
  signo               text check (signo in ('1', 'X', '2')),
  signo_provisional   text check (signo_provisional in ('1', 'X', '2')),
  sustituido_de       text,
  updated_at          timestamptz not null default now(),
  unique (round_id, orden)
);

comment on column matches.orden is
  '1..14 puntúan. El 15 es el Pleno al 15: se guarda por completitud pero NO cuenta para nuestra clasificación.';
comment on column matches.signo is
  'Signo OFICIAL de LAE. Es el único que puntúa. NULL mientras no se publique.';
comment on column matches.signo_provisional is
  'Deducido del marcador en vivo. Solo alimenta la clasificación provisional; nunca se promueve a `signo` automáticamente.';
comment on column matches.sustituido_de is
  'Si el admin cambió este partido en una jornada especial, aquí queda el original de LAE.';

create index matches_round_idx   on matches (round_id, orden);
create index matches_en_juego_idx on matches (estado) where estado = 'en_juego';

-- ---------------------------------------------------------------------------
-- Apuestas · una columna simple por persona y jornada
-- ---------------------------------------------------------------------------
create table bets (
  id         uuid primary key default gen_random_uuid(),
  round_id   uuid not null references rounds (id) on delete cascade,
  player_id  uuid not null references players (id) on delete cascade,
  picks      text[] not null,
  estado     text not null default 'confirmada' check (estado in ('borrador', 'confirmada')),
  origen     text not null default 'excel'      check (origen in ('excel', 'web', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (round_id, player_id),

  -- Siempre 14 posiciones. '-' representa "aún sin marcar" y solo se tolera
  -- en borradores: una columna confirmada tiene que estar completa.
  constraint bets_picks_forma check (
    array_length(picks, 1) = 14
    and picks <@ array['1', 'X', '2', '-']
  ),
  constraint bets_confirmada_completa check (
    estado <> 'confirmada' or not ('-' = any (picks))
  )
);

comment on column bets.picks is
  'Array de 14 signos, indexado por matches.orden. Un array en vez de una tabla hija: el acceso es siempre la columna entera, y `unnest` sigue permitiendo las estadísticas de la oficina.';

create index bets_player_idx on bets (player_id);

-- ---------------------------------------------------------------------------
-- Puntuación por jornada (derivada · la calcula recalcular_jornada)
-- ---------------------------------------------------------------------------
create table round_scores (
  round_id             uuid not null references rounds (id) on delete cascade,
  player_id            uuid not null references players (id) on delete cascade,
  aciertos             smallint not null default 0,
  aciertos_provisional smallint,
  es_ganador           boolean not null default false,
  updated_at           timestamptz not null default now(),
  primary key (round_id, player_id)
);

-- ---------------------------------------------------------------------------
-- Ledger · el saldo de cada persona SIEMPRE es la suma de sus movimientos.
-- Nunca una columna mutable que se pueda desincronizar y nadie sepa por qué.
-- ---------------------------------------------------------------------------
create table ledger (
  id            uuid primary key default gen_random_uuid(),
  player_id     uuid not null references players (id) on delete cascade,
  round_id      uuid references rounds (id) on delete set null,
  tipo          ledger_tipo not null,
  importe_cents integer not null check (importe_cents <> 0),
  fecha         timestamptz not null default now(),
  nota          text,
  created_by    uuid references players (id)
);

comment on column ledger.importe_cents is
  'Negativo = la persona debe (cuota). Positivo = a su favor (premio, pago entregado). El saldo es SUM(importe_cents).';

-- Blindaje de idempotencia: recalcular_jornada no puede duplicar cuotas ni
-- premios por mucho que se llame veinte veces.
create unique index ledger_una_cuota_por_jornada_idx
  on ledger (player_id, round_id) where tipo = 'cuota';
create unique index ledger_un_premio_por_jornada_idx
  on ledger (player_id, round_id) where tipo = 'premio';

create index ledger_player_idx on ledger (player_id, fecha desc);

-- ---------------------------------------------------------------------------
-- Bote
-- ---------------------------------------------------------------------------
create table pot_movements (
  id           uuid primary key default gen_random_uuid(),
  season_id    uuid not null references seasons (id) on delete cascade,
  round_id     uuid references rounds (id) on delete set null,
  aporte_cents integer not null default 0 check (aporte_cents >= 0),
  salida_cents integer not null default 0 check (salida_cents >= 0),
  motivo       text not null,
  fecha        timestamptz not null default now()
);

-- El saldo del bote NO se guarda: se calcula. Así no puede desincronizarse.
comment on table pot_movements is
  'Movimientos del bote. El saldo vivo se obtiene de la vista v_bote_evolucion, nunca de una columna almacenada.';

create index pot_movements_season_idx on pot_movements (season_id, fecha);

-- ---------------------------------------------------------------------------
-- updated_at automático
-- ---------------------------------------------------------------------------
create or replace function touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger bets_touch         before update on bets         for each row execute function touch_updated_at();
create trigger matches_touch      before update on matches      for each row execute function touch_updated_at();
create trigger round_scores_touch before update on round_scores for each row execute function touch_updated_at();
