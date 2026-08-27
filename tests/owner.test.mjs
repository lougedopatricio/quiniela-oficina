import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { nuevaBase } from './helpers.mjs'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..')

// Ceder el panel a alguien de la oficina tiene que ser reversible. Antes no lo
// era: `is_admin` era plano y quien lo tuviera podía quitárselo a quien se lo
// dio. Estos tests van justo a por eso, así que simulan sesiones de verdad
// —auth.uid() apuntando a cada uno— en vez de correr sin sesión, que es el
// camino de confianza y se salta los guardianes.

async function baseConRoles() {
  const db = await nuevaBase()
  for (const f of ['0005_grants.sql', '0006_email_privado.sql', '0007_email_privado_de_verdad.sql',
                   '0009_guard_self_update_sin_sesion.sql', '0014_owner.sql']) {
    const sql = await readFile(join(raiz, 'supabase', 'migrations', f), 'utf8')
    try {
      await db.exec(sql)
    } catch (e) {
      throw new Error(`Fallo aplicando ${f}: ${e.message}`)
    }
  }
  return db
}

/** Crea una persona con su cuenta enlazada y devuelve sus dos ids. */
async function alta(db, nombre, { admin = false, owner = false } = {}) {
  const { rows: [u] } = await db.query(
    `insert into auth.users (email) values ($1) returning id`, [`${nombre}@empresa.com`]
  )
  const { rows: [p] } = await db.query(
    `insert into players (nombre, alias, email, user_id, is_admin, is_owner)
     values ($1, $2, $3, $4, $5, $6) returning id`,
    [nombre, nombre.toLowerCase(), `${nombre}@empresa.com`, u.id, admin, owner]
  )
  return { playerId: p.id, userId: u.id }
}

/** Pone auth.uid() a quien se le diga: a partir de aquí, la base cree que es él. */
const entrarComo = (db, userId) =>
  db.exec(`create or replace function auth.uid() returns uuid language sql stable as $$
             select ${userId ? `'${userId}'::uuid` : 'null::uuid'} $$;`)

const rolesDe = async (db, playerId) => {
  const { rows: [p] } = await db.query(
    `select is_admin, is_owner from players where id = $1`, [playerId]
  )
  return p
}

test('el dueño cuenta como administrador, sin necesidad de marcarle las dos', async () => {
  const db = await baseConRoles()
  const duenyo = await alta(db, 'ana', { owner: true })

  await entrarComo(db, duenyo.userId)
  const { rows: [r] } = await db.query(`select public.is_admin() as admin, public.is_owner() as owner`)

  assert.equal(r.owner, true)
  assert.equal(r.admin, true, 'si el dueño no fuera admin, todas las policies existentes lo dejarían fuera')
})

test('el dueño reparte el administrador', async () => {
  const db = await baseConRoles()
  const duenyo = await alta(db, 'ana', { owner: true })
  const otro = await alta(db, 'bruno')

  await entrarComo(db, duenyo.userId)
  await db.query(`update players set is_admin = true where id = $1`, [otro.playerId])

  assert.equal((await rolesDe(db, otro.playerId)).is_admin, true)
})

test('y lo retira después, que es de lo que se trata', async () => {
  const db = await baseConRoles()
  const duenyo = await alta(db, 'ana', { owner: true })
  const otro = await alta(db, 'bruno', { admin: true })

  await entrarComo(db, duenyo.userId)
  await db.query(`update players set is_admin = false where id = $1`, [otro.playerId])

  assert.equal((await rolesDe(db, otro.playerId)).is_admin, false)
})

test('un administrador NO puede degradar al dueño', async () => {
  // Este es el caso que motivaba todo: dar el panel y que te lo quiten.
  // El dueño lleva las dos marcas, que es como queda tras la migración: quien
  // ya era administrador pasa a dueño sin perder lo que tenía.
  const db = await baseConRoles()
  const duenyo = await alta(db, 'ana', { admin: true, owner: true })
  const admin = await alta(db, 'bruno', { admin: true })

  await entrarComo(db, admin.userId)
  await assert.rejects(
    () => db.query(`update players set is_owner = false where id = $1`, [duenyo.playerId]),
    /Solo el dueño puede cambiar los roles|único dueño/i
  )
  await assert.rejects(
    () => db.query(`update players set is_admin = false where id = $1`, [duenyo.playerId]),
    /Solo el dueño puede cambiar los roles/i
  )
  // Ni de una pasada, cambiando los dos a la vez.
  await assert.rejects(
    () => db.query(`update players set is_admin = false, is_owner = false where id = $1`, [duenyo.playerId]),
    /Solo el dueño puede cambiar los roles|único dueño/i
  )

  assert.deepEqual(await rolesDe(db, duenyo.playerId), { is_admin: true, is_owner: true })
})

