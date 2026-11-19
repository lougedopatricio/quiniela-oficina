import { test } from 'node:test'
import assert from 'node:assert/strict'
import { nuevaBase } from './helpers.mjs'
import { MARCAS } from '../src/lib/marcas.js'

test('la base acepta exactamente las marcas que sabe dibujar la web', async () => {
  const db = await nuevaBase()
  const { rows: [p] } = await db.query(`insert into players (nombre, alias) values ('Ana', 'ana') returning id`)
  for (const m of MARCAS) await db.query(`update players set marca = $1 where id = $2`, [m.id, p.id])
  await assert.rejects(db.query(`update players set marca = 'dragon' where id = $1`, [p.id]), /players_marca_valida/)
  await db.query(`update players set marca = null where id = $1`, [p.id])
})

test('un participante no puede cambiarse la marca él solo', async () => {
  const db = await nuevaBase()
  const { rows: [u] } = await db.query(`insert into auth.users (email) values ('ana@e.com') returning id`)
  const { rows: [p] } = await db.query(`insert into players (nombre, alias, email) values ('Ana', 'ana', 'ana@e.com') returning id`)
  await db.query(`create or replace function auth.uid() returns uuid language sql stable as $$ select '${u.id}'::uuid $$`)
  await assert.rejects(db.query(`update players set marca = 'pez' where id = $1`, [p.id]), /Solo el administrador/)
  await db.query(`update players set apodo = 'Anita' where id = $1`, [p.id])   // el resto de su perfil, sí
})
