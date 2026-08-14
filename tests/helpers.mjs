import { PGlite } from '@electric-sql/pglite'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * Levanta un Postgres de verdad (PGlite = PG17 compilado a WASM) con las
 * migraciones aplicadas. Sin Docker y sin servidor, así que los tests corren
 * también en el CI.
 *
 * Lo que hay que emular de Supabase es poco y está acotado aquí:
 *   · el esquema `auth` y `auth.uid()`, que en los tests devuelve NULL — el
 *     mismo caso que cuando llama el script de ingesta con la service_role key;
 *   · los roles `anon` y `authenticated`, para que las policies del 0003 se
 *     creen tal cual y su sintaxis quede validada;
 *   · la publicación `supabase_realtime`.
 */
export async function nuevaBase() {
  const db = new PGlite()

  await db.exec(`
    create schema if not exists auth;
    create table auth.users (id uuid primary key default gen_random_uuid(), email text);
    create or replace function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
    do $$ begin
      if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
      if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
    end $$;
    create publication supabase_realtime;
  `)

  for (const f of ['0001_schema.sql', '0002_vistas.sql', '0003_rls.sql', '0004_puntuacion.sql']) {
    let sql = await readFile(join(raiz, 'supabase', 'migrations', f), 'utf8')
    // gen_random_uuid() es núcleo desde PG13; pgcrypto solo hace falta en
    // Supabase por cómo tienen empaquetadas las extensiones.
    sql = sql.replace(/create extension if not exists pgcrypto;/i, '')
    try {
      await db.exec(sql)
    } catch (e) {
      throw new Error(`Fallo aplicando ${f}: ${e.message}`)
    }
  }

  return db
}

/** Temporada + jugadores. `precio` en céntimos. */
export async function sembrarTemporada(db, { precio = 200, alias = ['ana', 'bruno', 'carla'] } = {}) {
  const { rows: [season] } = await db.query(
    `insert into seasons (nombre, precio_columna_cents, activa) values ('Test 26/27', $1, true) returning id`,
    [precio]
  )
  const players = {}
  for (const a of alias) {
    const { rows: [p] } = await db.query(
      `insert into players (nombre, alias) values ($1, $2) returning id`,
      [a[0].toUpperCase() + a.slice(1), a]
    )
    players[a] = p.id
  }
  return { seasonId: season.id, players }
}

/**
 * Crea una jornada con sus 15 partidos.
 * `signos` son los 14 que puntúan; `null` = todavía sin publicar (aplazado).
 */
export async function crearJornada(db, seasonId, numero, signos, { estado = 'cerrada' } = {}) {
  const { rows: [round] } = await db.query(
    `insert into rounds (season_id, numero, estado) values ($1, $2, $3) returning id`,
    [seasonId, numero, estado]
  )
  for (let i = 1; i <= 14; i++) {
    await db.query(
      `insert into matches (round_id, orden, local, visitante, signo)
       values ($1, $2, $3, $4, $5)`,
      [round.id, i, `Local ${i}`, `Visitante ${i}`, signos[i - 1] ?? null]
    )
  }
  // El Pleno al 15 existe en la base pero no debe puntuar nunca.
  await db.query(
    `insert into matches (round_id, orden, local, visitante, signo)
     values ($1, 15, 'Pleno Local', 'Pleno Visitante', '1')`,
    [round.id]
  )
  return round.id
}

export async function apostar(db, roundId, playerId, picks) {
  await db.query(
    `insert into bets (round_id, player_id, picks, estado, origen)
     values ($1, $2, $3, 'confirmada', 'admin')`,
    [roundId, playerId, picks]
  )
}

/** Columna de 14 signos con `aciertos` coincidencias respecto a `signos`. */
export function columnaCon(signos, aciertos) {
  const otro = { '1': '2', 'X': '1', '2': 'X' }
  return signos.map((s, i) => (i < aciertos ? s : otro[s]))
}

export async function recalcular(db, roundId) {
  const { rows: [r] } = await db.query(`select recalcular_jornada($1) as res`, [roundId])
  return r.res
}

export async function saldo(db, playerId) {
  const { rows: [r] } = await db.query(
    `select coalesce(sum(importe_cents), 0)::int as s from ledger where player_id = $1`,
    [playerId]
  )
  return r.s
}

export async function bote(db, seasonId) {
  const { rows } = await db.query(`select saldo_cents::int as s from v_bote_actual where season_id = $1`, [seasonId])
  return rows[0]?.s ?? 0
}