test('un administrador no puede nombrarse dueño a sí mismo', async () => {
  const db = await baseConRoles()
  await alta(db, 'ana', { owner: true })
  const admin = await alta(db, 'bruno', { admin: true })

  await entrarComo(db, admin.userId)
  await assert.rejects(
    () => db.query(`update players set is_owner = true where id = $1`, [admin.playerId]),
    /Solo el dueño puede cambiar los roles/i
  )
})

test('un administrador tampoco puede repartir el administrador', async () => {
  // Si pudiera, daría igual quitarle el suyo: se lo devolvería un compinche.
  const db = await baseConRoles()
  await alta(db, 'ana', { owner: true })
  const admin = await alta(db, 'bruno', { admin: true })
  const nadie = await alta(db, 'carla')

  await entrarComo(db, admin.userId)
  await assert.rejects(
    () => db.query(`update players set is_admin = true where id = $1`, [nadie.playerId]),
    /Solo el dueño puede cambiar los roles/i
  )
})

test('nunca se puede quedar la quiniela sin dueño', async () => {
  const db = await baseConRoles()
  const duenyo = await alta(db, 'ana', { owner: true })

  // Ni el propio dueño, que es quien más derecho tendría.
  await entrarComo(db, duenyo.userId)
  await assert.rejects(
    () => db.query(`update players set is_owner = false where id = $1`, [duenyo.playerId]),
    /único dueño/i
  )

  // Ni por SQL sin sesión, que es el camino de confianza: sin dueño nadie
  // podría volver a repartir permisos.
  await entrarComo(db, null)
  await assert.rejects(
    () => db.query(`update players set is_owner = false where id = $1`, [duenyo.playerId]),
    /único dueño/i
  )
})

test('con dos dueños, uno sí puede dejar de serlo', async () => {
  const db = await baseConRoles()
  const uno = await alta(db, 'ana', { owner: true })
  const dos = await alta(db, 'bruno', { owner: true })

  await entrarComo(db, uno.userId)
  await db.query(`update players set is_owner = false where id = $1`, [dos.playerId])

  assert.equal((await rolesDe(db, dos.playerId)).is_owner, false)
  const { rows: [c] } = await db.query(`select count(*)::int as n from players where is_owner`)
  assert.equal(c.n, 1)
})

test('un administrador no puede borrar al dueño para saltarse el guardián', async () => {
  // Sin esto, la vía sería borrar la fila entera en vez de editarla —y por
  // cascada se irían además sus boletos y su caja.
  const db = await baseConRoles()
  const duenyo = await alta(db, 'ana', { owner: true })
  const admin = await alta(db, 'bruno', { admin: true })

  await entrarComo(db, admin.userId)
  await assert.rejects(
    () => db.query(`delete from players where id = $1`, [duenyo.playerId]),
    /Solo el dueño puede borrar a un dueño/i
  )

  const { rows } = await db.query(`select 1 from players where id = $1`, [duenyo.playerId])
  assert.equal(rows.length, 1, 'el dueño sigue ahí')
})

test('quien no es nada sigue sin poder tocar su propio estado', async () => {
  // Lo que ya protegía el guardián de antes no se ha perdido por el camino.
  const db = await baseConRoles()
  await alta(db, 'ana', { owner: true })
  const jugador = await alta(db, 'bruno')

  await entrarComo(db, jugador.userId)
  for (const campo of ['is_admin = true', 'is_owner = true', 'activo = false', `alias = 'otro'`]) {
    await assert.rejects(
      () => db.query(`update players set ${campo} where id = $1`, [jugador.playerId]),
      /Solo el (dueño|administrador)/i,
      `debería rechazar "${campo}"`
    )
  }
})
