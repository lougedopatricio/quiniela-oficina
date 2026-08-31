import { PGlite } from '@electric-sql/pglite'
import { readFile, readdir } from 'node:fs/promises'
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
    create table auth.users (
      id uuid primary key default gen_random_uuid(),
      email text,
      created_at timestamptz not null default now(),
      last_sign_in_at timestamptz
    );
    create or replace function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
    do $$ begin
      if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
      if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
      if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
    end $$;
    create publication supabase_realtime;
  `)

  // TODAS las migraciones, en orden, no solo las cuatro primeras.
  //
  // Antes se aplicaban 0001-0004 y ya. Eso dejaba a espejo.test.mjs —cuyo
  // trabajo es justo impedir que las dos implementaciones de las reglas se
  // separen— atando reglas.js contra una versión del SQL que ya no es la que
  // corre. Con 0013 el Pleno al 15 pasó a puntuar y el test ni se enteró,
  // porque seguía probando la función vieja.
  //
  // Se leen del directorio en vez de listarlas a mano para que la próxima
  // migración entre sola.
  const archivos = (await readdir(join(raiz, 'supabase', 'migrations')))
    .filter(f => f.endsWith('.sql'))
    .sort()

  for (const f of archivos) {
    let sql = await readFile(join(raiz, 'supabase', 'migrations', f), 'utf8')
    // gen_random_uuid() es núcleo desde PG13; pgcrypto solo hace falta en
    // Supabase por cómo tienen empaquetadas las extensiones.
    sql = sql.replace(/create extension if not exists pgcrypto;/i, '')
    // 0011 monta el botón de sincronizar sobre Vault y pg_net, que son
    // extensiones de Supabase que aquí no existen y que no tocan ninguna regla
    // de negocio. Es lo único que se salta.
    if (f.startsWith('0011')) continue
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
 *
 * El 15 se deja SIN PUNTUAR salvo que se pida otra cosa. No es el defecto de
 * producción —ahí es el pleno, desde 0013— pero sí el contrato con el que se
 * escribieron los tests del reparto: hablan de 14/14 y de "acertar los 14".
 * Dejarlo explícito aquí es lo que permite que esos tests sigan diciendo lo
 * que quieren decir mientras corren contra el SQL de verdad.
 *
 * `pleno: true` lo pone como pleno con resultado exigido, para los tests que
 * sí van a por eso.
 */
export async function crearJornada(db, seasonId, numero, signos, { estado = 'cerrada', pleno = false } = {}) {
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
  await db.query(
    `insert into matches (round_id, orden, local, visitante, signo, modo_puntuacion, exige_resultado)
     values ($1, 15, 'Pleno Local', 'Pleno Visitante', '1', $2, $2 = 'pleno')`,
    [round.id, pleno ? 'pleno' : 'no_puntua']
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
